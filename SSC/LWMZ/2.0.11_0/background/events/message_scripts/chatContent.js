let userName = null;
let baseUrl = null;
let currentClassroomId = null;
let threadKey = null;
let classRooms = null;
let applianceId = null;
let isThreadedMode = true;
let threadChatMessages = [];
let chatLoadMsgCount = 15;
let chatInitialized = false;
let chatUiSkeletonRendered = false;
let loadedMessageCount = 0;
let lastRenderedLoadedNode = null;
let lastRenderedIncomingNode = null;

let newestMessageTimestamp = null;	// Send message timestamp. This will be used to determine grouping or not

let newestMessage = null;		// Last new message from teacher
let oldestMessage = null;		// Last loaded message (oldest timestamp)

let retryCount = 0;

let displayedMessages = new Set();	// Used to track which message has been displayed
let messagesToSend = {};	// Store request body that will be sent. It's used for retry.
let unreadCount = {};	// For storing unread message count for each class. Need to store this independently.

let userIsScrolling = false;	// This is set when scrolling and reset when finished.

// Max message length
const maxMessageLength = 1000;
// These are available ellipse background colors from design.
const bgColors = ["#973AA8", "#FF9900", "#29D9C2", "#16C7FF", "#FF949B"];
// Constant
const classOnline = "Class is online";
const classOffline = "Class is offline";
const sentBgColor = "#1987d6";
const sendingBgColor = "#0071EB19";	//Equivalent to #0071EB, 10% opacity
// Grouping time limit is 15 minutes, which equals to 900000 ms
const groupingTimeLimit = 900000;

(function() {
	chrome.runtime.sendMessage({config: "chat_info"}, (info) => {
		if (info) {
			userName = info.userDetails.user;
			baseUrl = info.baseUrl;
			classRooms = info.classRooms;
			applianceId = info.applianceId;
			buildThreadUi();
		}
	});

	chrome.runtime.onMessage.addListener(function(msg) {
		if (msg.type === "NEW_MESSAGE") {
			// There are several conditions that need to be handled:
			// - We are in threaded mode. In this case, update unread message count
			// - We are NOT in thread mode (chat view for particular class) and it's for current class 
			// - We are NOT in thread mode (chat view for particular class) and it's NOT for current class
			if (isThreadedMode) {
				// Thread view mode. Update unread count for each class.
				let currentCount = unreadCount[msg.data.classroomId];
				if (!currentCount) {
					currentCount = 1;
				} else {
					currentCount++;
				}
				unreadCount[msg.data.classroomId] = currentCount;

				updateUnreadCount(msg.data.classroomId);
				updateTotalUnreadCount();
			} else {
				// The chat message is for current class.
				if (msg.data.classroomId === currentClassroomId) {
					fetchChats(true);
				} else {
					// The chat message is NOT for current class.
					let currentCount = unreadCount[msg.data.classroomId];
					if (!currentCount) {
						currentCount = 1;
					} else {
						currentCount++;
					}
					unreadCount[msg.data.classroomId] = currentCount;	
					updateUnreadCount(msg.data.classroomId);
					updateTotalUnreadCount();	
				}
			}
		} else if (msg.type === "TOKEN") {
			let body = document.getElementById("chatUiBody");
			removeAllChildNodes(body);
			if (isThreadedMode) {
				buildThreadUi();
			} else {
				loadChatForClass(currentClassroomId);
			}
		} else if (msg.type === "CHAT_CONFIG_UPDATE") {
				classRooms = msg.classRooms;
				refreshChatUi(classRooms);
		} else if (msg.type === "OPEN_CHAT_CLASSROOM") {
			currentClassroomId = msg.classroomId
			loadChatForClass(currentClassroomId)
		}
	});

	let heading = document.getElementById("chatWindowHeader");
	if (heading) {
		heading.addEventListener("click", headingClicked);
	}

	let resizeHandler = function() {
		let chatBody = document.getElementById("chatUiBody");
		if (chatBody) {
			// 58 is the height of input area plus spacing while 60 is the height of header.
			chatBody.style.height = window.innerHeight - 58 - 60 + "px";
		}

		if (!isThreadedMode) {
			let disabledNotification = document.getElementById("disabledNotification");
			if (disabledNotification) {
				// Reduce the width by 32 to take into account margin + padding for both sides
				// and 2 more to take into account border width on both sides
				disabledNotification.style.width = window.innerWidth - 34 + "px";
			}
		}

		let tableBody = document.getElementById("chatThreadsBody");
		if (tableBody) {
			// Height is minus the header which is 60.
			tableBody.style.height = window.innerHeight - 60 + "px";
		}
	}
	// Since there is no way for us prevent resize, then we need to handle it.
	window.addEventListener("resize", resizeHandler);
	window.addEventListener("load", resizeHandler);
})()

function createTimeElement(msgTime) {
	let timestamp = document.createElement("span");
	timestamp.className = "ClassroomChatroom_timeStamp";
	timestamp.innerHTML = msgTime.toLocaleTimeString("en-US", {hour: '2-digit', minute:'2-digit'}).toLowerCase();
	return timestamp;
}

function getDateString(date1) {
	const milliSecondsOneDay = 86400000;
	const day1Day = Math.floor(date1.getTime() / milliSecondsOneDay);
	const todayDay = Math.floor(Date.now() / milliSecondsOneDay);

	if (day1Day === todayDay) {
		return "Today";
	} else if ((todayDay - day1Day) <= 7) {
		return date1.toLocaleDateString("en-US", { weekday: 'long' });
	}

	// Ensure we have 2 digit date
	let dateString = function (date) {
		return (date < 10 ? "0" : "") + date;
	}

	// Return date in this format 07 May 2021
	return  dateString(date1.getDate()) + " " + date1.toLocaleString('default', { month: 'short' }) + " " + date1.getFullYear();
}

function createDateTimeElement(msgDateTime) {
	const dateString = getDateString(msgDateTime);

	let dayContainer = document.createElement("div");
	dayContainer.className = "ClassroomChatroom_date";
	dayContainer.innerHTML = dateString + ", ";
	dayContainer.id = dateString;

	dayContainer.append(createTimeElement(msgDateTime));

	return dayContainer;
}

function removeTimeStamp(parent) {
	if (parent) {
		let dateTime = parent.getElementsByClassName("ClassroomChatroom_date");
		if (dateTime && dateTime.length) {
			dateTime[0].remove();
		}
	}
}

function removeDisplayName(parent) {
	if (parent) {	
		let displayName = parent.getElementsByClassName("ClassroomChat_displayName");
		if (displayName && displayName.length) {
			displayName[0].remove();
		}
	}
}

function hideAvatar(parent) {
	if (parent) {	
		for (node of parent.children) {
			let avatar = node.getElementsByClassName("ClassroomChat_avatar");
			if (avatar && avatar.length) {
				avatar[0].style.visibility = "hidden";
				break;
			}
		}
	}
}

function createChatDisableNotification(message) {
	// Check first whether we have it already or not.
	if (document.getElementById("disabledNotification")) {
		// There is already disabled notification
		return;
	}

	// Make chat input hidden again.
	let inputContainer = document.getElementById("chatInputControl");
	if (inputContainer) {
		inputContainer.style.visibility = "hidden";
	}

	// Create disable notification.
	let container = document.createElement("div");
	container.id = "disabledNotification";
	container.className = "ClassroomChatroom_footer";
	container.style.zIndex = Number.MAX_SAFE_INTEGER;
	// Reduce the width by 32 to take into account margin + padding for both sides
	// and 2 more to take into account border width on both sides
	container.style.width = window.innerWidth - 34 + 'px';

	let msg = document.createElement("div");
	msg.innerHTML = message + " ";
	container.append(msg);

	// Create Learn more link
	let learnMore = document.createElement("span");
    let a = document.createElement('a'); 
    let link = document.createTextNode("Learn more");
    a.append(link); 
    a.href = "https://dyzz9obi78pm5.cloudfront.net/app/image/id/60ffc732498ccce8297b23c8/n/cw-chat-students-using-classwize-chat.pdf";
    a.target= "_blank";
    learnMore.append(a);

	msg.append(learnMore);

	let body = document.getElementById("chatUiBody");
	body.append(container);
}

function removeDisabledNotification() {
	let container = document.getElementById("disabledNotification");
	if (container) {
		container.remove();
	}

	// And make chat input visible again.
	let inputContainer = document.getElementById("chatInputControl");
	if (inputContainer) {
		inputContainer.style.visibility = "visible";
	}
}

function insertDate(parentContainer, date, insertPoint) {
	if (parentContainer) {
		const dateString = date.toLocaleDateString();
		let dayContainer = document.createElement("div");
		dayContainer.className = "ClassroomChatroom_date";
		dayContainer.innerHTML = dateString;
		dayContainer.id = dateString;

		let dailyReminder = document.createElement("div");
		dailyReminder.style.marginTop = "16px";
		dailyReminder.style.color = "#51595D";
		let textNode = document.createTextNode("For your protection, this chat service is logged and monitored by your school district.");
		dailyReminder.append(textNode);
		dayContainer.append(dailyReminder);

		if (!insertPoint) {
			parentContainer.append(dayContainer);
		} else {
			// Check first in case there is already date. This could happen when scrolling up
			// loading older messages
			let oldDate = document.getElementById(dateString);
			if (oldDate) {
				oldDate.remove();
			}

			parentContainer.insertBefore(dayContainer, insertPoint);
		}

		return dayContainer;
	}

	// Should never happen.
	return null;
}

function refreshChatUi(classRooms) {
	if (isThreadedMode) {
		// Need to update classroom status, online or offline
		Object.keys(classRooms).forEach(id => {		
			updateClassActiveStatus(id);
		});
		sortChatThreadView();
	} else {
		// We are in chat mode.
		const chatAllowed = (!classRooms[currentClassroomId].chatBlocked && classRooms[currentClassroomId].isActive);

		if (!chatAllowed) {
			if (classRooms[currentClassroomId].chatBlocked) {
				// Tell student that the teacher blocks chat
				createChatDisableNotification("Your teacher has disabled chat.");
			} else if (!classRooms[currentClassroomId].isActive) {
				// Tell student that chat is disabled if class if offline.
				createChatDisableNotification("Chat is disabled until your class is online again.");
			}
		} else {
			removeDisabledNotification();
		}
	}	
}

function scrollChatToBottom() {
	let conversation = document.getElementById("chatMessageConversation");

	if (conversation) {
		conversation.scrollTop = conversation.scrollHeight;
	}
}

function createSendIndicator(msgId) {
	let sendIndicator = document.createElement("div");
	sendIndicator.id = "sendIndicator" + msgId;
	sendIndicator.className = "ClassroomChatroom_sendStatus";

	return sendIndicator;
}

function createSendProgress() {
	let container = document.createElement("div");
	container.className = "sendStatusContainer";
	
	let progressIcon = document.createElement("img");
	progressIcon.src = "progress.svg";
	container.append(progressIcon);

	let sendingText = document.createElement("span");
	sendingText.style = "padding-left: 3px;"
	sendingText.innerText = "Sending...";
	container.append(sendingText);

	return container;	
}

function createSendFailure(msgId) {
	let container = document.createElement("div");
	container.className = "sendStatusContainer";

	let errorIcon = document.createElement("img");
	errorIcon.src = "error.svg";
	container.append(errorIcon);

	let retryText = document.createElement("span");
	retryText.style = "padding-left: 5px;"
	retryText.innerText = "Failed to send. ";
	container.append(retryText);

	// Create Retry. Don't use href so that user doesn't know
	// what we execute.
	let retry = document.createElement("span");
    retry.innerHTML = "Retry?"
    retry.style.cursor = "pointer";
    retry.style.color = "blue";

    retry.addEventListener("click", function() {
    	// User clicks retry.
		// First, clear the failure indicator
		let sendIndicator = document.getElementById("sendIndicator" + msgId);
		if (sendIndicator) {
			// Clear send progress
			removeAllChildNodes(sendIndicator);

			// Insert send progress indicator.
			sendIndicator.appendChild(createSendProgress());

			// Attempt to send message again
			sendMessageBody(messagesToSend[msgId]);
		}		
    });

	container.append(retry);

	return container;	
}

function createDailyReminder() {
	let dailyReminder = document.createElement("div");
	dailyReminder.id = "dailyReminder";
	dailyReminder.style.textAlign = "center";
	dailyReminder.style.marginTop = "16px";
	dailyReminder.style.color = "#51595D";
	let textNode = document.createTextNode("For your protection, this chat service is logged and monitored by your school district.");
	dailyReminder.append(textNode);

	return dailyReminder;
}

function isDailyReminderDisplayed() {
	return document.getElementById("dailyReminder");
}

// Count total unread count and tell the chat bubble
function updateTotalUnreadCount() {
	let totalUnreadCount = 0;
	Object.keys(classRooms).forEach(id => {
		const count = unreadCount[id];
		if (count && count > 0) {
			totalUnreadCount += count;
		}
	});

	// Send message to the chat object so that it can update the bubble
	chrome.runtime.sendMessage({ type: 'UPDATE_TOTAL_UNREAD_COUNT', 
								 unreadMessageCount: totalUnreadCount });
}

// Remove all child nodes
function removeAllChildNodes(parent) {
	while (parent.firstChild) {
		parent.removeChild(parent.firstChild);
	}
}

function showLoginScreen() {
	chrome.runtime.sendMessage({ message: "last_chat_message" }, (data) => {
		let textMsg = "Let your teacher know it's you";
		let loginMsgBody = "Sign in with your school-associated Google account to send a message";
	
		if (data) {
			let teacherName = "Your teacher";

			if (data.sender && data.sender.id) {
				for (classroomKey in classRooms) {
					const currentClass = classRooms[classroomKey];
					if (currentClass.teacherInformation) {
						const { id, first_name, last_name } = currentClass.teacherInformation
						if (id === data.sender.id && first_name && last_name) {
							teacherName = `${capitalizeString(first_name)} ${capitalizeString(last_name)}`;
							break;
						}
					}
				}
			}

			textMsg = `${teacherName} has sent you a message`;
			loginMsgBody = "Sign in with your school-associated Google account to message them back!";

			chrome.runtime.sendMessage({ message: "clear_last_chat_message" });
		}

		clearChatController();
		const body = document.getElementById("chatUiBody");

		const loginContainer = document.createElement("div");
		loginContainer.style.height = "100%";
		loginContainer.style.display = "flex";
		loginContainer.style.flexDirection = "column";
		loginContainer.style.padding = "32px";
		loginContainer.style.justifyContent = "center";
		loginContainer.style.alignItems = "center";
	
		const loginHeader = document.createElement("p")
		loginHeader.innerHTML = textMsg;
	
		loginHeader.style.marginBottom = "8px";
		loginHeader.style.fontWeight = "700";
		loginHeader.style.fontSize = "16px";
		loginHeader.style.textAlign = "center"
		loginContainer.appendChild(loginHeader);
	
		const loginMessage = document.createElement("p")
		loginMessage.innerHTML = loginMsgBody;
	
		loginMessage.style.marginBottom = "32px";
		loginMessage.style.fontSize = "16px";
		loginMessage.style.textAlign = "center"
		loginContainer.appendChild(loginMessage);
	
		const loginWithGoogleButton = document.createElement("button");
		loginWithGoogleButton.style.border = "1px solid #0075DB";
		loginWithGoogleButton.style.background = "none";
		loginWithGoogleButton.style.padding = "16px 12px";
		loginWithGoogleButton.style.borderRadius = "6px";
		loginWithGoogleButton.style.display = "flex";
		loginWithGoogleButton.style.alignItems = "center";
		loginWithGoogleButton.style.cursor = "pointer";
		loginWithGoogleButton.onclick = () => {
			if (retryCount < 3) {
				chrome.runtime.sendMessage({ type: 'GOOGLE_AUTHENTICATE' });
				retryCount++;
			}
		}
	
		const googleIcon = document.createElement("img");
		googleIcon.id = "googleIcon";
		googleIcon.src = "googleIcon.svg"
		loginWithGoogleButton.append(googleIcon);
	
		const loginText = document.createElement("p");
		loginText.innerHTML = "Sign in with Google"
		loginText.style.color = "#000000";
		loginText.style.fontSize = "16px";
		loginText.style.margin = "0 0 0 8px";
		loginWithGoogleButton.append(loginText);
	
		loginContainer.appendChild(loginWithGoogleButton);
	
		body.appendChild(loginContainer);
	});
}

function clearChatController() {
	let chatHeader = document.getElementById("chatWindowHeader");
	removeAllChildNodes(chatHeader);
	chatHeader.style.borderBottom = "none";

	let body = document.getElementById("chatUiBody");
	removeAllChildNodes(body);
	body.style.borderTop = "none";

	let chatInputControl = document.getElementById("chatInputControl");
	removeAllChildNodes(chatInputControl);

	// Disable notification
	removeDisabledNotification();
}

function headingClicked() {
	if (!isThreadedMode) {
		// Reset current class room as we're back to thread view
		currentClassroomId = null;
		// Clear the displayedMessage set. Otherwise, we won't see anything when user
		// switch to thread view and enter this class again.
		displayedMessages.clear();
		buildThreadUi();
	}
}

function buildThreadUi() {
	clearChatController();

  	isThreadedMode = true;

	let chatHeader = document.getElementById("chatWindowHeader");
	chatHeader.style.borderBottom = "1px solid #C3C3C3";
	
	let cwIcon = document.createElement("img");
	cwIcon.id = "cwIcon";
	cwIcon.src = "chat.svg"
	chatHeader.append(cwIcon);

	let heading = document.createElement("div");
	heading.id = "chatThreadHeading";
	heading.className = "classroomName";
	heading.innerText = "Classwize Chat";
	chatHeader.append(heading);

	let infoIcon = document.createElement("img");
	infoIcon.id = "infoIcon";
	infoIcon.src = "info.svg"
	infoIcon.title = "Learn more";
	infoIcon.style = "cursor: pointer;";
	// Open url when info icon is clicked
	infoIcon.addEventListener("click", () => {
		window.open("https://dyzz9obi78pm5.cloudfront.net/app/image/id/60ffc732498ccce8297b23c8/n/cw-chat-students-using-classwize-chat.pdf", "_blank");
	});

	chatHeader.append(infoIcon);

	let body = document.getElementById("chatUiBody");
	body.style.borderTop = "1px solid #E2E2E2";

	let threads = document.createElement("table");
	threads.style.width = '100%';
	threads.style.borderSpacing = "0px";
	threads.id = "chatThreads";
	body.appendChild(threads);

	let tableBody = document.createElement('tbody');
	tableBody.id = "chatThreadsBody";
	tableBody.style.width = "100%";
	tableBody.style.overflow = "auto";
	tableBody.style.display = "block";
	tableBody.style.height = window.innerHeight - 60 + "px";
	threads.appendChild(tableBody);

	Object.keys(classRooms).forEach(id => {		
		let thread = chatThreadElement(id);
		let row = document.createElement("tr");
		let cell = document.createElement("td");
		cell.style.width = "100%";
		cell.style.borderBottom = "1px solid #F2F2F2";
		cell.append(thread);
		row.append(cell);
		// Need last column to support resize
		row.append(document.createElement("td"));
		tableBody.append(row);
	});

	sortChatThreadView();
}

function scrollLoadMore(event) {
	if (event.target.scrollTop === 0) {
		userIsScrolling = true;
		fetchChats();
	}
}

// Try to get the index of the current class id. It will be used to select class icon color. 
function findColorIndex() {
	const classRoomIds = Object.keys(classRooms);
	return classRoomIds.indexOf(currentClassroomId);
}

function buildChatUiHeading() {
	clearChatController();

	isThreadedMode = false;

	let chatHeader = document.getElementById("chatWindowHeader");
	chatHeader.style.borderBottom = "1px solid #C3C3C3";

	// Add left Arrow
	let arrowLeft = document.createElement("i");
	arrowLeft.id = "arrowLeft";
	arrowLeft.className = "ClassroomChat_arrowLeft";
	chatHeader.append(arrowLeft);

	let className = classRooms[currentClassroomId].name || currentClassroomId;

	// Add class room ellipse
	let classEllipse = document.createElement("div");
	classEllipse.id = "classEllipse";
	classEllipse.className = "ClassroomChat_classEllipse";
	classEllipse.style.backgroundColor = bgColors[findColorIndex() % bgColors.length];

	// Display the first letter of class name 
	classEllipse.innerHTML = className ? className[0].toUpperCase() : "T";
	
	chatHeader.append(classEllipse);

	// Add Classname
	let classRoomName = document.createElement("div");
	classRoomName.id = "classNameHeading";
	classRoomName.className = "ClassroomChatroom_nameHeading";
	classRoomName.innerText = className;

	// show classroom status for now
	const isClassActive = classRooms[currentClassroomId].isActive;
	let teacher = document.createElement("div");
	teacher.id = "classTeacherName";
	teacher.className = "ClassroomChatroom_teacherHeading";
	teacher.innerText = !isClassActive ? classOffline: classOnline;

	classRoomName.append(teacher);
	chatHeader.append(classRoomName);
}

function buildChatUi(newMessage) {
	// This function can be called multiple times so, we need a flag to avoid multiple redraws.
	if (!chatUiSkeletonRendered) {
		buildChatUiHeading();

		let body = document.getElementById("chatUiBody");
		body.style.borderTop = "1px solid #E2E2E2";

		let conversation = document.createElement("div"); 
		conversation.id = "chatMessageConversation";
		conversation.addEventListener('scroll', scrollLoadMore);
		body.appendChild(conversation);

		// Add loading progress.
		let progressContainer = document.createElement("div");
		progressContainer.id = "loadingProgress";
		progressContainer.className = "ClassroomChatroom_information";
		let progressImage = document.createElement("img");
		progressImage.src = "loading.svg";
		progressContainer.append(progressImage);
		let loadingText = document.createElement("div");
		loadingText.style.marginTop = "16px";
		loadingText.innerHTML = "Loading messages";
		progressContainer.append(loadingText);

		conversation.append(progressContainer);

		// Add chat controller (text input and send button)
		let chatInputController = document.getElementById("chatInputControl");

		let inputTextContainer = document.createElement("div");
		inputTextContainer.className = "ClassroomChatroom_textAreaContainer";

		let inputText = document.createElement("textarea");
		inputText.className = "ClassroomChatroom_textArea";
		inputText.id = "chatInput";
		inputText.autocomplete = "off";
		inputText.rows = 1;
		inputText.maxLength = maxMessageLength;
		inputText.placeholder = "Type a message";
		// Start of as disabled as we don't allow user to send message while loading messages.
		inputText.disabled = true;

		inputTextContainer.append(inputText);

		let sendIcon = document.createElement("input");
		sendIcon.type = "image";
		sendIcon.id = "sendIcon";
		sendIcon.src = "sendDisabled.svg"
		sendIcon.style.cursor = "pointer";
		sendIcon.style.paddingRight = "8px";
		sendIcon.disabled = true;

		chatInputController.append(inputTextContainer);
		chatInputController.append(sendIcon);

		let updateSendIcon = function() {
			sendIcon.disabled = inputText.value.length === 0 || inputText.value.length >= maxMessageLength;
			sendIcon.src = sendIcon.disabled ? "sendDisabled.svg" : "sendEnabled.svg";
		}

		function resize() {
			inputText.style.height = "auto";
			inputText.style.height = inputText.scrollHeight + "px";
		}
		
		function delayedResize () {
			window.setTimeout(resize, 0);
		}

		sendIcon.addEventListener("click", sendMessage);
		inputText.addEventListener("keydown", event => {
			if (event.key === "Enter" && inputText.textLength < maxMessageLength) {
				event.preventDefault();
				sendMessage();
				updateSendIcon();
			}

			delayedResize();			
		});

		inputText.addEventListener("input", () => {
			updateSendIcon();
			resize();
		});

		chatUiSkeletonRendered = true;

		// Check whether chat is allowed or not and update the ui accordingly
		refreshChatUi(classRooms);

		let observe;
		if (window.attachEvent) {
			observe = function (element, event, handler) {
				element.attachEvent('on'+event, handler);
			};
		}
		else {
			observe = function (element, event, handler) {
				element.addEventListener(event, handler, false);
			};
		}
		
		observe(inputText, "cut", delayedResize);
		observe(inputText, "paste", delayedResize);
		observe(inputText, "drop", delayedResize);

		return;
	}

	// Remove loading progress.
	let loadingProgress = document.getElementById("loadingProgress");
	if  (loadingProgress) {
		loadingProgress.remove();

		let inputText = document.getElementById("chatInput");
		// Enable input text
		if (inputText) {
			inputText.disabled = false;
		}
	}

	if (!threadChatMessages || threadChatMessages.length === 0) {
		// Display no messages
		// Avoid duplicates of no messages
		if (document.getElementById("noMessage")) {
			return;
		}

		let noMessageContainer = document.createElement("div");
		noMessageContainer.id = "noMessage";
		noMessageContainer.className = "ClassroomChatroom_information";
		let noMessageImage = document.createElement("img");
		noMessageImage.src = "noMessage.svg";
		noMessageContainer.append(noMessageImage);
		let noMessageText = document.createElement("div");
		noMessageText.style.fontWeight = "bold";
		noMessageText.style.margin = "16px";
		noMessageText.innerHTML = "No messages yet";
		noMessageContainer.append(noMessageText);

		let protectionText = document.createElement("div");
		protectionText.innerHTML = "For your protection, this chat service is logged and monitored by your school district.";
		protectionText.style.marginTop = "16px";
		noMessageContainer.append(protectionText);

		let conversation = document.getElementById("chatMessageConversation"); 
		if (conversation) {
			conversation.append(noMessageContainer);
		}

		return;
	} else {
		// Remove no message
		let noMessageContainer = document.getElementById("noMessage");
		if (noMessageContainer) {
			noMessageContainer.remove();
		}
	}

	// If it's a new message, 
	let orderedData = newMessage ? threadChatMessages.reverse() : threadChatMessages.slice(loadedMessageCount);
	let conversation = document.getElementById("chatMessageConversation");
		
	for (let msg of orderedData) {
		if (displayedMessages.has(msg.id)) {
			continue;
		}

		const sender = (userName === msg.sender.username) ? null : (msg.sender['displayName'] || msg.sender.username);
		const teacherIndex = sender === null ? -1 : classRooms[currentClassroomId].teachers.indexOf(msg.sender.username);
		const date = new Date(msg.timestamp);
		let [message] = chatMessageElement(msg.message, date, msg.id, sender, teacherIndex);

		// Check whether we have rendered a chat node or not
		if (!lastRenderedLoadedNode || newMessage) {
			// Store the rendered chat node
			if (!newMessage) {
				// NOT a new message. So, we are loading.
				lastRenderedLoadedNode = message;
				oldestMessage = msg;
				newestMessage = msg;
				newestMessageTimestamp = new Date(msg.timestamp);

				if (sender) {
					lastRenderedIncomingNode = message; // ??? DO WE NEED THIS lastRenderedIncomingNode variable?
				}
			} else {
				// We are receiving new message
				// Compare time stamp
				let lastTime = null;
				if (newestMessage && newestMessage.sender.username === msg.sender.username) {
					lastTime = new Date(newestMessage.timestamp);
					if (date.getTime() - lastTime.getTime() <= groupingTimeLimit) {
						removeTimeStamp(message);
						if (sender) {
							hideAvatar(lastRenderedIncomingNode);
							removeDisplayName(message);
						}
					}
					
					if (date.getDay() !== lastTime.getDay()) {
						// Show reminder only if it has not been displayed before for the day
						if (!isDailyReminderDisplayed()) {
							conversation.append(createDailyReminder());
						}
					}
				}

				newestMessage = msg;
				lastRenderedIncomingNode = message;
				newestMessageTimestamp = lastTime;
			}

			// Append the message
			conversation.append(message);
		} else {
			const lastTime = new Date(oldestMessage.timestamp);

			if (oldestMessage && oldestMessage.sender.username === msg.sender.username) {
				// Compare time stamp
				if (lastTime.getTime() - date.getTime() <= groupingTimeLimit) {
					removeTimeStamp(lastRenderedLoadedNode);
					removeDisplayName(lastRenderedLoadedNode);

					// No need to remove avatar if the sender is null
					if (sender) {
						hideAvatar(message);
					}
				}
			}
			// Show daily reminder.
			if (date.getDay() !== lastTime.getDay()) {
				if (!isDailyReminderDisplayed()) {
					let dailyReminder = createDailyReminder();
					conversation.insertBefore(dailyReminder, lastRenderedLoadedNode);
					lastRenderedLoadedNode = dailyReminder;
				}
			}

			conversation.insertBefore(message, lastRenderedLoadedNode);
			lastRenderedLoadedNode = message;
			oldestMessage = msg;
		}

		// Store the rendered chat node
		if (!newMessage) {
			lastRenderedLoadedNode = message;
		}
		// Track which messages have been displayed.
		displayedMessages.add(msg.id);

		// Increment loaded message count
		loadedMessageCount++;
	}

	// If it's the first load, scroll to the bottom
	if (!chatInitialized) {
		scrollChatToBottom();
		chatInitialized = true;
	} else if (newMessage && !userIsScrolling) {
		// We'll scroll to bottom if there is a new message and user is not scrolling up loading the older messages.
		scrollChatToBottom();
	}
}

function sendMessageBody(requestBody) {
	if (requestBody) {
		let xhr = new XMLHttpRequest();
		xhr.open("POST", `${baseUrl}/message`, true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					body = JSON.parse(xhr.response);

					// Remove send progress indicator
					let sendIndicator = document.getElementById("sendIndicator" + body.id);
					if (sendIndicator) {
						sendIndicator.remove();
					}

					// Remove from dictionary
					delete messagesToSend[body.id];

					// And change the background and text color to indicate message has been sent
					let messageDialog = document.getElementById("sending" + body.id);
					messageDialog.style.backgroundColor = sentBgColor;
					messageDialog.style.color = "white";

					retryCount = 0;
				} else {
					// We fail sending message. So, inform user about it
					let sendIndicator = document.getElementById("sendIndicator" + requestBody.id);
					if (sendIndicator) {
						// Clear send progress
						removeAllChildNodes(sendIndicator);
	
						// Insert failure indicator.
						sendIndicator.appendChild(createSendFailure(requestBody.id));

						if (xhr.status === 401 || xhr.status === 403) {
							showLoginScreen();
						}
					}
				}
			} 
		};

		xhr.send(JSON.stringify(requestBody));
	}
}

function sendMessage() {
	// Don't allow send message if the class is offline
	if (!classRooms[currentClassroomId].isActive) {
		alert("Class is offline!");
		return;
	}

	if (classRooms[currentClassroomId].chatBlocked) {
		alert("Chat is disabled for this class")
		return;
	}

	let message = document.getElementById("chatInput").value;

	if (!message || !message.trim()) {
		return;
	}

	let chatMessageConversation = document.getElementById("chatMessageConversation");
	const date = new Date();
	const msgId = generateUUID();

	if (!newestMessageTimestamp || date.getDay() !== newestMessageTimestamp.getDay()) {
		if (!isDailyReminderDisplayed()) {
			chatMessageConversation.append(createDailyReminder());
		}
	}

	let [chatElement, messageDialog] = chatMessageElement(message, date, msgId);

	if (newestMessageTimestamp) {
		if (date.getTime() - newestMessageTimestamp.getTime() <= groupingTimeLimit && newestMessage.sender.username === userName) {
			removeTimeStamp(chatElement);
			removeDisplayName(chatElement);
		} else {
			newestMessageTimestamp = date;
		}
	} else {
		newestMessageTimestamp = date;
	}

	chatMessageConversation.append(chatElement);

	// Increment loaded message
	loadedMessageCount++;

	document.getElementById("chatInput").value = "";

	let participants = classRooms[currentClassroomId].teachers.slice();
	participants.push(userName);

	const requestBody = {
		id: msgId,
		applianceId: applianceId,
		message: message,
		classroomId: currentClassroomId,
		sender: {
			displayName: userName,
			username: userName
		},
		participants: participants,
		threadKey: threadKey
	};

	newestMessage = requestBody;
	newestMessage.timestamp = date;

	// Create send indicator
	let sendIndicator = createSendIndicator(requestBody.id);
	sendIndicator.appendChild(createSendProgress(requestBody.id))
	chatMessageConversation.append(sendIndicator);
	chatMessageConversation.scrollTop = chatMessageConversation.scrollHeight;

	// Set the background to very light blue and text to black to indicate it's sending
	messageDialog.id = "sending" + requestBody.id;
	messageDialog.style.backgroundColor = sendingBgColor;
	messageDialog.style.color = "black";

	// Add to dictionary
	messagesToSend[requestBody.id] = requestBody;

	displayedMessages.add(requestBody.id);

	// Clear no message information, if any
	let noMessageContainer = document.getElementById("noMessage");
	if (noMessageContainer) {
		noMessageContainer.remove();
	}

	sendMessageBody(requestBody);
}

function fetchChats(newMessage) {
	let className = currentClassroomId;
	let teachers = classRooms[currentClassroomId].teachers;

	// Use class name if available. Otherwise use class id
	if (classRooms[currentClassroomId].name) {
		className = classRooms[currentClassroomId].name;
	}

	// Set thread key when we switch to chat ui.
	const teacherString = (teachers && teachers.length)
		? teachers.sort().join(",")
		: "";

	threadKey = base64url(`${teacherString},${userName},${currentClassroomId}`);

	let startAfter = "";

	if (loadedMessageCount >= chatLoadMsgCount && !newMessage) {
		startAfter = threadChatMessages[loadedMessageCount - 1].timestamp;
	}

	let maxResults = `&maxResults=${chatLoadMsgCount}`;
	let sortDirection = "&sortDirection=DESC";
	let startAfterQuery = startAfter ? `&startAfter=${startAfter}` : "";
	let url = baseUrl + `/message?classroomid=${base64url(currentClassroomId)}&threadKey=${threadKey}&username=${userName}&applianceId=${applianceId}` + maxResults + sortDirection + startAfterQuery;

	let xhr = new XMLHttpRequest();
	xhr.open("GET", url);
	xhr.onreadystatechange = () => {
		noNewMessagesFetched = false;
		if (xhr.readyState === 4) {
			// No more scrolling. Set to false.
			userIsScrolling = false;

			if (xhr.status === 200) {
				const data = JSON.parse(xhr.response);
				if (data && data.length) {
					if (threadChatMessages.length < chatLoadMsgCount) {
						threadChatMessages = data;
						noNewMessagesFetched = true;
					} else {
						let tempMessages = [];
						data.forEach((message) => {
							if (!threadChatMessages.find(threadChatMessage => threadChatMessage.id === message.id)) {
								tempMessages.push(message);
							}
						});

						if (tempMessages.length === 0) {
							noNewMessagesFetched = true; 
						}

						tempMessages.forEach((msg) => threadChatMessages.push(msg));
					}

					// Update unread message count for this class
					const currentUnreadCount = unreadCount[currentClassroomId];
					if (data.length >= currentUnreadCount) {
						//classRooms[currentClassroomId].unreadMessagesCount = 0;
						unreadCount[currentClassroomId] = 0;
					} else {
						// This is a special situation, eg. unread count is originally 25
						// But since we only read 15 messages at a time, we only subtract unread
						// count by 15
						unreadCount[currentClassroomId] = currentUnreadCount - data.length;
					}

					// Then count total unread message to tell the chat bubble
					updateTotalUnreadCount();
				} else {
					noNewMessagesFetched = true; 
				}
				buildChatUi(newMessage);

				const unreadMessages = threadChatMessages.filter(msg => !msg.isRead)
				if (unreadMessages.length) {
					const firstUnreadMessage = unreadMessages.sort((a, b) => new Date(a.timestamp).getTime() < new Date(b.timestamp).getTime())[0];					
					retryCount = 0;
					
					// Call mark as read
					let endPoint = baseUrl + "/thread/markasread";
					let markAsReadRequest = new XMLHttpRequest();
					markAsReadRequest.open("POST", endPoint);
					
					const requestBody = {
						threadKey,
						username: userName,
						applianceId: applianceId,
						firstUnreadMessageTime: firstUnreadMessage.timestamp
					};
					// Mark as read
					markAsReadRequest.send(JSON.stringify(requestBody));
				}
			} else if (xhr.status === 401 || xhr.status === 403) {
				showLoginScreen();
			}
		}
	};
	xhr.send();
	// we want to allow users to open chat coversation window even if fetchchat fails
	if (!chatUiSkeletonRendered) {
		buildChatUi(newMessage);
	}
}

function updateUnreadCount(classroomId) {
	// Get the element that display unread count.
	let notificationValue =  document.getElementById("unreadValue" + classroomId);
	if (notificationValue) {
		// Get unread message count
		const unreadMessageCount = unreadCount[classroomId];
		// If there are more than 9, just write 9+
		const unreadDisplayValue = !unreadMessageCount ? "" : (unreadMessageCount > 9 ? "9+" : unreadMessageCount);

		notificationValue.innerHTML = unreadDisplayValue;
	}
}

function updateClassActiveStatus(classroomId) {
	// Get the text node that display the active status
	let classStatus = document.getElementById("activeStatus" + classroomId);
	if (classStatus) {
		const isClassActive = classRooms[classroomId].isActive;
		const classStatusValue = !isClassActive ? classOffline : classOnline;
		classStatus.innerHTML = classStatusValue
		classStatus.style.color = isClassActive ? "#009900" : "#666666";
		classStatus.style.fontWeight =  isClassActive ? "bold" : "normal";	
	}
}

function loadChatForClass(classroomId) {
		currentClassroomId = classroomId;

		// We are displaying chat for a different class. So, reset the chat messages, flags, message count, etc.
		threadChatMessages = [];
		loadedMessageCount = 0;
		lastRenderedLoadedNode = null;
		lastRenderedIncomingNode = null;
		chatInitialized = false;
		chatUiSkeletonRendered = false;
		// Ensure we clear displayed message Set.
		displayedMessages.clear();

		newestMessageTimestamp = null;	// Last message that student send
		newestMessage = null;		// Last new message from teacher
		oldestMessage = null;		// Last loaded message (oldest timestamp)

		// Now fetch chat content.
		fetchChats();
}

function chatThreadElement(classroomId) {
	let row = document.createElement("div");

	let button = document.createElement("button");
	button.className = "ClassroomChatroom_rowContainer";

	let wrapper = document.createElement("div");
	wrapper.className = "Classroom_rowWrapper";

	let classInfo = document.createElement("div");
	classInfo.style.textAlign = "left";

	let classRoomName = document.createElement("div");
	classRoomName.innerHTML = classRooms[classroomId].name || classroomId;
	classRoomName.className = "ClassroomChatroom_name";

	classInfo.append(classRoomName);

	const isClassActive = classRooms[classroomId].isActive;
	let classStatusValue = !isClassActive ? classOffline: classOnline;
	let classStatus = document.createElement("div");
	classStatus.id = "activeStatus" + classroomId;
	classStatus.className = "ClassroomChatroom_classStatus";
	classStatus.innerHTML = classStatusValue
	classStatus.style.color = isClassActive ? "#009900" : "#666666";
	classStatus.style.fontWeight =  isClassActive ? "bold" : "normal";
	classInfo.append(classStatus);

	wrapper.append(classInfo);

	// Arrow right
	let arrowRight = document.createElement("i");
	arrowRight.className = "ClassroomChat_arrowRight";
	button.append(wrapper);

	button.addEventListener("click", function() {
		loadChatForClass(classroomId);
	});	

	row.append(button);

	return row;	  
}

function chatMessageElement(text, msgTime, msgId, sender, teacherIndex) {
	if (!text) {
		return null;
	}

	let container = document.createElement("div");
	container.style.paddingTop = "4px";
	container.style.paddingBottom = "4px";
	container.style.paddingLeft = "8px";

	let message = document.createElement("div");
	message.style.display = "flex";
	message.style.alignItems = "center";

	// if no sender, defaults to messages from self 
	if (!sender) {
		message.style.flexDirection = "row-reverse";
		message.style.marginRight = "10px";
	}

	if (sender) {
		let avatar = document.createElement("div");
		avatar.className = "ClassroomChat_avatar";
		// Add 1 to make sure it's different color as teacherIndex could be 0.	
		const colorIndex = findColorIndex() + teacherIndex + 1;
		avatar.style.backgroundColor = bgColors[colorIndex % bgColors.length];
		avatar.innerHTML = sender.toUpperCase()[0];
		avatar.id = "avatar" + msgId;

		message.appendChild(avatar);
	}

	let messageDialog = document.createElement("div");	
	let name = document.createElement("div");
	name.className = "ClassroomChat_displayName";

	if (!sender) {
		messageDialog.style.backgroundColor = "#1987d6";
		messageDialog.style.color = "white";

		name.style.textAlign = "right";
		name.style.marginRight = "10px";
	} else {
		messageDialog.style.backgroundColor = "#E7E7E7";
		messageDialog.style.color = "black";
		messageDialog.style.marginLeft = "8px";

		let senderName = document.createElement("span");
		senderName.innerHTML = sender;
		senderName.style.fontWeight = "bold";
		senderName.style.marginLeft = "30px";

		name.appendChild(senderName);
	}

	let dateTime = createDateTimeElement(msgTime);
	dateTime.id = "dateTime" + msgId;
	container.append(dateTime);
	container.appendChild(name);

	messageDialog.style.borderRadius = "1rem";
	messageDialog.style.display = "inline-block";
	messageDialog.style.padding = "12px 16px";
	messageDialog.style.maxWidth = "71%";
	const sanitizedInput = text.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\"/g, '&quot;')
		.replace(/\'/g, '&#39;');
	messageDialog.innerHTML = linkifyHtml(sanitizedInput, {
		attributes: {
			style: `color:${!sender ? "white" : "#0075DB"};`,
		},
	});
	messageDialog.style.wordWrap = "break-word"

	// Tooltip.
	messageDialog.title = msgTime.toLocaleTimeString("en-US", {hour: '2-digit', minute:'2-digit'}).toLowerCase();

	message.appendChild(messageDialog);
	container.appendChild(message);

	return [container, messageDialog];
}

// This function is adopted from https://www.w3schools.com/howto/tryit.asp?filename=tryhow_js_sort_table
function sortChatThreadView() {
	let table = document.getElementById("chatThreads");
	if (!table) {
		return;
	}

	let shouldSwitch;
	let switching = true;
	let i;
	
    while (switching) {
        switching = false;
        let rows = table.rows;

        for (i = 0; i < (rows.length - 1); i++) {
            // Initially, set the flag to false
            shouldSwitch = false;
            // Get the two elements to compare, one from current row and one from the next.
            const x = rows[i].getElementsByClassName("ClassroomChatroom_classStatus")[0];
            const y = rows[i + 1].getElementsByClassName("ClassroomChatroom_classStatus")[0];
            const xonline = x.textContent.indexOf(classOnline) !== -1;
            const yonline = y.textContent.indexOf(classOnline) !== -1;

            // x is offline and y is online. So, swap the row
            if (!xonline && yonline) {
                shouldSwitch = true;
                break;
            } else if (xonline === yonline) {
                // Both are offline or online. So, compare the class name to sort.				
				const classX = rows[i].getElementsByClassName("ClassroomChatroom_name")[0];
				const classY = rows[i + 1].getElementsByClassName("ClassroomChatroom_name")[0];
				if (classX.textContent > classY.textContent) {
					shouldSwitch = true;
					break;					
				}
			}
        }
        // Make the switch
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
        }
    }
}
  
function base64url(input) {
    return btoa(input)
        .replace(/\-/g, "+")
        .replace(/_/g, "/")
        .replace(/=/g, "");
}

function capitalizeString(txt) {
	if (!txt) {
		return "";
	}
	return txt.charAt(0).toUpperCase() + txt.slice(1);
}