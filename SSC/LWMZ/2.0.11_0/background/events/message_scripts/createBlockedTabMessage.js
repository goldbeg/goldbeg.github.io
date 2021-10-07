(function() {
    if (document.getElementById("linewize-message-container") != null) {
        let message_container = document.getElementById("linewize-message-container");
        let divElement = document.createElement("div");
        let messageElementId = "blocked-tab-" + blockedTabId + "";
        let messageDuration = 300000;
    
        divElement.id = messageElementId;
        divElement.className = "message-element";
        divElement.className += " LinewizeMessageElement LinewizeMessageElement--new";

        let timeElement = document.createElement("div");
        timeElement.className = "LinewizeMessageElement_time";

        let faviconElement = document.createElement("img");
        faviconElement.src = tabFavicon;
        faviconElement.className += "LinewizeCloseTabMessage_favicon";

        let closeTabMessageFaviconContainer = document.createElement("div");
        closeTabMessageFaviconContainer.className += "LinewizeCloseTabMessage_faviconContainer";
        closeTabMessageFaviconContainer.appendChild(faviconElement);
    
        let messageElement = document.createElement("span");
        messageElement.className = "LinewizeCloseTabMessage_text";
        messageElement.innerHTML = "Tab was closed when your teacher blocked it";
    
        let closeElement = document.createElement("img");
        closeElement.src = chrome.runtime.getURL("/background/events/message_scripts/Close.svg");
        closeElement.onclick = function(){divElement.remove()};
        closeElement.className = "LinewizeCloseTabMessage_closeButton";

        let closeTabContent = document.createElement("div");
        closeTabContent.className = "LinewizeCloseTabMessage_content";

        closeTabContent.appendChild(closeTabMessageFaviconContainer);
        closeTabContent.appendChild(messageElement);
        closeTabContent.appendChild(closeElement);
        divElement.appendChild(closeTabContent);
        message_container.appendChild(divElement);

        fadeInSide(divElement);

        setTimeout(function() {
            fadeOutSide(divElement);
        }, messageDuration);
    }
})();