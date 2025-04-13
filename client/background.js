import {deleteFilesFromTempList, showGlobalVisualCue} from "./common.js";
import { log_client_action } from "./logger.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'scheduleCleanup') {
	  	chrome.alarms.create('dynamicCleanup', {
			delayInMinutes: message.delayMinutes,
	  	});
	}
});
  
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === 'dynamicCleanup') {
	  	await deleteFilesFromTempList();
	  	chrome.alarms.clear('dynamicCleanup');
	}
});

var startTime

function sendStartMessage(formData) {
	screenCaptureActive = true;
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
	startTime = new Date();
}

async function checkTabState() {
	const tabs = await chrome.tabs.query({url: chrome.runtime.getURL('media.html')});
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
		const tabs = await chrome.tabs.query({url: extensionUrl});
		if (tabs && tabs.length > 1) {
			await chrome.tabs.remove(tab.id);
			await chrome.tabs.update(tabs[0].id, {active: true});
		}
	}
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === 'startRecord' || message.action === 'getPermissions') {
		const result = await checkTabState();
		if (result === undefined) {
			const tab = await chrome.tabs.create({
				url: chrome.runtime.getURL('media.html'),
				index: 0, // Устанавливаем вкладку в начало списка
				pinned: true // Закрепляем вкладку
			});
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
				await chrome.tabs.update(result[1], {active: true});
			}
		}
		message.action === 'startRecord' ? sendStartMessage(message.formData) : chrome.runtime.sendMessage({action: message.action + 'Media'});
	} else if (message.action === 'stopRecord') {
		screenCaptureActive = false;
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
		showGlobalVisualCue(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
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
			clearLogs()
				.then(() => sendResponse({ success: true }))
				.catch((error) => sendResponse({ success: false, error }));
			return true;
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
	log_client_action("First close tab media.html");

	const checkInterval = setInterval(() => {
		chrome.tabs.get(tabId, () => {
			if (chrome.runtime.lastError) {
				clearInterval(checkInterval);
				log_client_action("Successfully closed tab media.html");
				openTab(settingsUrl);
			} else {
				chrome.tabs.remove(tabId);
				log_client_action("Сlosed tab media.html");
			}
		});
	}, delay);
}

function openTab(url) {
	log_client_action("openTab " + url);
	chrome.tabs.query({ url: url }, (tabs) => {
		if (tabs && tabs.length > 0) {
			chrome.tabs.update(tabs[0].id, { active: true });
			log_client_action("Update for " + url);
		} else {
			chrome.tabs.create({ url: url, active: true });
			log_client_action("Create for " + url);
		}
	});
}

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === "closeTabAndOpenTab") {
			chrome.tabs.query({ url: message.mediaExtensionUrl }, (tabs) => {
				if (tabs && tabs.length > 0) {
					const tabId = tabs[0].id;
					log_client_action("Try close media.html");
					closeTabAndOpenTab(tabId, message.settingsUrl)
				} else {
					log_client_action("media.html not found before redirect");
					openTab(message.settingsUrl);
				}
			});
		}
	}
);
