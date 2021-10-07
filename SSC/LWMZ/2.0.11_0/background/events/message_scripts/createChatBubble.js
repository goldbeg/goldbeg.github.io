(function() {
	chrome.runtime.sendMessage({config: "chat_status"}, (status) => {
		if (status) {
			createChatBubble();
			chrome.storage.sync.get(["haveShownFakePendo1"], function(result) {
				if (!result.haveShownFakePendo1) {
					showChatPendo = true;
					createChatPendo();
				} else {
					removeChatPendo();
				}
			});
		} else {
			removeChatBubble();
			// Also remove pendo
			removeChatPendo();
		}
	});

	function removeChatPendo() {
		showChatPendo = false;
		// Remove chat pendo
		let chatPendo = document.getElementById("pendoChatContainer");
		if (chatPendo) {
			chatPendo.remove();
		}
	}

	function createChatBubble() {
		let chatIcon = document.getElementById("bubbleId");

		if (!chatIcon) {
			let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			let isDragging = false;
			chatIcon = document.createElement("div");
			chatIcon.id = "bubbleId"
			chatIcon.style.height = "60px";
			chatIcon.style.width = "60px";
			chatIcon.style.position = "fixed";
			chatIcon.style.right = 0;
			chatIcon.style.bottom = 0;
	
			chatIcon.style.zIndex = (Number.MAX_SAFE_INTEGER - 1);
			let chatImage = document.createElement("img");
			chatImage.style.width = "60px";
			chatImage.style.height = "60px";
			chatImage.style.borderRadius = "50%";
			chatImage.style.boxShadow = "0 10px 20px 5px rgba(0, 0, 0, 0.1)";
			chatImage.src = chrome.runtime.getURL("/background/events/message_scripts/bubble.svg");
			chatIcon.appendChild(chatImage);
			
			chatIcon.addEventListener("click", function() {
				// Don't show anything if the Pendo is showing
				if (showChatPendo) {
					return;
				}

				// If we are not dragging, show chat. If we are dragging, set the flag to false
				if (!isDragging) {
					chrome.runtime.sendMessage({ type: 'SHOW_CHAT_UI' });
				} else {
					isDragging = false;
				}
			})
	
			function dragElement(element) {
				chatIcon.onmousedown = dragMouseDown;
				
				function dragMouseDown(e) {
					e = e || window.event;
					e.preventDefault();
					// Get the mouse cursor position at startup:
					pos3 = e.clientX;
					pos4 = e.clientY;
					document.onmouseup = closeDragElement;
					// Call a function whenever the cursor moves:
					document.onmousemove = elementDrag;
				}
	
				function elementDrag(e) {
					// Disallow drag while showing pendo
					if (showChatPendo) {
						return;
					}

					e = e || window.event;
					e.preventDefault();
					// Calculate the new cursor position:
					pos1 = pos3 - e.clientX;
					pos2 = pos4 - e.clientY;
					pos3 = e.clientX;
					pos4 = e.clientY;

					// Check the new positions to ensure user can't drag outside window
					const newTop = element.offsetTop - pos2;
					const newLeft = element.offsetLeft - pos1;
					if (newTop < 0 || (newTop + 60) > window.innerHeight || newLeft < 0 || (newLeft + 60) > window.innerWidth) {
						return;
					}

					// Set the element's new position:
					element.style.top = newTop + "px";
					element.style.left = newLeft + "px";
					// Set the flag to true
					isDragging = true;
				}
	
				function closeDragElement() {
					document.onmouseup = null;
					document.onmousemove = null;			
					chrome.runtime.sendMessage({ type: 'UPDATE_CHAT_BUBBLE_POSITION', 
												imageLeft: chatIcon.offsetLeft - pos2 ,
												imageTop: chatIcon.offsetTop - pos2 });
				}
			}
	
			dragElement(chatIcon);
			document.body.appendChild(chatIcon);
		} else {
			let notificationBubble = document.getElementById("msgCountId");

			if (!notificationBubble) {
				notificationBubble = document.createElement("div");
				notificationBubble.id = "msgCountId"
				notificationBubble.style.height = "24px";
				notificationBubble.style.width = "24px";
				notificationBubble.style.borderRadius = "50%";
				notificationBubble.style.backgroundColor = "#DF2935";
				notificationBubble.style.position = "absolute";
				notificationBubble.style.zIndex = Number.MAX_SAFE_INTEGER 
				notificationBubble.style.top = "-6.67%";
				notificationBubble.style.left = "66.67%";
				notificationBubble.style.alignItems = "center";
				notificationBubble.style.justifyContent = "center";
				notificationBubble.style.display = "flex";
				notificationBubble.style.color = "white";
				notificationBubble.style.fontSize = "12px";
				notificationBubble.style.fontWeight = "bold";
				chatIcon.appendChild(notificationBubble);
			}
	
			// Set the text to the message count
			if (msgCount) {
				notificationBubble.innerText = (msgCount > 9) ? "9+" : msgCount.toString();
				notificationBubble.style.visibility = "visible";
			} else {
				notificationBubble.style.visibility = "hidden";
			}

			// Set position
			if (imageLeft) {
				chatIcon.style.left = imageLeft + "px";
			}
				
			if (imageTop) {
				chatIcon.style.top = imageTop + "px";
			}
		}
	}

	function removeChatBubble() {
		// Close chat window
		chrome.runtime.sendMessage({ type: 'CLOSE_CHAT_UI' });

		let chatIcon = document.getElementById("bubbleId");
		
		if (!chatIcon) {
			return;
		}
	
		return chatIcon.parentNode.removeChild(chatIcon);
	}

	function createChatPendo() {
		let chatPendo = document.getElementById("pendoChatContainer");

		if (!chatPendo) {
			chatPendo = document.createElement("div")

			chatPendo.style.all = "revert";
			chatPendo.style.zIndex = (Number.MAX_SAFE_INTEGER -1);
			chatPendo.id = "pendoChatContainer";
			chatPendo.style.position = "fixed";
			chatPendo.style.bottom = "70px";
			chatPendo.style.right = "8px";

			chatPendo.style.width = "330px";
			chatPendo.style.height = "406px";
			chatPendo.style.padding = "32px 40px";
			chatPendo.style.background = "#FFFFFF";
			chatPendo.style.borderRadius = "3px";
			chatPendo.style.boxShadow = "0px 4px 4px rgba(0, 0, 0, 0.25)";
			
			chatPendo.style.textAlign = "center";
			let pendoWrapper = document.createElement("div");
			pendoWrapper.id = "pendoChatWrapper";
			pendoWrapper.style.all = "revert";
			pendoWrapper.style.position = "relative";
			pendoWrapper.style.height = "380px";
			pendoWrapper.style.width = "330px";
			let pendoChatHeader = document.createElement("div");
			pendoChatHeader.style.all = "revert";
			pendoChatHeader.id ="pendoChatHeader";

			pendoChatHeader.style.display = "flex";

			let closeFunction = function() {
				showFakePendo = false;
				chatPendo.remove();

				// Persist the haveShownFakePendo1 flag
				chrome.storage.sync.set({ "haveShownFakePendo1" : true });

				// Tell everyone about this.
				chrome.runtime.sendMessage({ type: 'CLOSE_FAKE_PENDO' });
			}

			let pendoChatClose = document.createElement("img");
			pendoChatClose.style.all = "revert";
			pendoChatClose.id = "pendoChatClose";
			pendoChatClose.style.marginLeft = "auto";
			pendoChatClose.style.height = "12px";
			pendoChatClose.style.width = "12px";
			pendoChatClose.style.cursor = "pointer";

			pendoChatClose.addEventListener("click", closeFunction);

			pendoChatClose.src = chrome.runtime.getURL("/background/events/message_scripts/closePendo.svg");
			pendoChatHeader.appendChild(pendoChatClose);

			pendoWrapper.append(pendoChatHeader);

			let pendoChatContents = document.createElement("div");
			pendoChatContents.style.all = "revert";
			pendoChatContents.id = "pendoChatContents";
			pendoChatContents.style.height = "405px";

			let pendoChatBetaContainer = document.createElement("div")
			pendoChatBetaContainer.style.all = "revert";
			pendoChatBetaContainer.style.textAlign = "center";
			pendoChatBetaContainer.style.height = "24px";
			pendoChatBetaContainer.style.width = "330px";

			let pendoChatBeta = document.createElement("img");
			pendoChatBeta.style.all = "revert";
			pendoChatBeta.id = "pendoChatBeta";
			pendoChatBeta.src = chrome.runtime.getURL("/background/events/message_scripts/beta.svg");
			pendoChatBetaContainer.appendChild(pendoChatBeta);

			pendoChatContents.appendChild(pendoChatBetaContainer)
			let pendoChatSubtitle = document.createElement("div");
			pendoChatSubtitle.style.all = "revert";
			pendoChatSubtitle.id = "pendoChatSubtitle";
			pendoChatSubtitle.innerText = "Your school has turned on teacher chat";

			pendoChatSubtitle.style.lineHeight = "30px";
			pendoChatSubtitle.style.fontFamily = "Roboto, Open Sans";

			pendoChatSubtitle.style.fontWeight = "500";
			pendoChatSubtitle.style.fontSize = "24px";
			pendoChatSubtitle.style.textAlign = "center";
			pendoChatSubtitle.style.color = "#000000";

			pendoChatContents.appendChild(pendoChatSubtitle);

			let pendoChatDescription = document.createElement("div");
			pendoChatDescription.style.all = "revert";
			pendoChatDescription.id = "pendoChatDescription";
			pendoChatDescription.style.lineHeight = "22px";
			pendoChatDescription.style.fontSize = "14px";
			pendoChatDescription.style.textAlign = "center";
			pendoChatDescription.style.fontFamily = "Roboto, Open Sans";
			pendoChatDescription.style.width = "336px";

			pendoChatDescription.innerText = "Click the chat button to directly message your teacher."

			pendoChatContents.appendChild(pendoChatDescription);
			pendoChatContents.style.all = "revert";
			pendoChatContents.style.color = "#000000";

			let pendoChatImage = document.createElement("img");

			pendoChatImage.style.all = "revert";

			pendoChatImage.src = chrome.runtime.getURL("/background/events/message_scripts/pendo.png");
		
			pendoChatImage.id = "pendoChatImage";

			pendoChatImage.style.height = "181px";
			pendoChatImage.style.width = "336px";
			pendoChatImage.style.padding = "16px 0";
			pendoChatImage.style.width = "100%";
			pendoChatImage.style.objectFit = "cover";

			pendoChatContents.appendChild(pendoChatImage);

			let pendoChatLinks = document.createElement("div");
			pendoChatLinks.style.all = "revert";
			pendoChatLinks.id = "pendoChatLinks";
			pendoChatLinks.style.height = "18px";
			pendoChatLinks.style.width = "330px";
			pendoChatLinks.style.fontSize = "12px";

			pendoChatLinks.style.display = "flex";
			pendoChatLinks.style.justifyContent = "space-between";
		
			let studentLearnMore = document.createElement('a'); 
			studentLearnMore.style.all = "revert";

			studentLearnMore.style.innerHeight = "22px";
			studentLearnMore.style.margin = "0 10px";
			studentLearnMore.style.color = "#0075DB";
			studentLearnMore.style.fontWeight = "bold";
			studentLearnMore.style.fontFamily = "Roboto, Open Sans";
			studentLearnMore.style.fontSize = "14px";
			studentLearnMore.href = "https://dyzz9obi78pm5.cloudfront.net/app/image/id/60ffc732498ccce8297b23c8/n/cw-chat-students-using-classwize-chat.pdf";
			studentLearnMore.target = "_blank";
			studentLearnMore.style.textDecoration = "none";

			studentLearnMore.innerText = "Learn more (Students)";

			let parentsLearnMore = document.createElement('a');
			parentsLearnMore.style.all = "revert";
			parentsLearnMore.innerText = "Learn more (Parents)";
			parentsLearnMore.style.innerHeight = "22px";
			parentsLearnMore.style.margin = "0 10px";
			parentsLearnMore.style.color = "#0075DB";
			parentsLearnMore.style.fontWeight = "bold";
			parentsLearnMore.style.fontFamily = "Roboto, Open Sans";
			parentsLearnMore.style.fontSize = "14px";
			parentsLearnMore.href = "https://dyzz9obi78pm5.cloudfront.net/app/image/id/60ffc735a3abd3de297b23c6/n/cw-chat-parents-faq.pdf";
			parentsLearnMore.target = "_blank";
			parentsLearnMore.style.textDecoration = "none";

			pendoChatLinks.appendChild(studentLearnMore);
			pendoChatLinks.appendChild(parentsLearnMore);
			pendoChatContents.appendChild(pendoChatLinks)

			let footer = document.createElement("div");
			footer.style.all = "revert"; 
			let dismissButton = document.createElement("button");
			dismissButton.style.all = "revert";
			dismissButton.id = "pendoChatDismissButton";
			dismissButton.style.marginTop = "16px";
			dismissButton.innerText = "SEND A MESSAGE";
			dismissButton.style.background = "#0075DB";
			dismissButton.style.borderRadius = "5px";
			dismissButton.style.color = "#FFFFFF";
			dismissButton.style.border = "0px";
			dismissButton.style.height = "50px";
			dismissButton.style.width = "330px";

			dismissButton.addEventListener("click", closeFunction);

			footer.appendChild(dismissButton);
			pendoChatContents.appendChild(footer);
			pendoWrapper.appendChild(pendoChatContents);

			let dialogTriangle = document.createElement("div");
			dialogTriangle.style.all = "revert";
			dialogTriangle.style.height = "15px";
			dialogTriangle.style.width = "15px";
		

			dialogTriangle.style.transform = "rotate(45deg)";
			dialogTriangle.style.backgroundColor = "#FFFFFF";

			dialogTriangle.style.boxShadow = "10px 0 8px -8px rgb(0 0 0 / 25%)";
			dialogTriangle.style.position = "absolute";
			dialogTriangle.style.bottom = "-8px"
			dialogTriangle.style.right = "16px";
		

			chatPendo.appendChild(pendoWrapper);
			chatPendo.appendChild(dialogTriangle);
			document.body.appendChild(chatPendo);

			// Inform that pendo is showing
			chrome.runtime.sendMessage({ type: 'SHOW_FAKE_PENDO_1' });
		}
	}
})()
