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
		await chrome.tabs.create({ url: chrome.runtime.getURL('media.html') });
		chrome.runtime.sendMessage({
			action: 'startRecording'
		});
	}
	else if (message.action === 'stopRecord') {
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
	}
});