class ScreenshotRateLimitError extends Error {}

class SnapshotStreamer {
    constructor(datachannel, maxMessageSize) {
        this.DC_BUFFER_LOW_MARK_BYTES = 0;

        this.maxMessageSize = maxMessageSize;
        this.datachannel = datachannel;
        this.streamInterval;
        this.streamingTab;
        this.streamingWindow;

        this.datachannel.bufferedAmountLowThreshold = this.DC_BUFFER_LOW_MARK_BYTES;
    }

    send(obj) {
        const bin = prepareMessage(obj)

        if (this.lastSendTimeMs) {
            console.log(`DEBUG p2p sending screenshot. Size: ${(bin.length/1000).toFixed(2)}kb, last send (secs): ${((Date.now() - this.lastSendTimeMs)/1000).toFixed(2)}`)
        }
        else {
            console.log(`DEBUG p2p sending screenshot. Size: ${(bin.length/1000).toFixed(2)}kb`)
        }
        this.lastSendTimeMs = Date.now();

        send(this.datachannel, bin, this.maxMessageSize)
    }

    async sendScreenshot() {
        if (!this.streamingTab) {
            return;
        }

        chrome.tabs.get(this.streamingTab, tab => {
            const createScreenshotMessage = (img, tabId, windowId) => ({
                type: "screenshot",
                tab_id: `${windowId}_${tabId}`,
                screenshot: img
            });

            if (tab.active) {
                this.getScreenshot(tab.windowId).then(([img, tabId]) => {
                    // the active tab can change between calling getScreenshot & recieving the screenshot, so we check for that
                    if (img !== undefined && tabId === tab.id) {
                        this.send(createScreenshotMessage(img, tab.id, tab.windowId));
                        screenshotPersister.add(tab.id, img);
                    }
                }).catch(err => {
                    // ignore MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND errors
                    if (err instanceof ScreenshotRateLimitError) {
                        return;
                    } else {
                        // this can happen when trying to capture tabs that we do not have permissions for, e.g. chrome internal
                        // pages / webstore, or data urls.
                        this.send({ "type": "screenshot_unavailable" });
                    }
                })
            } else {
                // if we have a cached screenshot of the background tab, send it
                screenshotPersister.get(tab.id, cachedShot => {
                    if (cachedShot) {
                        console.log("Using cached screenshot");
                        this.send(createScreenshotMessage(cachedShot, tab.id, tab.windowId));
                    } else {
                        this.send({ "type": "screenshot_unavailable" });
                        console.log("Could not upload screenshot, tab is inactive and there is no cached screenshot");
                    }
                })
            }
        })
    }

    startStreaming = (tabId, windowId) => {
        // Ensure streaming can't dupe
        clearInterval(this.streamInterval);
        
        this.switchTab(tabId, windowId);
        this.sendScreenshot();
        this.streamInterval = setInterval(() => {
            if (this.datachannel.bufferedAmount <= this.datachannel.bufferedAmountLowThreshold) {
                this.sendScreenshot();
            }
            else {
                console.log(`DEBUG p2p buffer NOT low, skipping screenshot. Buffered: ${(this.datachannel.bufferedAmount/1000).toFixed(2)}kb, buffer_low_mark: ${(this.datachannel.bufferedAmountLowThreshold/1000).toFixed(2)}`)
            }
        }, 1000);
    }

    endStreaming = () => {
        clearInterval(this.streamInterval);
    }

    switchTab = (tabId, windowId) => {
        this.streamingTab = tabId
        this.streamingWindow = windowId
    }

    getScreenshot(windowId, callback) {
        return new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 30 }, img => {

                if (chrome.runtime.lastError) {
                    if (chrome.runtime.lastError.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
                        reject(new ScreenshotRateLimitError("Exceeded MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND"))
                        return;
                    } else {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                }

                chrome.tabs.query({ active: true, windowId }, (tabs) => {
                    if (tabs.length === 1) {
                        resolve([img, tabs[0].id]);
                    } else {
                        resolve([img, null]);
                    }
                })
            });
        })
    }
}
