class ScreenshotPersister {
   constructor() {
      this.db;
      chrome.tabs.onActivated.addListener(this._handleTabActivated);
      chrome.tabs.onUpdated.addListener(this._handleTabUpdated);
      chrome.tabs.onRemoved.addListener(this._handleTabClosed);

      this._openDb();
   }

   _openDb = () => {
      const dbVersion = 1;
      let request = indexedDB.open("screenshotCache", dbVersion);

      request.onsuccess = (event) => {
         console.log("Screenshot cache DB successfully opened");
         this.db = request.result;
         this.db.onerror = function (event) {
            console.error("Something went wrong creating or accessing the screenshotCacheDb");
         }
      }

      // create the store here as it cannot be created in the onsuccess callback
      request.onupgradeneeded = (event) => {
         event.target.result.createObjectStore("screenshotStore");
         console.log("Screenshot cache object store successfully created");
      }
   }

   add(tabId, img) {
      // if there is no tabId, likely a chrome internal page or extension background.
      if (!tabId || !img) {
         console.error(`failed to cache screenshot: tabId ${tabId}, image ${img}`);
         return;
      }

      console.log("Caching screenshot for tab: " + tabId);

      let dbTransaction = this.db.transaction(["screenshotStore"], "readwrite");
      dbTransaction.objectStore("screenshotStore").put(img, tabId.toString());
   }

   remove(tabId) {
      console.log("Deleting cached tab: " + tabId);
      if (!tabId) return;
      let dbTransaction = this.db.transaction(["screenshotStore"], "readwrite");
      dbTransaction.objectStore("screenshotStore").delete(tabId.toString());
   }

   get(tabId, callback) {
      let dbTransaction = this.db.transaction(["screenshotStore"], IDBTransaction.READ_WRITE);
      dbTransaction.objectStore("screenshotStore").get(tabId.toString()).onsuccess = function (event) {
         let img = event.target.result;
         callback(img);
      }
   }

   _handleTabActivated = (info) => {
      // slight delay is required, otherwise captureVisibleTab will return 'undefined' for the new tab
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1213925
      setTimeout(() => this._update(info.tabId, info.windowId), 200);
   }

   _handleTabUpdated = (tabId, changeInfo, tab) => {
      if (tab.active) {
         this._update(tabId, tab.windowId);
      }
   }

   _handleTabClosed = (tab) => {
      this.remove(tab);
   }

   _update(tabId, windowId) {
      this._getScreenshot(windowId, (screenshot, screenshotTabId) => {
         if (screenshotTabId === tabId) {
            this.add(tabId, screenshot);
         } else {
            console.error("Error saving screenshot: tab changed before screenshot could be cached");
         }
      });
   }

   _getScreenshot(windowId, callback) {
      chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 30 }, img => {
         chrome.tabs.query({ active: true, windowId }, (tabs) => {
            if (tabs.length === 1) {
               callback(img, tabs[0].id);
            } else {
               callback(img, null);
            }
         })
      });
   }
}