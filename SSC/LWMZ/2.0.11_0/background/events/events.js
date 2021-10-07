class Updater {
    constructor() {
        this.REAUTH_ALLOWED_TIMER_SECONDS = 600 // 10 minutes

        this.messaging = new Messaging();
        this.chat = new Chat();
        this.eventService = undefined;
        this.pendingEventSource = false;
        this.lastEventMessage = 0;
        this.eventServiceRetryTimeoutSeconds = 1;
        this.eventServiceRetriedWithAuth = false;
        this.lastChatMessage = null;
        this.reauthTimeoutId = undefined;
    }

    getReauthAllowedTimer() {
        return config.reauth_allowed_timer_seconds || this.REAUTH_ALLOWED_TIMER_SECONDS;
    }

    // mitigates a self ddos if event-service goes down - stops all clients trying to reauth at the same time
    getReauthJitterMs() {
        return getRandomInt(0, 90000); // between 0 and 90 seconds
    }

    handle_event_policy_update(event) {
        filtering.reset__verdict_cache();
        configUpdate();
        tabs.check_tabs_for_rule_violations(this.messaging);
    }

    handle_event_message(event) {
        let data = JSON.parse(event.data);
        let ts = data.header.timestampEpochMs;
        const msg = data.msg;
        this.messaging.print_message(msg, ts);
    }

    handle_event_open_tab(event) {
        let data = JSON.parse(event.data);
        let messageContent = data.url;

        if (messageContent.toLowerCase().startsWith("http://") || messageContent.toLowerCase().startsWith("https://")) {
            chrome.tabs.create({url: messageContent});
        } else {
            chrome.tabs.create({url: "http://" + messageContent});
        }
    }
    
    /**
     * Prints a message once the the specified tab
     * has been closed.
     * @param {*} event 
     * @param {*} tab 
     */
    post_close_tab_callback(event, tab) {
        let data = JSON.parse(event.data);
        let ts = data.header.timestampEpochMs;

        this.messaging.print_close_tab_message(
            tab["favIconUrl"],
            ts,
        );
    }

    /**
     * Handle close tab event
     * @param {*} event
     */
    handle_event_close_tab(event) {
        let data = JSON.parse(event.data);

        let tabId = data.tabId;
        let windowId = data.windowId;
        if (tabId && windowId) {
            let parsedtabId = parseInt(tabId);
            // get the list of all tabs to check if we are closing the last tab
            chrome.tabs.query({}, (allTabs) => {
                chrome.tabs.get(parsedtabId, tab => {
                    if (chrome.runtime.lastError) {
                        logging__error("Error closing tab:", chrome.runtime.lastError.message);    
                    } else {
                        tabs.close_tab(parsedtabId, allTabs, () => this.post_close_tab_callback(event, tab));
                    }
                })
            });
        } else {
            logging__error("Error parsing tabId and windowId", tabId, windowId);
        }
    }

    handle_event_p2p_init(event) {
        const data = JSON.parse(event.data)  
        const { channel, signalHost, signalToken, signalExpiryEpochSeconds, remotePeerId, ice } = data
        p2pManager.initSignaler(
            signalToken,
            channel,
            remotePeerId,
        );
        p2pManager.setIce(ice)
    }

    /**
     * Handle new chat arrive event
     * @param {*} event
     */
     handle_event_new_chat_arrive(event) {
         // Show bubble if chat ui is closed
         // or load the new chat if the chat ui is open
         chrome.runtime.sendMessage({ type: 'NEW_MESSAGE', data: event });
         // Don't open chat window if chat is not enabled
         if (event.sender.id !== config.getCurrentUserInfo().user && config.getClassroomChatStatus()) {
             this.chat.show_chat_ui(event.classroomId);
         }
       
     }

    disconnectEventService = () => {
        logging__message("Disconnecting from Event Service");
        if (this.eventService) {
            this.eventService.close();
        }
        this.eventService = undefined;
        this.pendingEventSource = false;
    };

    logReceivedEvent(event) {
        this.eventServiceRetryTimeoutSeconds = 1;
        this.lastEventMessage = Date.now() / 1000;
        logging__debug("Event Message Received", event);
    }

    connectToEventService = () => {
        logging__message("Connecting to v2 Event Service");
        let self = this;
        let device = config.getDeviceId();
        let user = config.getCurrentUserInfo().user;

        const eventServiceUrlv2 = `${config.eventServiceUrl}/events/v2/appliance/${device}/recipient/${user}?events=CONFIG_UPDATE,OPEN_TAB,CLOSE_TAB,MESSAGE,CLASS_STARTED,POLICY_UPDATE,INIT_P2P`;

        if (self.eventService === undefined && !self.pendingEventSource) {
            self.pendingEventSource = true;
            self.eventService = new EventSource(eventServiceUrlv2, {withCredentials: true});

            self.eventService.onerror = function (error) {
                if (!self.eventServiceRetriedWithAuth) {
                    self.disconnectEventService();
                    self._retryEventServiceWithAuth();
                    return;
                }

                logging__error("ERROR WITH EVENT SOURCE", error);
                self.eventServiceRetryTimeoutSeconds *= 2;
                if (self.eventServiceRetryTimeoutSeconds >= 64) {
                    self.eventServiceRetryTimeoutSeconds = 64;
                }

                self.disconnectEventService();
                logging__warning("v2 Event service connect error; sleeping for " + self.eventServiceRetryTimeoutSeconds + "seconds");
                window.setTimeout(self.connectToEventService.bind(self), self.eventServiceRetryTimeoutSeconds*1000);
            }

            self.eventService.onopen = function () {
                self.eventServiceRetriedWithAuth = false;
                clearTimeout(this.reauthTimeoutId);
                self.eventServiceRetryTimeoutSeconds = 1;
            }

            self.eventService.addEventListener('CONFIG_UPDATE', function(event) {
                self.logReceivedEvent(event);
                configUpdate();                
            }, false);
            
            self.eventService.addEventListener('OPEN_TAB', function(event) {
                self.logReceivedEvent(event);

                if (config.isClassroomEnabled()) {
                    self.handle_event_open_tab(event);
                }
            }, false);
            
            self.eventService.addEventListener('CLOSE_TAB', function(event) {
                self.logReceivedEvent(event);

                if(config.isClassroomEnabled()){
                    self.handle_event_close_tab(event);
                }
            }, false);
            
            self.eventService.addEventListener('MESSAGE', function(event) {
                self.logReceivedEvent(event);

                let eventData;

                try {
                    eventData = JSON.parse(event.data)
                } catch (err) {
                    // do nothing
                }
                if (!eventData || (eventData.threadKey && config.isClassroomEnabled())) {
                    self.handle_event_new_chat_arrive(eventData);
                    self.lastChatMessage = eventData;
                } else if (config.isClassroomEnabled()) {
                    self.handle_event_message(event);
                }
                
            }, false);
            
            self.eventService.addEventListener('CLASS_STARTED', function(event) {
                self.logReceivedEvent(event);

                if(config.isClassroomEnabled()){
                    self.handle_event_policy_update(event);
                }
            }, false);
            
            self.eventService.addEventListener('POLICY_UPDATE', function(event) {
                self.logReceivedEvent(event);

                if(config.isClassroomEnabled()){
                    self.handle_event_policy_update(event);
                }                
            }, false);

            self.eventService.addEventListener('INIT_P2P', function(event) {
                self.logReceivedEvent(event);

                let data = JSON.parse(event.data)
                
                if(data.peerAgentId === config.chromeId && config.isClassroomEnabled()) {
                    self.handle_event_p2p_init(event);
                }
            }, false);

            self.pendingEventSource = false;
        }
    };

    _retryEventServiceWithAuth = async () => {
        const self = this;
        try {
            await authenticate.autoAuth();
            this.reauthTimeoutId = setTimeout(() => {
                self.eventServiceRetriedWithAuth = false;
            }, self.getReauthAllowedTimer()*1000 + self.getReauthJitterMs())
            
            self.eventServiceRetriedWithAuth = true;
            self.connectToEventService();
        }
        catch (error) {
            console.error('Failed to authenticate before retrying to connect to event-service, triggering events retry again after timeout')
            self.eventServiceRetryTimeoutSeconds *= 2;
            if (self.eventServiceRetryTimeoutSeconds >= 64) {
                self.eventServiceRetryTimeoutSeconds = 64;
            }
            window.setTimeout(self.connectToEventService.bind(self), self.eventServiceRetryTimeoutSeconds*1000);
        }
    }

    updateChatConfigInfo = () => {
        if (!config.getClassroomChatStatus()) {
            return
        }
        const userInfo = config.getCurrentUserInfo();
        const baseUrl = config.getChatBaseUrl();
        const applianceId = config.getDeviceId();

        this.chat.update_baseUrl_and_user(baseUrl, userInfo.user, applianceId);
    }
}
