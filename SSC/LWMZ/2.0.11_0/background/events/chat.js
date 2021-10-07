class Chat {
    constructor() {
        this.bubbleLeft = null;
        this.bubbleTop = null;
        this.windowsId = null;
        this.baseUrl = null;
        this.userName = null;
        this.applianceId = null;
        this.totalUnreadMessages = 0;
        this.chatRequestInitated = false;
        this.retryCount = 0;
        this.fakePendoIsShowing = false;

        chrome.runtime.onMessage.addListener(this.handle_message);
        chrome.windows.onRemoved.addListener(this.chat_window_closed);
        chrome.tabs.onActivated.addListener(this.handle_tab_change);

        // Need to add this so that when user goes to a different url within the same tab
        // the chat bubble is reloaded and placed at the same spot.
        chrome.tabs.onUpdated.addListener((tabId, info) => {
            if (info.status === 'complete') {
                this.show_bubble();
            }
        });
    }

    update_baseUrl_and_user = (baseUrl, userName, applianceId) => {
        this.baseUrl = baseUrl;
        this.userName = userName;
        this.applianceId = applianceId;
    }

    handle_message = (msg) => {
        if (msg.type === 'SHOW_CHAT_UI') {
            // We get this message when user clicks the bubble
            this.show_chat_ui();
        } else if (msg.type === 'UPDATE_CHAT_BUBBLE_POSITION') {
            // Save bubble position every time drags stop
            this.bubbleTop = msg.imageTop;
            this.bubbleLeft = msg.imageLeft;            
        }
        else if (msg.type === 'UPDATE_TOTAL_UNREAD_COUNT') {
            // Save the new total of unread message count and update the bubble for all tabs.
            this.totalUnreadMessages = msg.unreadMessageCount;
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    this.show_bubble(tab.id);
                });
            });
        } else if (msg.type === 'CLOSE_CHAT_UI') {
            // Close the window
            if (this.windowsId) {
                chrome.windows.remove(this.windowsId);
                this.windowsId = null;
            }
        } else if (msg.type === 'SHOW_FAKE_PENDO_1') {
            this.fakePendoIsShowing = true;
        } else if (msg.type === 'CLOSE_FAKE_PENDO') {
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    this.show_bubble(tab.id);
                });
            });

            this.fakePendoIsShowing = false;
            this.show_chat_ui();
        }
    }

    chat_window_closed = (windowsId) => {
        // Reset windowsId to null if it's closed
        if (windowsId && this.windowsId === windowsId) {
            this.windowsId = null;
        }
    }

    handle_tab_change = (obj) => {
        this.show_bubble();
    }

    show_bubble = (tabId) => {
        // If tabId is null, it will execute the script on current tab.
        chrome.tabs.executeScript(tabId,
            {code: 'showChatPendo = false, ' + 'msgCount = ' + this.totalUnreadMessages + ', imageTop = ' + this.bubbleTop + ',  imageLeft = ' + this.bubbleLeft + ';\n'},
            chrome.tabs.executeScript(tabId, {file: '/background/events/message_scripts/createChatBubble.js'})
        );
    }

    show_chat_ui(classroomId) {
        // Don't open any window while pendo is showing
        if (this.fakePendoIsShowing) {
            return;
        }

        if (this.windowsId) {
            chrome.windows.update(this.windowsId, {"focused": true}); 
            chrome.runtime.sendMessage({ type: 'OPEN_CHAT_CLASSROOM', classroomId });
        } else {
            // Create window at bottom right if there is no request initiated.
            // This is important to prevent multiple chat window, which sometimes might happen
            if (!this.chatRequestInitated) {
                // Set the flag
                this.chatRequestInitated = true;
                // Create chat window
                chrome.windows.create({
                    url: chrome.runtime.getURL("/background/events/message_scripts/chatWindow.html"),
                    type: "popup",
                    height: 522,
                    width: 344,
                    left: screen.width - 344,
                    top: screen.height - 522,
                }, (win) => {
                    this.windowsId = win.id;
                    this.chatRequestInitated = false;
                    setTimeout(() => chrome.runtime.sendMessage({ type: 'OPEN_CHAT_CLASSROOM', classroomId }), 500);
                    
                });
            }
        }
    }

    close_chat_window_ui = () => {
        // close chat window if it exists
        if (this.windowsId) {
            chrome.windows.remove(this.windowsId, () => this.windowsId = null);
        } 
    }    
}
