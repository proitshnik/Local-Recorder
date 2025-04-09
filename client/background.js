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

function sendStartMessage(formData) {
	logClientAction({ action: "Send message", messageType: "startRecording" });
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
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
		logClientAction({ action: "Receive message", messageType: "stopRecord" });
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
		logClientAction({ action: "Send message", messageType: "stopRecording" });
		showGlobalVisualCue(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
		logClientAction({ action: "Display global visual cue for recording end" });
	}
});

function clearLogs() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.remove('extension_logs', () => {
			if (chrome.runtime.lastError) {
				logClientAction({ action: "Error while clearing logs" });
				console.error('Ошибка при очистке логов:', chrome.runtime.lastError);
				reject(chrome.runtime.lastError);
			} else {
				logClientAction({ action: "Clear logs" });
				console.log('Логи успешно очищены');
				resolve();
			}
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