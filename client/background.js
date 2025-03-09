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

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === 'startRecord') {
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
		  
		// Отправляем сообщение после загрузки
		chrome.runtime.sendMessage({
			action: 'startRecording'
		});
	} else if (message.action === 'stopRecord') {
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
	}
});
