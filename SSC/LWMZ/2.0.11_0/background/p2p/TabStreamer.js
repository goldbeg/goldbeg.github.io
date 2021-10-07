class TabStreamer {
    constructor(channel, maxMessageSize) {
        this.maxMessageSize = maxMessageSize;
        this.datachannel = channel;
        this.streamInterval;
        this.streamingTab;
        this.streamingWindow;

        chrome.tabs.onActivated.addListener(this.handleTabActivated);
    }

    startStreaming = () => {
        clearInterval(this.streamInterval)
        this.streamInterval = setInterval(() => {
            this.sendTabs();
        }, 1000);
    }

    setWindow = (windowId) => {
        this.streamingWindow = windowId;
    }

    endStreaming = () => {
        clearInterval(this.streamInterval);
    }

    sendTabs = () => {
        if (!this.streamingWindow) return;

        //use windows.getLastFocused to set the 'actual' active tab based on the last focused window
        chrome.windows.getLastFocused((lastFocused) => {
                chrome.tabs.query({}, (queriedAllTabs) => {
                    const allTabs = queriedAllTabs.filter((tab) => !CAPTURE_TAB_EXCEPTIONS_URL.includes(tab["url"]));
                    let tabs = [];
                    for (let i = 0; i < allTabs.length; i++) {
                        let tab = allTabs[i];
                        tabs.push({
                            "favIcon": tab["favIconUrl"],
                            "tabUrl": tab["url"],
                            "title": tab["title"],
                            "tab_id": `${tab["windowId"]}_${tab["id"]}`,
                            "active": tab["active"] && tab["windowId"] === lastFocused["id"]
                        });
                    }
                    let message = {}
                    message["type"] = "tab_update";
                    message["tabs"] = tabs
                    const bin = prepareMessage(message)
                    send(this.datachannel, bin, this.maxMessageSize)
                });
            }
        )
    }

       
}
