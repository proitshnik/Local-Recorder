import { deleteFilesFromTempList } from "./common.js";

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

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