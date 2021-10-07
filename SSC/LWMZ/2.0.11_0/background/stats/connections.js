class Connections {
    constructor(verdict_store) {
        resetStorage();
        this.lastReport = Date.now();
        let self = this;
        chrome.webRequest.onSendHeaders.addListener(function (details) {
                if (self.shouldProcessConnectionObject(details)) {
                    // logging__warning("onSendHeaders", details.requestId);
                    self.updateConnectionObject(details)
                }
            },
            {urls: ["<all_urls>"]},
            ["requestHeaders"]);
        chrome.webRequest.onBeforeRequest.addListener(function (details) {
                if (self.shouldProcessConnectionObject(details) && !filtering.shouldCheckFilter(details)) {
                    // logging__warning("onBeforeRequest", details.requestId);
                    self.updateConnectionObject(details)
                }
            },
            {urls: ["<all_urls>"]},
            ["requestBody"]);
        chrome.webRequest.onHeadersReceived.addListener(
            function (details) {
                if (details.requestId && self.shouldProcessConnectionObject(details)) {
                    // logging__warning("onHeadersReceived", details.requestId);
                    self.updateConnectionObject(details)
                }
            },
            {urls: ["<all_urls>"]},
            ["responseHeaders"]);
        chrome.webRequest.onCompleted.addListener(
            (details) => {
                let reportConnections = self.shouldProcessConnectionObject(details);
                if (details["fromCache"] === false && reportConnections) {
                    self.updateConnectionObject(details);
                }
                //only allow data uploads if connection reporting is enabled
                if(reportConnections){
                    self.uploadData();
                }
            },{urls: ["<all_urls>"]}
        );
    }

    shouldProcessConnectionObject(details) {
        return details
            && (config.isConnectionReportingEnabled())
            && !details.url.toLowerCase().startsWith("chrome")
            && extractHostname(details.url) !== "localhost"
            && config.userFound
            && details.url.toLowerCase().indexOf("linewize.net") === -1
            && !(details.initiator && details.initiator.toLowerCase().startsWith("chrome"))
    }

    getConnectionObject(requestId, message, callback) {
        getStorage(requestId, function (result) {
            let connectionObject = Object.keys(result).length > 0
                ? result[requestId]
                : {
                    id: generateUUID(),
                    app_filtering_denied: false,
                    bypass_code: "",
                    bypass_expiry_time: 0,
                    categoryId: "",
                    destIp: "0.0.0.0",
                    destPort: 0,
                    download: 0,
                    final_connection_object: true,
                    hwAddress: "",
                    httpHost: "0",
                    http_request_uris: [],
                    htmlTitle: undefined,
                    lifetime: 0,
                    packets: 1,
                    sourceIp: config.local_ip,
                    subCategoryId: "",
                    tag: "",
                    time: 0,
                    upload: 1, // This might seem weird, but its needed otherwise connections get filtered by the cloud
                    user: config.getCurrentUserInfo().user,
                    verdict_application_rule: "",
                    noise: false,
                    reportingType: "extension",
                    extensionConnection: false,
                    debug__chrome_verdict_issued: false,
                    debug__chrome_requestId: requestId,
                };
            updateStorage(requestId, connectionObject, function () {
                callback(connectionObject)
            });
        });
    }

    updateConnectionObject(details) {
        let self = this;
        if (details.url && self.shouldProcessConnectionObject(details)) {
            let requestId = details.requestId;
            let domain = extractHostname(details.url);
            this.getConnectionObject(requestId, "updateObject", function (connectionObject) {
                connectionObject.httpHost = domain;
                connectionObject.user = config.getCurrentUserInfo().user;
                connectionObject.time = nowInSeconds();
                connectionObject.lifetime = 0;
                connectionObject.packets = 1;
                connectionObject.protocol = 6;
                connectionObject.hwAddress = "";
                connectionObject.agent = `chrome-extension-${chrome.runtime.getManifest().version}`;
                connectionObject.agent_inside_network = config.inside_device_network;
                connectionObject.final_connection_object = true;
                connectionObject.destPort = extractPort(details.url);
                connectionObject = self.updateConnectionObjectWithVerdict(connectionObject, details);
                let requestUri = extractRequestUri(details.url);
                if (!connectionObject.http_request_uris) {
                    connectionObject["http_request_uris"] = []
                }
                if (connectionObject.http_request_uris.indexOf(requestUri) < 0) {
                    connectionObject.http_request_uris.push(requestUri)
                }
                const searchQuery = filtering.getYoutubeSearchQuery(details);
                if (searchQuery) {
                    connectionObject.http_request_uris.push(
                        `/results?search_query=${encodeURIComponent(searchQuery)}`
                    );
                }
                connectionObject.sourceIp = config.local_ip;
                if (details.ip) connectionObject.destIp = details.ip;

                if (details.requestHeaders) {
                    for (let header of details.requestHeaders) {
                        connectionObject.upload += header.name.length;
                        connectionObject.upload += header.value.length;
                    }
                }
                if (details.responseHeaders) {
                    for (let header of details.responseHeaders) {
                        connectionObject.download += header.name.length;
                        connectionObject.download += header.value.length;

                        if (header.name.toLowerCase() === "content-length") {
                            if (details.method.toLowerCase() === "get") {
                                if (!connectionObject.download) {
                                    connectionObject.download = Number(header.value);
                                } else connectionObject.download += Number(header.value)
                            } else {
                                if (!connectionObject.upload) {
                                    connectionObject.upload = Number(header.value);
                                } else connectionObject.upload += Number(header.value)
                            }
                        }
                    }
                    connectionObject.destIp = details.ip;
                }
                if (details.requestBody) {
                    if (!connectionObject.upload) {
                        connectionObject.upload = Number(roughSizeOfObject(details.requestBody));
                    } else connectionObject.upload += Number(roughSizeOfObject(details.requestBody));
                }
                if (details.tabId) {
                    chrome.tabs.get(details.tabId, tab => {
                        if (!chrome.runtime.lastError && tab.status === "complete") {
                            connectionObject.htmlTitle = tab.title
                        }
                    })
                }
                updateStorage(requestId, connectionObject, function () {
                    // logging__message("Updated Storage", connectionObject)
                });
            });
        }
    }

    updateConnectionObjectWithVerdict(connectionObject, details) {
        let verdict = verdict_response_store.getVerdictResponse(details.requestId, details.url);
        if (!verdict) {
            logging__debug("verdict_response_store miss!", details.requestId);
            let search_query = filtering.getYoutubeSearchQuery(details);
            verdict = filtering.get__verdict(details.url, true, search_query);
            verdict_response_store.setVerdictResponse(details.requestId, details.url, verdict);
        }

        if (verdict.verdict === 0) {
            connectionObject.debug__chrome_verdict_issued = true;
            connectionObject.app_filtering_denied = true;

        } else if (verdict.verdict === 1) {
            connectionObject.debug__chrome_verdict_issued = true;
            connectionObject.app_filtering_denied = false;
        }

        connectionObject.verdict_application_rule = verdict.rule ? verdict.rule.id : "";
        connectionObject.verdict_application_rule = verdict.zoom ? verdict.zoom.group : connectionObject.verdict_application_rule;
        if (verdict.bypass) {
            connectionObject.bypass_code = verdict.bypass.code;
            connectionObject.bypass_expiry_time = verdict.bypass.expiry_time;
        }

        if (verdict.signatures) {
            connectionObject.categoryId = verdict.signatures.category;
            connectionObject.subCategoryId = verdict.signatures.subCategory;
            connectionObject.tag = verdict.signatures.signature;
            if (verdict.signatures.noise) {
                connectionObject.noise = verdict.signatures.noise;
            }
        }

        return connectionObject;
    }

    uploadData() {
        let self = this;
        chrome.storage.local.get(null, function (r) {
            let timeIntervalChecked = self.lastReport < Date.now() - 300000; // 5 minutes = 300,000ms
            if (Object.keys(r).length > 10000 || (Object.keys(r).length && timeIntervalChecked)) {
                logging__message("Upload Data Called", Object.keys(r).length); 
                if (config.local_ip && config.active_region && config.device_id) {
                    self.lastReport = Date.now();
                    logging__message("Uploading Data", config.local_ip, config.active_region, config.device_id);
                    let xhr = new XMLHttpRequest();
                    xhr.timeout = 0;
                    let connectionItems = [];
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {
                            if (xhr.status === 200) {
                                logging__message("Upload Successful", connectionItems.length, xhr)
                            } else {
                                logging__warning("Upload Failed", xhr)
                            }
                        }
                    };

                    for (let requestId in r) {
                        let connectionObject = r[requestId];
                        connectionItems.push(connectionObject);
                        chrome.storage.local.remove(requestId)
                    }

                    let data = {
                        items: connectionItems
                    };

                    xhr.open("POST", "https://stats-xlb." + config.active_region + ".linewize.net/" + config.device_id + "/-/extension", true);
                    // xhr.open("POST", "http://localhost:8183/" + config.device_id + "/-/extension", true);
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.setRequestHeader("Accept", "application/json");
                    let jsonData = JSON.stringify(data);
                    xhr.send(jsonData);
                }
            }
            // Note: The following else-clause is simply flooding our console, enable it when needed
            // else {
            //     logging__debug("Upload Scheduled for " + new Date(self.lastReport + 300000).toUTCString(), new Date().toUTCString());
            // }
        });
    }
}

