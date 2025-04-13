import {deleteFilesFromTempList, showGlobalVisualCue} from "./common.js";
import { logClientAction } from "./logger.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'scheduleCleanup') {
		logClientAction({ action: "Receive message", messageType: "scheduleCleanup" });
	  	chrome.alarms.create('dynamicCleanup', {
			delayInMinutes: message.delayMinutes,
	  	});
		logClientAction({ action: "Create alarm", messageType: "dynamicCleanup" });
	}
});
  
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === 'dynamicCleanup') {
		logClientAction({ action: "Trigger alarm", messageType: "dynamicCleanup" });
	  	await deleteFilesFromTempList();
	  	chrome.alarms.clear('dynamicCleanup');
		logClientAction({ action: "Complete alarm", messageType: "dynamicCleanup" });
	}
});

var startTime

function sendStartMessage(formData) {
	screenCaptureActive = true;
	logClientAction({ action: "Send message", messageType: "startRecording" });
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
	startTime = new Date();
}

async function checkTabState() {
	const tabs = await chrome.tabs.query({url: chrome.runtime.getURL('media.html')});
	logClientAction({ action: "Check tab state for media.html", tabsCount: tabs.length });
	if (tabs && tabs.length === 1) {
		if (tabs[0].active) {
			return [true, tabs[0].id];
		} else {
			return [false, tabs[0].id];
		}
	}
	return undefined;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	const extensionUrl = chrome.runtime.getURL('media.html');
	if (changeInfo.url === extensionUrl) {
		logClientAction({ action: "Reload media.html", tabId: tabId });
		const tabs = await chrome.tabs.query({url: extensionUrl});
		if (tabs && tabs.length > 1) {
			logClientAction({ action: "Multiple media.html tabs, remove duplicates", tabsCount: tabs.length });
			await chrome.tabs.remove(tab.id);
			await chrome.tabs.update(tabs[0].id, {active: true});
			logClientAction({ action: "Activate tab", tabId: tabs[0].id });
		}
	}
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === 'startRecord' || message.action === 'getPermissions') {
		logClientAction({ action: "Receive message", messageType: message.action });
		const result = await checkTabState();
		if (result === undefined) {
			logClientAction({ action: "media.html tab not found, create new tab" });
			const tab = await chrome.tabs.create({
				url: chrome.runtime.getURL('media.html'),
				index: 0, // Устанавливаем вкладку в начало списка
				pinned: true // Закрепляем вкладку
			});
			logClientAction({ action: "Create tab for media.html", tabId: tab.id });

			await new Promise((resolve) => {
				const listener = (tabId, changed, currentTab) => {
					if (tabId === tab.id && changed.status === 'complete') {
						chrome.tabs.onUpdated.removeListener(listener);
						resolve();
					}
				};
				chrome.tabs.onUpdated.addListener(listener);
			});
		} else {
			if (!result[0]) {
				logClientAction({ action: "Activate existing media.html tab", tabId: result[1] });
				await chrome.tabs.update(result[1], {active: true});
			}
		}
		if (message.action === "startRecord") {
			sendStartMessage(message.formData);
		} else {
			chrome.runtime.sendMessage({action: message.action + "Media"});
			logClientAction({ action: "Send message", messageType: `${message.action}Media` });
		}
	} else if (message.action === 'stopRecord') {
		screenCaptureActive = false;
		logClientAction({ action: "Receive message", messageType: "stopRecord" });
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
		logClientAction({ action: "Send message", messageType: "stopRecording" });
	}
});

function clearLogs() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.remove('extension_logs')
			.then(() => {
				console.log('Логи успешно очищены');
				resolve();
			})
			.catch((error) => {
				console.error('Ошибка при очистке логов:', error);
				reject(error);
			});
	});
}

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === "clearLogs") {
			logClientAction({ action: "Receive message", messageType: "clearLogs" });
			clearLogs()
				.then(() => sendResponse({ success: true }))
				.catch((error) => sendResponse({ success: false, error }));
			return true;
		}
	}
);

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === "stopMediaNotification") {
			chrome.runtime.sendMessage({ action: 'suppressGlobalVisualCue' }, (response) => {
				if (chrome.runtime.lastError) {
					console.error('Error send suppressGlobalVisualCue', chrome.runtime.lastError.message);
					logClientAction("Error send suppressGlobalVisualCue", chrome.runtime.lastError.message);
				}
				else {
					console.log('Response suppressGlobalVisualCue', response);
					logClientAction("Response suppressGlobalVisualCue", response);
				}
			});
		}
	}
);

let screenCaptureActive = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'screenCaptureStatus') {
		screenCaptureActive = message.active;
		sendResponse({ success: true });
	}
	if (message.type === 'getScreenCaptureStatus') {
		sendResponse({ active: screenCaptureActive });
	}
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	const extensionUrl = chrome.runtime.getURL('media.html');

	chrome.tabs.query({ url: extensionUrl }, function(tabs) {
		if (tabs.length === 0) {
			screenCaptureActive = false;
			const durationMs = new Date() - startTime;

			const seconds = Math.floor((durationMs / 1000) % 60);
			const minutes = Math.floor((durationMs / 1000 / 60) % 60);
			const hours = Math.floor(durationMs / 1000 / 60 / 60);

			const timeStr = `${hours.toString().padStart(2, '0')}:` +
				`${minutes.toString().padStart(2, '0')}:` +
				`${seconds.toString().padStart(2, '0')}`;
			chrome.storage.local.set({
				'timeStr': timeStr
			}, function() {
				console.log('timeStr saved to storage');
			});
		}
	});
});

function closeTabAndOpenTab(tabId, settingsUrl, delay = 300) {
	openTab(settingsUrl);
	chrome.tabs.remove(tabId);
	logClientAction("First close tab media.html");

	const checkInterval = setInterval(() => {
		chrome.tabs.get(tabId, () => {
			if (chrome.runtime.lastError) {
				clearInterval(checkInterval);
				logClientAction("Successfully closed tab media.html");
				openTab(settingsUrl);
			} else {
				chrome.tabs.remove(tabId);
				logClientAction("Сlosed tab media.html");
			}
		});
	}, delay);
}

function openTab(url) {
	logClientAction("openTab " + url);
	chrome.tabs.query({ url: url }, (tabs) => {
		if (tabs && tabs.length > 0) {
			chrome.tabs.update(tabs[0].id, { active: true });
			logClientAction("Update for " + url);
		} else {
			chrome.tabs.create({ url: url, active: true });
			logClientAction("Create for " + url);
		}
	});
}

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === 'gotoMediaTab') {
			// Активируем вкладку media.html (по URL, переданному в message.mediaExtensionUrl)
			openTab(message.mediaExtensionUrl);
		}
	  if (message.action === "closeTabAndOpenTab") {
			chrome.tabs.query({ url: message.mediaExtensionUrl }, (tabs) => {
				if (tabs && tabs.length > 0) {
					const tabId = tabs[0].id;
					logClientAction("Try close media.html");
					closeTabAndOpenTab(tabId, message.settingsUrl)
				} else {
					logClientAction("media.html not found before redirect");
					openTab(message.settingsUrl);
				}
			});
		}
	}
);