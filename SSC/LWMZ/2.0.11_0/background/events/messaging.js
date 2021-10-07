const MAX_PENDING_MESSAGES = 5
class Messaging {
    constructor() {
        this.pendingMessages = [];
        chrome.tabs.onUpdated.addListener(this.display_pending_messages)
        chrome.windows.onFocusChanged.addListener(windowId => {
            if (windowId !== chrome.windows.WINDOW_ID_NONE) {
                chrome.tabs.query({active: true, windowId}, tabs => {
                    if (tabs.length) {
                        this.display_pending_messages(tabs[0].id, {status: tabs[0].status}, tabs[0])
                    }
                })
            }
        })
    }

    add_message_container() {
        chrome.tabs.executeScript(null, {
            code: "" +
                "    if (document.getElementById(\"linewize-message-container\") == null) {\n" +
                "        var messageContainer = document.createElement('div');\n" +
                "        messageContainer.style = \"position: fixed;\" +\n" +
                "            \"width: 100%;\" +\n" +
                "            \"z-index: 999999999999;\" +\n" +
                "            \"overflow-x: hidden;\" +\n" +
                "            \"text-align: center;\" +\n" +
                "            \"top: 0;\" +\n" +
                "            \"min-height: unset;\" +\n" +
                "            \"height: unset;\" +\n" +
                "            \"font-family: unset;\"\n" +
                "        messageContainer.id = \"linewize-message-container\";\n" +
                "        document.body.appendChild(messageContainer);\n" +
                "    }"
        });
    }

    add_fade_functions(callback) {
        chrome.tabs.executeScript(null, {
            file: "/background/events/message_scripts/addFadeFunctions.js"
        }, callback)
    }

    add_pending_message(message, timestamp) {
        if (this.pendingMessages.length === MAX_PENDING_MESSAGES) {
            this.pendingMessages.shift() // remove the oldest message
        }
        this.pendingMessages.push({message, timestamp})
    }

    display_pending_messages = (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab && tab.active && !tab.url.startsWith('chrome://')) {
            for (let messageItem of this.pendingMessages) {
                const {message, timestamp} = messageItem
                this._print_message(message, timestamp)
            }
            this.pendingMessages.length = 0
        }
    }

    print_message(message, timestamp) {
        chrome.tabs.query({currentWindow:true}, tabs => {
            const activeTab = tabs.find(t => t.active);
            if (!activeTab.url.startsWith('chrome://')) {
                this._print_message(message, timestamp);
                return;
            }

            let targetTab
            for (let tab of tabs) {
                if (!tab.url.startsWith('chrome://')) {
                    targetTab = tab
                    break
                }
            }

            if (targetTab) {
                chrome.tabs.update(targetTab.id, {active: true}, tab => {
                    this._print_message(message, timestamp)
                })
            }
            else {
                this.add_pending_message(message, timestamp)
            }
        });
    };

    print_close_tab_message(tabFavicon, timestamp) {
        chrome.tabs.query({currentWindow:true}, tabs => {
            const activeTab = tabs.find(t => t.active);
            if (!activeTab.url.startsWith('chrome://')) {
                this._print_close_tab_message(tabFavicon, timestamp);
                return;
            }

            let targetTab;
            for (let tab of tabs) {
                if (!tab.url.startsWith('chrome://')) {
                    targetTab = tab
                    break;
                }
            }

            if (targetTab) {
                chrome.tabs.update(targetTab.id, {active: true}, tab => {
                    this._print_close_tab_message(tabFavicon, timestamp)
                });
            }
        });
    }
    
    // this runs a script on the page to check if css has been injected yet,
    // prevents injecting the same CSS into the page every time a message is received
    injectCSSIfNeeded = () => {
        chrome.tabs.executeScript({
            file: "/background/events/message_scripts/shouldInjectCSS.js"
        }, (result) => {
            // if shouldInjectCSS.js returns 'true'
            if (result[0]) {
                chrome.tabs.insertCSS({
                    file: "/background/events/message_scripts/messageStyles.css"
                });
            }
        });
    }

    _print_message(message, timestamp) {
        logging__message("Printing", message, timestamp);
        message = message.split("\n").join('&#xA;').replace(/"/g, "&quot;").replace(/\\/g, "&#92");
        this.add_message_container();
        this.injectCSSIfNeeded();

        const callback = () => chrome.tabs.executeScript({code: "message=\"" + message + "\";timestamp=" + timestamp + ";"},
            chrome.tabs.executeScript(null, {
                file: "/background/events/message_scripts/createMessageScript.js"
            })
        );
        // pass the message scripts as a callback to add_fade_functions to prevent issues
        // with fade functions not loading in time, causing a weird visual glitch.
        this.add_fade_functions(callback);

        // Send a screenshot when message has been displayed, 2sec delay for animation to finish.
        setTimeout(() => tabs.capture_tab_and_send(), 2000);
    }

    _print_close_tab_message(tabFavicon, timestamp) {
        this.add_message_container();
        this.injectCSSIfNeeded();

        const callback = () => chrome.tabs.executeScript({code: "tabFavicon=\"" + tabFavicon + "\";timestamp=" + timestamp + ";"},
            chrome.tabs.executeScript(null, {
                file: "/background/events/message_scripts/createCloseTabMessage.js"
            })
        );
        // pass the message scripts as a callback to add_fade_functions to prevent issues
        // with fade functions not loading in time, causing a weird visual glitch.
        this.add_fade_functions(callback);

        // Send a screenshot when message has been displayed, 2sec delay for animation to finish.
        setTimeout(() => tabs.capture_tab_and_send(), 2000);
    }

    _print_blocked_tab_message(tabFavicon, tabId) {
        this.add_message_container();
        this.injectCSSIfNeeded();

        const callback = () => chrome.tabs.executeScript({code: "tabFavicon=\"" + tabFavicon + "\";blockedTabId=" + tabId + ";"},
            chrome.tabs.executeScript(null, {
                file: "/background/events/message_scripts/createBlockedTabMessage.js"
            })
        );
        // pass the message scripts as a callback to add_fade_functions to prevent issues
        // with fade functions not loading in time, causing a weird visual glitch.
        this.add_fade_functions(callback);

        // Send a screenshot when message has been displayed, 2sec delay for animation to finish.
        setTimeout(() => tabs.capture_tab_and_send(), 2000);
    }
}
