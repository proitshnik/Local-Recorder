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

function sendStartMessage(formData) {
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
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
		showGlobalVisualCue(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
	}
});

function clearLogs() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.remove('extension_logs', () => {
			if (chrome.runtime.lastError) {
				console.error('Ошибка при очистке логов:', chrome.runtime.lastError);
				reject(chrome.runtime.lastError);
			} else {
				console.log('Логи успешно очищены');
				resolve();
			}
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

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === "stopMediaNotification") {
			chrome.runtime.sendMessage({action: 'suppressGlobalVisualCue'});
		}
	}
);

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
		if (message.action === 'gotoMediaTab') {
			// Активируем вкладку media.html (по URL, переданному в message.mediaExtensionUrl)
			openTab(message.mediaExtensionUrl);
		}
	}
);