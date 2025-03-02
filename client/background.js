import { deleteFilesFromTempList } from "./common.js";

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onStartup.addListener(async () => {
    await deleteFilesFromTempList();
});