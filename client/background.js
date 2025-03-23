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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "clearLogs") {
		chrome.storage.local.get(['extension_logs'], (result) => {
			const logs = result.extension_logs || [];

			if (logs.length > 0) {
				const logsJson = JSON.stringify(logs, null, 2);

				const dataUrl = `data:application/json;base64,${btoa(logsJson)}`;

				chrome.downloads.download({
					url: dataUrl,
					filename: 'extension_logs.json',
					saveAs: true
				}, (downloadId) => {
					if (chrome.runtime.lastError) {
						console.error('Ошибка при скачивании логов:', chrome.runtime.lastError);
						sendResponse({ status: "error", message: "Failed to download logs" });
					} else {
						console.log('Логи успешно скачаны');

						chrome.storage.local.remove('extension_logs', () => {
							if (chrome.runtime.lastError) {
								console.error('Ошибка при очистке логов:', chrome.runtime.lastError);
								sendResponse({ status: "error", message: "Failed to clear logs" });
							} else {
								console.log('Логи успешно очищены');
								sendResponse({ status: "success", message: "Logs downloaded and cleared" });
							}
						});
					}
				});
			} else {
				console.log('Нет логов для скачивания');
				sendResponse({ status: "success", message: "No logs to download or clear" });
			}
		});

		return true;
	}
});