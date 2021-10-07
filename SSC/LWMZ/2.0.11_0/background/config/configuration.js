class Config {
    constructor() {
        this.currentUserInfo = {user: undefined};
        this.active_configurations = [];
        this.regions = ["syd-1", "syd-2", "beta-1", "sit"];
        this.pendingConfigCalls = {};
        this.pendingUserIdCalls = {};
        this.active_region = undefined;
        this.device_id = undefined;
        this.parent_device = undefined;
        this.blockpageUrl = undefined;
        this.classwizeEventUrl = undefined;
        this.verdictServerUrl = undefined;
        this.apiDispatcherUrl = undefined;
        this.lockUrl = undefined;
        this.closedTabUrl = undefined;
        this.inside_device_network = false;
        this.google_allow_insecure_chrome = false;
        this.google_classroom_extension_login = false;
        this.disable_extension_outside_network = true;
        this.mobile_agent_config = {};
        this.filter_on_network_enabled = false;
        this.filter_off_network_enabled = false;
        this.classroom_on_network_enabled = false;
        this.classroom_off_network_enabled = false;
        this.local_ip = "0.0.0.0";
        this.userFound = false;
        this.chromeId = undefined;
        this.lastFZProbeCode = 0;
        this.lastFZProbeProvider = "";
        this.userInformation = {
            identifier: "",
            first_name: null,
            last_name: null
        };
        this.chromebook_screenshot_upload_interval_seconds = 10;
        this.classroom_chat_enabled = false;
        this.timezone = "";
        this.reauth_allowed_timer_seconds = undefined;
    }

    getCurrentUserInfo() {
        return this.currentUserInfo;
    }

    getActiveConfigurations() {
        return this.active_configurations;
    }

    getBlockpageUrl() {
        return this.blockpageUrl;
    }

    getClasswizeEventUrl() {
        return this.classwizeEventUrl;
    }

    getVerdictServerUrl() {
        return this.verdictServerUrl;
    }

    getLockUrl() {
        return this.lockUrl;
    }

    getClosedTabUrl() {
        return this.closedTabUrl;
    }

    getApplianceId() {
        return this.device_id;
    }

    getClassroomChatStatus() {
        return this.classroom_chat_enabled;
    }

    getChatBaseUrl() {
        return Config.get_linewize_api_service_url(this.active_region) + "/chat";
    }

    getDeviceId() {
        return this.parent_device || this.device_id;
    }

    getDeviceTimezone() {
        return this.timezone;
    }

    /**
     * @returns {number} milliseconds of how often we should upload screenshot
     */
    getScreenshotUploadInterval() {
        return this.chromebook_screenshot_upload_interval_seconds * 1000;
    }

    /**
     * Helper function that tells us whether we need to capture screenshots
     */
    shouldCaptureScreenshots() {
        return this.isClassroomEnabled() && this.hasActiveClass()
    }

    hasActiveClass() {
        if (this.getActiveConfigurations().length > 0) {
            for (let configuration of this.getActiveConfigurations()) {
                if (is_active(configuration)) {
                    return configuration;
                }
            }
        }

        return null
    };

    //determing connection reporting based on platform and on network config
    isConnectionReportingEnabled(){
        if(this.isPlatformMismatch()){
            return false;
        }

        if(this.isFilteringEnabled()){
            return true; //always connection report when filtering is on
        }
        //if filtering is OFF for ON device network then connection report based on legacy setting
        return this.inside_device_network && this.allow_connections_inside_network;
    }
    
    //Determines whether extension should only be enabled for chromebooks based on platform 
    isPlatformMismatch(){
        return this.enable_extension_chromebooks_only && !isPlatformChromeOs;
    }

    //Determines filtering based on platform, on network and off network config
    isFilteringEnabled(){
        if(this.isPlatformMismatch()){
            return false;
        }
        if(this.inside_device_network){
            return this.filter_on_network_enabled;
        }
        return this.filter_off_network_enabled;
    }

    //Determines classroom based on platform, on network and off network config
    isClassroomEnabled() {
        if(this.isPlatformMismatch()){
            return false;
        }
        if(this.inside_device_network){
            return this.classroom_on_network_enabled;
        }
        return this.classroom_off_network_enabled;
    }

    getYoutubeSafeSearchMode(){
        if(!this.isFilteringEnabled()){
            return null;
        }
        if(this.inside_device_network){
            if(this.safeSearch_on_network_config && this.safeSearch_on_network_config.youtube 
                && this.safeSearch_on_network_config.youtube.enabled){ 

                    return this.safeSearch_on_network_config.youtube.mode;
            }
        }else {
            if(this.safeSearch_off_network_config && this.safeSearch_off_network_config.youtube && 
                this.safeSearch_off_network_config.youtube.enabled){

                return this.safeSearch_off_network_config.youtube.mode;
            }
        }
        return null;
    }

    isBingSafeSearchEnabled(){
        if(this.inside_device_network){
            if(this.safeSearch_on_network_config && this.safeSearch_on_network_config.bing){
                return this.safeSearch_on_network_config.bing.enabled;
            }
        }else {
            if(this.safeSearch_off_network_config && this.safeSearch_off_network_config.bing){
                return this.safeSearch_off_network_config.bing.enabled;
            }
        }
        return false;
    }

    isGoogleSearchEnabled(){
        if(this.inside_device_network){
            if(this.safeSearch_on_network_config && this.safeSearch_on_network_config.google){
                return this.safeSearch_on_network_config.google.enabled;
            }
        }else {
            if(this.safeSearch_off_network_config && this.safeSearch_off_network_config.google){
                return this.safeSearch_off_network_config.google.enabled;
            }
        }
        return false;
    }
   
    //Determines disabling extension based on platform, classroom and filtering config
    isExtensionDisabled(){
        if(this.isPlatformMismatch()){
            return true;
        }
        return !this.isClassroomEnabled() && !this.isFilteringEnabled();
    }

    getAllowInsecureChrome() {
        return this.google_allow_insecure_chrome;
    }

    setLocalIpAddress(ipAddress) {
        this.local_ip = ipAddress;
    }

    updateDeviceLocation(next) {
        let self = this;
        let xhr = new XMLHttpRequest();
        xhr.open("GET", "http://chromelogin.linewize.net/status", true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                /* Reset the flags, could potentially be a very light race condition here, but I doubt it */
                self.inside_device_network__authenticated = false;
                self.inside_device_network = false;

                if (xhr.status !== 404) {
                    self.inside_device_network = true;
                    try {
                        let userStatus = JSON.parse(xhr.responseText)["data"];
                        if (userStatus["loggedin"] && userStatus["user"]) {
                            self.inside_device_network__authenticated = true;
                            self.inside_device_network__user = userStatus["user"];
                            next(true, self.inside_device_network__user, userStatus["device_id"], userStatus["region"]);
                            return;
                        }
                    } catch (e) {
                        /* Not much we can do here apart from set her as false, */
                    }
                }

                /* readystate 4 is done done:
                 * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState */
                next(false);
            }
        };
        xhr.onerror = function () {
            logging__error("Device location probe failed due to network error, setting state to off-network");
            self.inside_device_network__authenticated = false;
            self.inside_device_network = false;
            next(false);
        };
        xhr.timeout = 5000;
        xhr.send();
    }

    retrieve_userConfig(callback, errorCallback) {
        let self = this;
        let oldUser = self.currentUserInfo.user;

        self.updateDeviceLocation((network_identity_provided, provider_username, provided_device_id, provided_region) => {
            try {
                if (network_identity_provided) {
                    self.userFound = true;
                    self.currentUserInfo.user = provider_username;
                    // user override
                    // self.currentUserInfo.user = "student";
                    self.active_region = provided_region;
                    self.device_id = provided_device_id;
                    callback(oldUser !== self.currentUserInfo.user)

                } else {
                    self.getSavedSettings((storedSettings) => {
                        chrome.identity.getProfileUserInfo(userinfo => {
                            if (userinfo && userinfo.email) {
                                // user override
                                // userinfo.email = "student";
                                self.request_userid(userinfo.email, undefined, (user, region, device_id) => {
                                    if (oldUser !== user) {// 5 minutes
                                        logging__message("Identity not supplied by network device and user has changed, using Google account");
                                        userinfo.user = user;
                                        if (self.currentUserInfo.user !== userinfo.user) {
                                            logging__message("Found Google Identity", userinfo);
                                            self.userFound = true;
                                        }
                                        self.currentUserInfo = userinfo;
                                        self.active_region = region;
                                        self.device_id = device_id;
                                    } else if (storedSettings.device_id
                                        && storedSettings.userInfo && storedSettings.active_region) {
                                        logging__message("Identity not supplied by network device but stored settings were found, using storage", storedSettings);
                                        self.device_id = storedSettings.device_id;
                                        // device override
                                        // self.device_id = "device";
                                        self.userFound = true;
                                        self.currentUserInfo = storedSettings.userInfo;
                                        self.active_region = storedSettings.active_region;
                                        callback(oldUser !== self.currentUserInfo.user);
                                    }
                                    callback(oldUser !== self.currentUserInfo.user)
                                }, errorCallback)
                            }
                            logging__error("Cannot determine user, no information provided from chrome or network");
                        });

                    });
                }
            } catch (e) {
                logging__warning("updateDeviceLocation failed", e);
            }
        });
    }

    send_gateway_request(region, config_gateway_url, errorCallback, callbacks) {
        let self = this;
        let xhr = new XMLHttpRequest();
        if (self.pendingConfigCalls[region]) {
            return;
        }
        xhr.open("GET", config_gateway_url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                self.pendingConfigCalls[region] = false;
                if (xhr.status === 200) {
                    try {
                        self.active_configurations.length = 0;
                        self.active_region = region;
                        let dict_response = JSON.parse(xhr.responseText);
                        logging__message("Config Retrieved", region, dict_response);
                        if (dict_response["parent_device"] && dict_response["parent_device"] !== dict_response["device_id"]) {
                            logging__message("Config was for child device, retrieving parent config");
                            self.parent_device = dict_response["parent_device"];
                            self.local_device = dict_response["device_id"];
                            setTimeout(() => {
                                configUpdate(self.local_ip)
                            }, 5000);
                        }
                        let configurations = dict_response["configurations"];
                        //device override
                        // self.device_id = "device";
                        self.device_id = dict_response["device_id"];
                        self.classwizeEventUrl = dict_response["event_service_url"];
                        self.eventServiceUrl = dict_response["event_url"];
                        self.blockpageUrl = dict_response["blockedpage_url"];
                        self.verdictServerUrl = dict_response["verdict_server_url"];
                        self.apiDispatcherUrl = dict_response["api_dispatcher_url"];
                        self.lockUrl = dict_response["lock_url"];
                        self.allow_connections_inside_network = dict_response["allow_connections_inside_network"];
                        self.closedTabUrl = dict_response["closed_tab_url"];
                        self.google_allow_insecure_chrome = dict_response["google_allow_insecure_chrome"];
                        self.google_classroom_extension_login = dict_response["google_classroom_extension_login"];
                        self.enable_extension_chromebooks_only = dict_response["enable_extension_chromebooks_only"];
                        self.mobile_agent_config = self.extractFilteringAndClassroomConfig(dict_response["mobile_agent_config"]);
                        self.userInformation = dict_response["user_information"]; 
                        self.timezone = dict_response["timezone"];                  
                        self.chromebook_screenshot_upload_interval_seconds = dict_response["chromebook_screenshot_upload_interval_seconds"];
                        self.is_teacher = dict_response["is_teacher"]
                        self.reauth_allowed_timer_seconds = dict_response["reauth_allowed_timer_seconds"]
                        // use feature flag to enable chat instead 
                        const featureFlags = dict_response["feature_flags"];
                        self.classroom_chat_enabled =  (featureFlags && featureFlags["classwize-teacher-student-chat"]);

                        for (let localConfig of configurations) {
                            self.active_configurations.push(localConfig)
                        }

                        if (self.classroom_chat_enabled) {
                            self.classroom_chat_enabled = !self.is_teacher;
                        }
                    } catch (e) {
                        logging__error("Failed to parse configuration", e, xhr.response);
                        errorCallback(e)
                    }
                    logging__message("Retrieved Configs", self.active_configurations);
                    for (let configCallback of callbacks) {
                        configCallback(self.active_configurations)
                    }
                } else {
                    logging__warning("Failed to retrieve configuration from the cfg-gateway, error was " + xhr.responseText);
                    self.active_configurations = [];
                }
            }
        };
        self.pendingConfigCalls[region] = true;
        xhr.send();
    }

    //extract on & off network config for filtering and classroom capability
    extractFilteringAndClassroomConfig(serverConfig){
        let self = this;
        if(serverConfig){
            let onNetworkConfig = serverConfig["on_network"];
            let offNetworkConfig = serverConfig["off_network"];
            self.filter_on_network_enabled = onNetworkConfig["filtering"] ? true : false;
            if(self.filter_on_network_enabled){
                self.safeSearch_on_network_config = onNetworkConfig["filtering"]["safeSearch"];
            }
            self.classroom_on_network_enabled = onNetworkConfig["classroom"]["enabled"];
            self.filter_off_network_enabled = offNetworkConfig["filtering"] ? true : false;
            if(self.filter_off_network_enabled){
                self.safeSearch_off_network_config = offNetworkConfig["filtering"]["safeSearch"];
            }
            self.classroom_off_network_enabled = offNetworkConfig["classroom"]["enabled"];
            
        }
    }

    request_userid(user, deviceid, callback, errorCallback) {
        let self = this;
        logging__message("Requesting User Id", user);

        /* Do we already know which region we are in ?*/
        if (self.active_region) {
            logging__message("Checking User Id in region", self.active_region, user);
            let url = Config.get_gateway_url(self.active_region) + "/get/configuration/userid?identity=" + user;
            self.send_userid_request(self.active_region, url, callback, errorCallback);
        } else {
            for (let region of self.regions) {
                logging__message("Unsure which region this user is in, searching", region, user);
                let url = Config.get_gateway_url(region) + "/get/configuration/userid?identity=" + user;
                self.send_userid_request(region, url, callback, errorCallback);
                logging__message("Request Sent", region);
            }
        }
    }

    send_userid_request(region, config_gateway_url, callback, errorCallback) {
        let self = this;
        let xhr = new XMLHttpRequest();
        if (self.pendingUserIdCalls[region]) {
            return;
        }
        xhr.open("GET", config_gateway_url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                self.pendingUserIdCalls[region] = false;
                if (xhr.status === 200) {
                    let user;
                    let device_id;
                    try {
                        let dict_response = JSON.parse(xhr.responseText);
                        logging__message("User Id Retrieved", region, dict_response);
                        user = dict_response["userid"];
                        device_id = dict_response["deviceid"];
                    } catch (e) {
                        errorCallback(e);
                        logging__error("Failed to parse User Id response", e, xhr.response)
                    }

                    logging__message("Retrieved User Id ", user);
                    callback(user, region, device_id)
                } else {
                    errorCallback();
                    logging__warning("failed to retrieve User Id from the cfg-gateway, error was " + xhr.responseText, xhr);
                }
            }
        };
        self.pendingUserIdCalls[region] = true;
        xhr.send();
    }

    static get_gateway_url(region) {
        return "https://configuration-gw." + region + ".linewize.net"
    }

    static get_linewize_api_service_url(region) {
        return "https://api." + region + ".linewize.net";
    }

    //Generate uniqueId based on current user and timestamp
    assignUniqueId(user){
        if(!this.timestamp){
            this.timestamp = Date.now();
        }
        this.chromeId = btoa(user + this.timestamp);
        logging__message("Assigned Chrome Id", this.chromeId); 
    }

    retrieve_configuration(errorCallback, ...callbacks) {
        let self = this;
        logging__message("Retrieving Config Update");
        self.retrieve_userConfig((newUserIdentity = false) => {
            if (self.getCurrentUserInfo().user) {
                self.updateSavedSettings();
                let requestDevice = this.getDeviceId()
                logging__message("Callback called", self.currentUserInfo, requestDevice);
                let configUrl = Config.get_gateway_url(self.active_region) + "/get/configuration/chrome-extension"
                    + "?user=" + self.currentUserInfo.user
                    + "&deviceid=" + requestDevice
                    + "&agt=chrome"
                    + "&ver=" + chrome.runtime.getManifest().version;
                self.assignUniqueId(self.getCurrentUserInfo().user);     
                self.send_gateway_request(self.active_region, configUrl, errorCallback, callbacks);
                logging__message("Request Sent", self.active_region);
            } else {
                
                for (let configCallback of callbacks) {
                    configCallback(self.active_configurations)
                }
            }
        }, errorCallback);
    }

    updateSavedSettings() {
        let self = this;
        let savedObj = {
            device_id: self.device_id,
            userInfo: self.getCurrentUserInfo(),
            active_region: self.active_region
        };
        chrome.storage.sync.set(
            savedObj,
            function () {
                logging__message("Stored new settings", savedObj);
            });
    }

    getSavedSettings(callback) {
        chrome.storage.sync.get((settings) => {
            callback(settings)
        });
    }

}
