class Tabs {

    constructor() {
        this.activeConfigurations = [];
        this.isFocusActive = false;
        this.isLockActive = false;
        this.scheduledFocusAndLockCheckId = null; 
        this.previousTabsUrls = [];
        this.lastScreenshotUrl = null;
        this.lastScreenshotTime = 0;
        this.pageCompleteSentForURL = false;
    }

    capture_active_tab(windowId, callback) {
        try {
            chrome.tabs.captureVisibleTab(windowId, {format: 'jpeg', quality: 50}, function (img) {
                let sourceImage = new Image();
                let width = 300;
                sourceImage.onload = function () {
                    if (sourceImage.width > width) {
                        let oc = document.createElement('canvas'), octx = oc.getContext('2d');
                        oc.width = sourceImage.width;
                        oc.height = sourceImage.height;
                        octx.drawImage(sourceImage, 0, 0);
                        while (oc.width * 0.5 > width) {
                            oc.width *= 0.5;
                            oc.height *= 0.5;
                            octx.drawImage(oc, 0, 0, oc.width, oc.height);
                        }
                        oc.width = width;
                        oc.height = oc.width * sourceImage.height / sourceImage.width;
                        octx.drawImage(sourceImage, 0, 0, oc.width, oc.height);
                        callback(oc.toDataURL());
                    } else {
                        callback(sourceImage.src);
                    }
                };
                sourceImage.src = img;
            });
        } catch {
            logging__error('captureVisibleTab failed.')
        }
    }

    capture_tab_and_send(pageComplete = false) {

        let self = this;
        if (!config.shouldCaptureScreenshots()) {
            cancelScreenshotUploadInterval();
            return
        }

        let segment = {
            "title": "",
            "url": "",
            "favicon": "",
            "tab_id": "",
            "chrome_id": "",
            "action": "",
            "screenshot": ""
        };

        chrome.tabs.query({}, (queriedAllTabs) => {
            // Filter out tabs that are included in the exception list
            const allTabs = queriedAllTabs.filter((tab) => !CAPTURE_TAB_EXCEPTIONS_URL.includes(tab["url"]));

            chrome.windows.getLastFocused((lastFocused) => {
                logging__message("Capturing Tab: chrome.tabs.query({})", allTabs);
                let otherTabs = [];

                for (let i = 0; i < allTabs.length; i++) {
                    let tab = allTabs[i];
                    let tabId = tab["windowId"] + "_" + tab["id"];
                    let title = tab["title"];
                    let url = tab["url"];
                    let favicon = tab["favIconUrl"];
                    if (tab["active"] && tab["windowId"] === lastFocused["id"]) {
                        segment["tab_id"] = tabId;
                        segment["chrome_id"] = config.chromeId;
                        segment["chrome_window_id"] = 0
                        segment["action"] = "upsert";
                        segment["title"] = title;
                        segment["url"] = url;
                        segment["favicon"] = favicon;
                        segment["tabIndex"] = i;     
                    } else {
                        otherTabs.push({
                            "favIcon": favicon,
                            "tabUrl": url,
                            "title": title,
                            "tab_id": tabId
                        });
                    }
                }
                segment["background_tabs"] = otherTabs;

                if (segment["url"] === "") { 
                    logging__debug('DevTools is the active tab, skipping screenshot');
                    return;
                }

                if (segment["url"].toLowerCase().startsWith("chrome")) {
                    logging__debug(`${segment["url"]} is the active tab, skipping screenshot`);
                    return;
                }
                
                if (self.lastScreenshotUrl === segment["url"]) {
                    // Same URL
                    if (!self.pageCompleteSentForURL && pageComplete) {
                        // We haven't sent the page complete/fully-loaded screenshot for a new URL
                        self.pageCompleteSentForURL = true;
                        logging__debug(`Uploading the 1st pageComplete screenshot for ${segment["url"]}`)
                    } else if (self.lastScreenshotTime + 10 > nowInSeconds()) {
                        logging__debug(`Rapid s'shot upload for ${segment["url"]}, skipping screenshot`)
                        return;
                    }
                } else {
                    // We received a new URL
                    self.lastScreenshotUrl = segment["url"];
                    self.pageCompleteSentForURL = pageComplete;
                }
                
                self.lastScreenshotTime = nowInSeconds();

                self.capture_active_tab(lastFocused["id"], function (img) {
                    logging__message("chrome.tabs.query about to call sendToLinewize");
                    segment["screenshot"] = img;
                    for (let configuration of self.activeConfigurations) {
                        if (is_active(configuration)) {
                            segment["email"] = configuration["identity"];
                            let xhr = new XMLHttpRequest();
                            xhr.open("POST", configuration["endpoint"], true);
                            xhr.setRequestHeader("Content-Type", "application/json");
                            xhr.onreadystatechange = function () {
                                if (xhr.readyState === 4) {
                                    segment.screenshot = "";
                                    if (xhr.status === 200) {
                                        logging__message("Uploaded screen shot of tab", segment);
                                    } else {
                                        logging__error("Failed to upload screen shot of tab", segment);
                                    }

                                    resetScreenshotUploadInterval();
                                }
                            };
                            xhr.send(JSON.stringify(segment));

                            /* If we have multiple active classes,
                                one-screenshot is enough, hence we exit the loop. */
                            break;
                        }
                    }
                })
            });
        });
    }

    tab_removed(tabId) {
        for (let configuration of this.activeConfigurations) {
            if (is_active(configuration)) {
                let segment = {
                    "email": configuration["identity"],
                    "tab_id": tabId,
                    "action": "remove"
                };
                let xhr = new XMLHttpRequest();
                xhr.open("POST", configuration["endpoint"], true);
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.send(JSON.stringify(segment));
            }
        }
    }

    should_focus(configuration) {
        return configuration.apply_focus;
    }

    start_focus(focus_urls) {
        if (this.isFocusActive) {
            this.update_focus(focus_urls);
            return;
        }

        logging__message("starting focus");
        this.add_tabs(focus_urls, () => {
            this.restrict_tabs(focus_urls, () => this.prevent_new_tab());
        });
        this.isFocusActive = true;
    }

    update_focus(focus_urls) {
        logging__message("updating focus with latest focus urls");
        this.allow_new_tabs();
        this.add_tabs(focus_urls, () => {
            this.prevent_new_tab();
        });
    }

    stop_focus(isLockActive=false) {
        if (!this.isFocusActive) {
            return;
        }

        logging__message("stopping focus");
        
        if (!isLockActive) {
            this.allow_new_tabs();
            this.restore_tabs();
        }
        this.isFocusActive = false;
    }

    should_lock(configuration) {
        return config.getLockUrl() && configuration.locked_users.includes(configuration.identity);
    }

    lock_tabs() {
        if (this.isLockActive) {
            return;
        }

        logging__error("starting lock");
        this.add_tabs([config.getLockUrl()], () => {
            this.restrict_tabs([config.getLockUrl()], () => {
                this.prevent_new_tab();
                this.prevent_navigation();
            });
        });
        this.isLockActive = true;
    }

    stop_lock(isFocusActive=false) {
        if (!this.isLockActive) {
            return;
        }

        logging__message("stopping lock");
        this.allow_navigation();
        
        if (!isFocusActive) {
            this.cleanup_tabs([config.getLockUrl()]);
            this.allow_new_tabs();
            this.restore_tabs();
        }
        this.isLockActive = false;
    }

    cleanup_tabs(unwanted_urls) {
        chrome.tabs.query({}, tabs => {
            for (let tab of tabs) {
                for (let url of unwanted_urls) {
                    if (tab.url.indexOf(url) >= 0) {
                        chrome.tabs.remove(tab.id);
                    }
                }
            }
        });
    }

    restrict_tabs(allowed_urls, callback) {    
        chrome.tabs.query({}, tabs => {
            let tabsToRemove = [];
            tabLoop:
            for (let tab of tabs) {
                for (let url of allowed_urls) {
                    if (
                        tab.url.includes(url) || 
                        (tab.pendingUrl && tab.pendingUrl.includes(url)) ||
                        (CHAT_WINDOW_URL && (tab.url === CHAT_WINDOW_URL))
                    ) {
                        // this tab url is part of the focus - don't remove it
                        continue tabLoop;
                    }
                }
                this.previousTabsUrls.push(tab.url);
                tabsToRemove.push(tab.id);
            }

            chrome.tabs.remove(tabsToRemove, callback);
        });
    }

    add_tabs(urls, callback) {
        chrome.tabs.query({}, tabs => {
            let tabsToAdd = [];
            urlLoop:
            for (let url of urls) {
                for (let tab of tabs) {
                    if (tab.url.indexOf(url) >= 0) {
                        // this tab url is part of the focus - no need to add it again
                        continue urlLoop;
                    }
                }
                let protocol = "";
                if (url.indexOf("http") !== 0) {
                    protocol = "http://"
                }
                tabsToAdd.push({url: protocol + url})
            }
            
            this.createTabs(tabsToAdd, callback);
        });
    }

    createTabs(tabs, onCompleteCallback) {
        if (tabs.length === 0) {
            onCompleteCallback();
            return;
        }

        let tabAddCompleteCount = 0;
        for (let tab of tabs) {
            chrome.tabs.create(tab, () => {
                tabAddCompleteCount++;
                if (tabAddCompleteCount === tabs.length) {
                    onCompleteCallback();
                }
            });
        }
    }

    restore_tabs() {
        for (let url of this.previousTabsUrls) {
            chrome.tabs.create({url: url})
        }
        this.previousTabsUrls.length = 0;
    }

    prevent_navigation_handler(details) {
        if (details.url.indexOf("linewize.net") >= 0 || details.url.startsWith('chrome-extension://' + chrome.runtime.id)) {
            return {}
        }
        return {redirectUrl: config.getLockUrl()};
    }

    prevent_navigation() {
        if (!chrome.webRequest.onBeforeRequest.hasListener(this.prevent_navigation_handler)) {
            chrome.webRequest.onBeforeRequest.addListener(this.prevent_navigation_handler,
                {urls: ["<all_urls>"]}, ["blocking"])
        }
    }

    allow_navigation() {
        if (chrome.webRequest.onBeforeRequest.hasListener(this.prevent_navigation_handler)) {
            chrome.webRequest.onBeforeRequest.removeListener(this.prevent_navigation_handler)
        }
    }

    prevent_new_tab() {
        if (!chrome.tabs.onCreated.hasListener(remove_new_tab_handler)) {
            chrome.tabs.onCreated.addListener(remove_new_tab_handler)
        }
    }

    allow_new_tabs() {
        if (chrome.tabs.onCreated.hasListener(remove_new_tab_handler)) {
            chrome.tabs.onCreated.removeListener(remove_new_tab_handler)
        }
    }

    updateActiveConfigurations(activeConfigurations) {
        this.activeConfigurations = activeConfigurations;
        if (config.isClassroomEnabled()) {
            const runningConfigs = this.activeConfigurations.filter(is_active);
            this.runningConfigs = runningConfigs;

            if (runningConfigs.length === 0) {
                // ensure a previous focus and lock that wasn't stopped isn't still affecting the user
                logging__message("no running configs, stopping lock and focus if they are active");
                this.stop_lock();
                this.stop_focus();
            }
            else {
                this.scheduleFocusAndLockCheckAtNextClassEnd();
                let focusApplied, lockApplied;
                for (const c of runningConfigs) {
                    // Handle focus
                    if (this.should_focus(c)) {
                        this.start_focus(c.focus_urls);
                        focusApplied = true;
                    }

                    // Handle lock
                    if (this.should_lock(c)) {
                        this.lock_tabs();
                        lockApplied = true;
                    }
                }

                // deactivate focus and/or lock if it hasn't been applied by a running config.
                this.maybe_deactivate_focus_and_or_lock(focusApplied, lockApplied)
            }
        }
        else {
            logging__message("classroom functionality is disabled, stopping lock and focus if they are active");
            this.stop_lock();
            this.stop_focus();
        }
    }

    /**
     * Helper method for disabling focus and lock if no 'running' configs have applied it. Should only be called immediately after iterating through configs.
     * @param {boolean} isConfigApplyingFocus - is a config applying focus?
     * @param {boolean} isConfigApplyingLock - is a config applying lock?
     */
    maybe_deactivate_focus_and_or_lock(isConfigApplyingFocus, isConfigApplyingLock) {
        if (!isConfigApplyingFocus && !isConfigApplyingLock) {
            this.stop_lock();
            this.stop_focus();
        }
        else if (isConfigApplyingFocus && !isConfigApplyingLock) {
            this.stop_lock(isConfigApplyingFocus);
        }
        else if (isConfigApplyingLock && !isConfigApplyingFocus) {
            this.stop_focus(isConfigApplyingLock);
        }
    }

    /*
     * Find the config that ends soonest and schedule a focus and lock check at the ending time.
     * The check will disable focus/lock if no other runningConfigs have enabled it.
     * Assumes there is at least one config currently running when this function is called.
    */ 
    scheduleFocusAndLockCheckAtNextClassEnd() {
        const timezone = config.getDeviceTimezone();
        const date = new luxon.DateTime.now().setZone(timezone);
        const now = date.toMillis();

        const runningConfigExpiries = [];
        
        this.runningConfigs.forEach(c => {
            /* Patch: timeout can remain set even if it's in the past; no longer being used to determine if a class is active. 
               If this is the case set to zero to simplify further processing. */
            const timeout = (c.timeout*1000 >= now) ? c.timeout : 0;

            // Filter out periods that aren't today, and periods that occur before the timeout
            const todayPeriods = c.periods.filter(p => {
                const nowDayStr = DAY_INT_TO_STR_MAP.get(date.day);
                if (nowDayStr !== p.day) {
                    return false;
                }

                if (timeout) {
                    const timeoutMs = timeout*1000;
                    const periodEnd = date.set({hour: p.endTime/100, minute: p.endTime%100, second:0, millisecond: 0});
                    if (periodEnd < timeoutMs) {
                        return false;
                    }
                }

                return true;
            });

            // Resolve intersection of a timeout and period
            let resolvedTimeout;
            if (timeout) {
                const timeoutMs = timeout*1000;
                for (const p of todayPeriods) {
                    const periodStart = date.set({ hour: p.startTime/100, minute: p.startTime%100, second: 0, millisecond: 0 });
                    const periodEnd = date.set({ hour: p.endTime/100, minute: p.endTime%100, second: 0, millisecond: 0 });
                    if (timeoutMs >= periodStart && timeoutMs <= periodEnd) { // if timeout is between the period start and end
                        resolvedTimeout = periodEnd; // periodEnd is larger or equal, store that as our resolvedTimeout
                        break;
                    }
                }

                if (!resolvedTimeout) { // no collision, use the timeout as is
                    resolvedTimeout = timeoutMs;
                }
            }
            else { // no timeout, use endTime of the active period
                const activePeriod = find_active_period(todayPeriods);
                resolvedTimeout = activePeriod ? date.set({ hour: activePeriod.endTime/100, minute: activePeriod.endTime%100, second: 0, millisecond: 0 }) : null;
            }

            runningConfigExpiries.push(resolvedTimeout);
        });
        runningConfigExpiries.sort((a,b) => a-b); //sorted ascending

        if (runningConfigExpiries.length === 0) { // shouldn't happen, just to be safe
            return;
        }

        const nextConfigEndTime = runningConfigExpiries[0];

        logging__message(`scheduling focus/lock deactivation check to run at next config expiry, unixMs ${nextConfigEndTime}`)
        clearTimeout(this.scheduledFocusAndLockCheckId);
        this.scheduledFocusAndLockCheckId = setTimeout(() => {
            // go through running configs, find out if any running configs are applying lock/focus
            let aConfigIsFocussing, aConfigIsLocking;
            for (const c of this.runningConfigs) {
                if (is_active(c)) { // still need active check as these runningConfigs may have expired by the time this setTimeout runs
                    if (this.should_focus(c)) {
                        aConfigIsFocussing = true;
                    }
                    if (this.should_lock(c)) {
                        aConfigIsLocking = true;
                    }
                }
            }

            // deactivate focus and/or lock if it hasn't been applied by a running config.
            this.maybe_deactivate_focus_and_or_lock(aConfigIsFocussing, aConfigIsLocking)
        }, nextConfigEndTime - now + 1000) // add 1s to be 100% sure the config we're setting an expired timeout for doesn't process as active in the timeout.
    }

    /**
     * Handles closing a tab.
     * @param {*} tabId - ID of the tab to be closed
     * @param {*} allTabs - list of all the tabs currently open
     * @param {*} callback - function that will be called once the tab has been closed.
     */
    close_tab(tabId, allTabs, callback) {
        // if we are closing the last tab, redirect the user
        // to the 'closed tab' page
        if (allTabs.length == 1 && config.getClosedTabUrl()) {
            chrome.tabs.update(tabId, {url: config.getClosedTabUrl()});
        } else {
            let screenShottableTab = null;
            for (let check of allTabs) {
                // check if there are any tabs we can take screenshots of (i.e. not chrome internal pages
                // or empty tabs)
                // if there are none, then open the "closed tab" page
                if (check.url.startsWith("chrome") || check.url === "" || check.id === tabId) {
                    continue;
                }
                screenShottableTab = check;
                break;
            }

            if (!screenShottableTab) {
                chrome.tabs.create({url: config.getClosedTabUrl()});
                chrome.tabs.remove(tabId);
            } else {
                chrome.tabs.remove(tabId, callback);
            }
            
        }
    }

    /**
     * Check all tabs to ensure that none of them violate any new policies.
     * We ping verdict gateway for each tab to check.
     * If there is a match found, the offending tab is closed.
     */
    check_tabs_for_rule_violations(messaging) {
        chrome.tabs.query({}, allTabs => {
            allTabs.forEach(tab => {
                if (tab.url === "" || tab.url.startsWith("chrome")) return;

                let verdict  = filtering.api__get_should_close_tab_on_policy_change(tab.url);

                if (!verdict) {
                    logging__error("Error retrieving verdict on policy update");
                    return;
                }

                if (verdict.verdict === 0) {
                    logging__message("Tab " + tab.id + " matches a blocked rule, closing...");
                    this.close_tab(
                        tab.id,
                        allTabs,
                        () => setTimeout(
                            () => messaging._print_blocked_tab_message(tab["favIconUrl"], tab.id),
                            2000
                        )
                    );
                }
            });
        });
    }
}

let remove_new_tab_handler = tab => {
    chrome.tabs.query({}, tabs => {
        if (tabs.length <= 1) {
            return;
        }

        // allow chat window to launch when internet is paused or focus is on
        if (CHAT_WINDOW_URL && (tab.pendingUrl === CHAT_WINDOW_URL)) {
            return;
        } 

        chrome.tabs.remove(tab.id);
    });
    
};


