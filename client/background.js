import { deleteFilesFromTempList } from "./common.js";

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

function sendStartMessage() {
	chrome.runtime.sendMessage({
		action: 'startRecording'
	});
}

async function checkTabState() {
	const tabs = await chrome.tabs.query({url: chrome.runtime.getURL('media.html')});
	if (tabs && tabs.length > 0) {
		if (tabs[0].active) {
			return [true, tabs[0].id];
		} else {
			return [false, tabs[0].id];
		}
	}
	return undefined;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === 'startRecord') {
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
			sendStartMessage();
		} else {
			if (result[0]) {
				sendStartMessage();
			} else {
				await chrome.tabs.update(result[1], {active: true});
				sendStartMessage();
			}
		}
	} else if (message.action === 'stopRecord') {
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
	}
});