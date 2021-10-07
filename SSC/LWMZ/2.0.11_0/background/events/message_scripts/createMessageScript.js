(function() {
    if (document.getElementById("linewize-message-container") != null) {
        let message_container = document.getElementById("linewize-message-container");
        let divElement = document.createElement("div");
        let messageElementId = "message-" + timestamp + "";
        let messageDuration = 300000;
    
        divElement.id = messageElementId;
        divElement.className = "message-element";
        divElement.className += " LinewizeMessageElement LinewizeMessageElement--new";

        let timeElement = document.createElement("div");
        timeElement.className = "LinewizeMessageElement_time";

        let messageDate = new Date(timestamp);
        let messageAmPm = messageDate.getHours() >= 12 ? "pm" : "am";
        timeElement.innerHTML += (messageDate.getHours() % 12 == 0 ? 12 : messageDate.getHours() % 12) + ":" +
                                    (messageDate.getMinutes() < 10 ? "0" + messageDate.getMinutes() : messageDate.getMinutes()) + messageAmPm;
        divElement.appendChild(timeElement);
    
        let messageElement = document.createElement("span");
        messageElement.className = "LinewizeMessageElement_text"
        messageElement.innerHTML += "" + message + "";
        divElement.appendChild(messageElement);
    
        let closeElement = document.createElement("img");
        closeElement.src = chrome.runtime.getURL("/background/events/message_scripts/Close.svg");
        closeElement.onclick = function(){divElement.remove()};
        closeElement.className = "LinewizeMessageElement_closeButton";

        divElement.appendChild(closeElement);
        message_container.appendChild(divElement);

        fadeInSide(divElement);

        setTimeout(function() {
            fadeOutSide(divElement)
        }, messageDuration);
    }
})();