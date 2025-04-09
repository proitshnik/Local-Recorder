import {deleteFilesFromTempList, showGlobalVisualCue} from "./common.js";
import { logClientAction } from "./logger.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'scheduleCleanup') {
		logClientAction("Received message: 'scheduleCleanup'");
	  	chrome.alarms.create('dynamicCleanup', {
			delayInMinutes: message.delayMinutes,
	  	});
		logClientAction("Created alarm: 'dynamicCleanup'");
	}
});
  
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === 'dynamicCleanup') {
		logClientAction("Triggered alarm: 'dynamicCleanup'");
	  	await deleteFilesFromTempList();
	  	chrome.alarms.clear('dynamicCleanup');
		logClientAction("Completed alarm: 'dynamicCleanup'");
	}
});

function sendStartMessage(formData) {
	logClientAction("Sent message: 'startRecording'");
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
}

async function checkTabState() {
	const tabs = await chrome.tabs.query({url: chrome.runtime.getURL('media.html')});
	logClientAction(`Checking tab state for 'media.html': found ${tabs.length} tab(s)`);
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
		logClientAction(`'media.html' reloaded in tab ${tabId}`);
		const tabs = await chrome.tabs.query({url: extensionUrl});
		if (tabs && tabs.length > 1) {
			logClientAction(`Multiple 'media.html' tabs found: (${tabs.length}). Removed duplicates.`)
			await chrome.tabs.remove(tab.id);
			await chrome.tabs.update(tabs[0].id, {active: true});
			logClientAction(`Activated tab ${tabs[0].id}`);
		}
	}
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === 'startRecord' || message.action === 'getPermissions') {
		logClientAction(`Received message: '${message.action}'`);
		const result = await checkTabState();
		if (result === undefined) {
			logClientAction("'media.html' tab not found. Creating new tab.");
			const tab = await chrome.tabs.create({
				url: chrome.runtime.getURL('media.html'),
				index: 0, // Устанавливаем вкладку в начало списка
				pinned: true // Закрепляем вкладку
			});
			logClientAction(`Created tab ${tab.id} for 'media.html'`);

			await new Promise((resolve) => {
				const listener = (tabId, changed, currentTab) => {
					if (tabId === tab.id && changed.status === 'complete') {
						logClientAction(`Tab ${tabId} fully loaded`);
						chrome.tabs.onUpdated.removeListener(listener);
						resolve();
					}
				};
				chrome.tabs.onUpdated.addListener(listener);
			});
		} else {
			if (!result[0]) {
				logClientAction(`Activating existing 'media.html' tab: ${result[1]}`);
				await chrome.tabs.update(result[1], {active: true});
			}
		}
		if (message.action === "startRecord") {
			sendStartMessage(message.formData);
		} else {
			chrome.runtime.sendMessage({action: message.action + "Media"});
			logClientAction(`Sent message: '${message.action}Media'`);
		}
	} else if (message.action === 'stopRecord') {
		logClientAction("Received message: 'stopRecord'")
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
		logClientAction("Sent message: 'stopRecording'");
		showGlobalVisualCue(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
		logClientAction('Displayed global visual cue for recording end');
	}
});

function clearLogs() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.remove('extension_logs', () => {
			if (chrome.runtime.lastError) {
				console.error('Ошибка при очистке логов:', chrome.runtime.lastError);
				reject(chrome.runtime.lastError);
			} else {
				logClientAction("Logs successfully cleared");
				console.log('Логи успешно очищены');
				resolve();
			}
		});
	});
}

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === "clearLogs") {
			logClientAction("Received message: 'clearLogs'");
			clearLogs()
				.then(() => sendResponse({ success: true }))
				.catch((error) => sendResponse({ success: false, error }));
			return true;
		}
	}
);