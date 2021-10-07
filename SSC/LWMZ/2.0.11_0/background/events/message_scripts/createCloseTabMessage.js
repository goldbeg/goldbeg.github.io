(function() {
    if (document.getElementById("linewize-message-container") != null) {
        let closeTabMessageElement = null;
        let closeTabContent = null;
        let closeTabMessageFaviconContainer = null;
        let closeTabMessageText = null;
        let newMessage = false;

        // get current close tab message if it exists, otherwise create one
        if (document.getElementById("linewize-close-tab-message")) {
            closeTabMessageElement = document.getElementById("linewize-close-tab-message");
            closeTabMessageFaviconContainer = document.getElementById("linewize-close-tab-message-favicon-container");
            closeTabMessageText = document.getElementById("linewize-close-tab-message-text");
            closeTabContent = document.getElementById("linewize-close-tab-content");

            // update the message text to reflect multiple tab closes
            closeTabMessageText.innerHTML = "Some tabs were closed by your teacher";
        } else {
            // create a new element if there wasn't one before
            newMessage = true;

            closeTabMessageElement = document.createElement("div");
            closeTabMessageElement.id = "linewize-close-tab-message";

            closeTabMessageFaviconContainer = document.createElement("div");
            closeTabMessageFaviconContainer.id = "linewize-close-tab-message-favicon-container";
            closeTabMessageFaviconContainer.className += "LinewizeCloseTabMessage_faviconContainer";

            closeTabContent = document.createElement("div");
            closeTabContent.id = "linewize-close-tab-content";
            closeTabContent.className += "LinewizeCloseTabMessage_content";

            closeTabMessageText = document.createElement("div");
            closeTabMessageText.id = "linewize-close-tab-message-text";
            closeTabMessageText.innerHTML = "A tab was closed by your teacher"
            closeTabMessageText.className += "LinewizeCloseTabMessage_text"

            let closeElement = document.createElement("img");
            closeElement.src = chrome.runtime.getURL("/background/events/message_scripts/Close.svg");
            closeElement.onclick = function(){closeTabMessageElement.remove()};
            closeElement.className += "LinewizeCloseTabMessage_closeButton";
    
            closeTabContent.appendChild(closeTabMessageFaviconContainer);
            closeTabContent.appendChild(closeTabMessageText);
            closeTabContent.appendChild(closeElement);

            closeTabMessageElement.appendChild(closeTabContent);
        }

        let faviconElement = document.createElement("img");
        faviconElement.src = tabFavicon;
        faviconElement.className += "LinewizeCloseTabMessage_favicon";

        closeTabMessageFaviconContainer.appendChild(faviconElement);

        let message_container = document.getElementById("linewize-message-container");
        let messageDuration = 300000;

        closeTabMessageElement.className = "message-element";
        closeTabMessageElement.className += " LinewizeMessageElement";

        if (newMessage) {
            closeTabMessageElement.className += " LinewizeMessageElement--new";
        }

        message_container.appendChild(closeTabMessageElement);

        if (newMessage) {
            fadeInSide(closeTabMessageElement);
        }
        setTimeout(function() {
            fadeOutSide(closeTabMessageElement);
        }, messageDuration);
    }
})();