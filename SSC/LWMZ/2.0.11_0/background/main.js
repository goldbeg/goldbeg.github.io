let updater = new Updater();
let config = new Config();
let tabs = new Tabs();
let verdict_response_store = new VerdictResponseStore(30);
let connections = new Connections();
let filtering = new Filtering();
let stats = new Stats();
let login = new Login();
let authenticate = new Authenticate();
let p2pManager = new P2PManager()
let screenshotPersister = new ScreenshotPersister();
let loadingConfig = false;
let lastIpAddress = "0.0.0.0";
let isPlatformChromeOs = false;
let scheduledConfigFetcher = new ScheduledConfigFetcher();

// On startup, start in fallback mode until we resolve the user. This ensures we aren't temporarily unfiltered
filtering.noUserFallback = true;

const CHAT_WINDOW_URL = `chrome-extension://${chrome.runtime.id}/background/events/message_scripts/chatWindow.html`;
// Add to list of urls to ignore or not capture e.g. sensitive sites like bank etc
const CAPTURE_TAB_EXCEPTIONS_URL = [
    CHAT_WINDOW_URL,
];

/**
 * screenshotUploadIntervalId is a reference to the intervalId for periodic
 * upload of screenshots.
 */
let screenshotUploadIntervalId = null;

/**
 * Helper function to reset the interval whenever a new screenshot
 * is sent to the backend or config has been updated with ACTIVE class.
 * This function should only be called if class is active.
 */
resetScreenshotUploadInterval = () => {
    // For robustness, cancel any previously set intervalID to avoid memory-leak
    cancelScreenshotUploadInterval();

    screenshotUploadIntervalId = setInterval(()=> {
        tabs.capture_tab_and_send();
    }, config.getScreenshotUploadInterval());
};

/**
 * Helper function cancel the screenshot upload interval.
 */
cancelScreenshotUploadInterval = () => {
    clearInterval(screenshotUploadIntervalId);
};

getClassRoomsConfigurations = () => {
    let classRooms = {};

    for (let configuration of config.getActiveConfigurations()) {
        // For chat, we want to ignore configuration that has is_monitoring_class
        if (!configuration["is_monitoring_class"]) {
            const teachers = configuration.teachers.map((teacher) => teacher.id);
            classRooms[configuration.group] = {
                name: configuration.group_label,
                teachers: teachers,
                teacherInformation : configuration.teacher_information,
                isActive: is_active(configuration),
                chatBlocked: configuration["chat_blocked"] || false,
            };
        }
    }

    return classRooms;
}

addListeners = () => {
    chrome.extension.onMessage.addListener((request, sender, sendResponse) => {
        if (request.config === "chat_status") {
            let showChatBubble = config.getClassroomChatStatus();
            // If we can show chat bubble, check whether there is active class or not.
            if (showChatBubble) {
                currentActiveClass = config.hasActiveClass();
                // we must have an active class and ensure chat is enabled for that class
                if (currentActiveClass && currentActiveClass.hasOwnProperty("chat_blocked")) {
                    showChatBubble = !currentActiveClass["chat_blocked"]
                } else {
                    showChatBubble = false;
                }
            }

            sendResponse(showChatBubble);
        }
        else if (request.config == "chat_info") {
            sendResponse({ "userDetails" : config.getCurrentUserInfo(),
                            "baseUrl" : config.getChatBaseUrl(),
                            "classRooms" : getClassRoomsConfigurations(),
                            "applianceId" : config.getApplianceId() });
        }
    });

    chrome.extension.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.message === "last_chat_message") {
            sendResponse(updater.lastChatMessage);
        }

        if (request.message === "clear_last_chat_message") {
            updater.lastChatMessage = null;
        }
    });
 

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        logging__message("chrome.tabs.onUpdated called with tab status", changeInfo["status"]);

        // Send a screenshot if tab loading is complete    
        if(changeInfo["status"] === "complete") {
            tabs.capture_tab_and_send(true);
            chrome.tabs.executeScript({file: '/background/events/message_scripts/createChatBubble.js'});

        } else if (changeInfo["status"] === "loading") {
            /* Send a partially loaded screenshot, this is a workaround for websites
               that has a lot of ads/verdict request that blocks sshot xhr requests
               TODO: Remove this if-clause when xhr-mediator has been implemented. */
            setTimeout(()=>tabs.capture_tab_and_send(), 250);
        }
    });

    chrome.identity.onSignInChanged.addListener(() => {
        logging__warning("Google Identity Changed");
        setTimeout(() => {
            configUpdate(true);
        }, 3000);
    });

    chrome.tabs.onActivated.addListener(() => {
        logging__message("chrome.tabs.onActivated called");
        // slight delay is required, otherwise captureVisibleTab will return 'undefined' for the new tab
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1213925
        setTimeout(() => tabs.capture_tab_and_send(), 200);
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if (config.isFilteringEnabled()) {
            tabs.tab_removed(removeInfo["windowId"] + "_" + tabId, config.getActiveConfigurations());
        }
    });

    chrome.extension.onMessage.addListener((request, sender, sendResponse) => {
        if (request.greeting === "GetStatus") {
            let response = {
                disabled: config.isExtensionDisabled(),
                chrome_user: config.getCurrentUserInfo().user,
                user_information: config.userInformation,
                extension_login: config.google_classroom_extension_login,
                loading: loadingConfig,
                appliance: {
                    device_id: config.device_id,
                    parent_device: config.parent_device,
                    local_device: config.local_device,
                    inside_network: config.inside_device_network,
                    authenticated: config.inside_device_network__authenticated,
                    network_user: config.inside_device_network__user
                },
                features: {
                    Filtering: config.isFilteringEnabled(),
                    Connections: config.isConnectionReportingEnabled(),
                    Classroom: config.isClassroomEnabled(),
                    ChromebookOnly: config.enable_extension_chromebooks_only
                },
                classes: []
            };

            if (config.getActiveConfigurations().length > 0) {
                for (let configuration of config.getActiveConfigurations()) {
                    if (is_active(configuration)) {
                        response.classes.push({
                            classroom_name: configuration.group_label || configuration.group,
                            teacher_information: safeMapGet(configuration, "teacher_information", null),
                            focused: config.isClassroomEnabled() && configuration.apply_focus,
                            locked: config.isClassroomEnabled() && configuration.locked_users.indexOf(configuration.identity) >= 0,
                            is_monitoring_class: safeMapGet(configuration, "is_monitoring_class", false)
                        });
                    }
                }
            }

            sendResponse(response);
        } else if (request.greeting === "ReloadConfig") {
            configUpdate(true);
        }
    });

    chrome.idle.onStateChanged.addListener(newState => {
        if (newState === "active") {
            configUpdate(true)
        }
    })
};

configUpdate = (allowRetry = false) => {
    logging__message("Starting Config Update");
    if (loadingConfig) {
        logging__message("Config was updating, bombing out");
        return;
    }
    loadingConfig = true;
    let configLoadTimeout = setTimeout(() => {
        logging__error("Config Timeout");
        loadingConfig = false;
        if (allowRetry) {
            setTimeout(() => {
                configUpdate(false);
            }, 5000);
        }
    }, 10000);
    const hadActiveClassBeforeUpdate = !!config.hasActiveClass();
    chrome.extension.sendMessage({greeting: "ReloadingPopup"});
    config.retrieve_configuration((e) => {
            logging__error("Error retrieving config", e, allowRetry);
            loadingConfig = false;
            if (allowRetry) {
                setTimeout(() => {
                    configUpdate(false);
                }, 5000);
            }
        },
        //! Leave this as first callback to ensure an unhandled error in another callback doesn't result in this callback not being called, as it's critical we turn off this fallback flag after configuration is set
        () => {
            filtering.noUserFallback = false;
        },
        () => { 
            clearTimeout(configLoadTimeout)
        },
        () => authenticate.partialFailedCache.clear(),
        updater.connectToEventService.bind(updater),
        updater.updateChatConfigInfo.bind(updater),
        tabs.updateActiveConfigurations.bind(tabs),
        config.updateSavedSettings.bind(config),
        () => {
            const hasActiveClass = !!config.hasActiveClass();
            if (!hadActiveClassBeforeUpdate && hasActiveClass) {
                logging__message("Class was not active before, now it is, taking screenshot", config);
                tabs.capture_tab_and_send()
            }
            logging__message("config.retrieve_configuration finished, about to call loginLook callback", config);
            login.login();
            chrome.extension.sendMessage({greeting: "ReloadPopup"});
            if (hadActiveClassBeforeUpdate !== hasActiveClass) {
                // Since the chat bubble exist in all tabs, we have to tell all of them to hide or show the bubble.
                // We can't just run it on the current tab only.
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach((tab) => {
                        chrome.tabs.executeScript(tab.id, {file: '/background/events/message_scripts/createChatBubble.js'});                    
                    });
                });
            }

            if (config.classroom_chat_enabled) {
                chrome.runtime.sendMessage({type : "CHAT_CONFIG_UPDATE", classRooms : getClassRoomsConfigurations()});
            
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach((tab) => {
                        chrome.tabs.executeScript(tab.id, {file: '/background/events/message_scripts/createChatBubble.js'});                    
                    });
                });
            }
        },
        () => p2pManager.setCloseTimeouts(config),
        (configs) => scheduledConfigFetcher.process(configs),
        () => {
            loadingConfig = false; //Keep me last!
        });
};


addListeners();


getUserIP((ip_address) => {
    if (!loadingConfig && /\d+\.\d+\.\d+\.\d+/.test(ip_address)) {
        logging__warning("Changed networks", ip_address, lastIpAddress);
        let region = config.active_region;

        // since we're clearing the config here, we need to go into fallback until we receive the config to ensure we don't momentarily end up unfiltered - unfiltered occurred when no user is set and we are not already in fallback
        config = new Config();
        filtering.noUserFallback = true;

        config.active_region = region;
        config.setLocalIpAddress(ip_address);
        lastIpAddress = ip_address;
        if (ip_address !== "0.0.0.0") {
            configUpdate(true);
        }
    }
});

interval_login = setInterval(function () {
    login.login();
}, 600000);

whoami_login = setInterval(function () {
    config.updateDeviceLocation((
        network_identity_provided,
        provider_username,
        provided_device_id,
        provided_region) => {
        if (config.currentUserInfo.user !== provider_username) {
            logging__warning("User changed via network");
            configUpdate(true);
        }
    });
}, 180000);

fzbox_poll = setInterval(function () {
    //if extension is disabled we should not send probe to sphirewall to allow filtering by sphirewall
    if(config.isExtensionDisabled()){
        return;
    }
    
    let xhr = new XMLHttpRequest();
    xhr.open("GET", "http://fzbox.tools", true);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4)
            return;

        if (config.lastFZProbeCode !== xhr.status) {
            logging__warning("[http://fzbox.tools] Network safety changed:", xhr.status === 200 ? "Current network is safe" : "Current network is unsafe");
            config.lastFZProbeCode = xhr.status;
            configUpdate(true);
            return
        }

        try {
            let networkProvider = "UNKNOWN";
            if (xhr.getResponseHeader("Content-type") && xhr.getResponseHeader("Content-type").includes("application/json")) {
                networkProvider = JSON.parse(xhr.responseText)["provider"];
            }

            if (config.lastFZProbeProvider !== networkProvider) {
                logging__warning("[http://fzbox.tools] Network provider changed:", networkProvider);
                config.lastFZProbeProvider = networkProvider;
                configUpdate(true);
            }
        } catch (e) {
            logging__error("Encountered error while parsing network information", e)
        }
    };
    xhr.send();
}, 60000);

//check if OS of device is chrome OS
//https://developer.chrome.com/extensions/runtime#type-PlatformOs
chrome.runtime.getPlatformInfo((platformInfo) => {
    isPlatformChromeOs = (platformInfo.os === "cros");
});
