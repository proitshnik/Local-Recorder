import {deleteFilesFromTempList} from "./common.js";
import { logClientAction, clearLogs } from "./logger.js";
import { showModalNotify, sendButtonsStates, deleteFiles } from './common.js';

let screenCaptureActive = false;

function setScreenCaptureActive(state) {
	screenCaptureActive = state;
	chrome.storage.local.set({ screenCaptureActive: state }, () => {
		logClientAction({ action: "Persist screenCaptureActive", state });
	});
}

chrome.storage.local.get(['screenCaptureActive'], (result) => {
	if (typeof result.screenCaptureActive === 'boolean') {
		screenCaptureActive = result.screenCaptureActive;
		logClientAction({ action: "Restored screenCaptureActive from storage", active: screenCaptureActive });
	}
});

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

var startTime;

function sendStartMessage(formData) {
	setScreenCaptureActive(true);
	logClientAction({ action: "Send message", messageType: "startRecording" });
    chrome.runtime.sendMessage({
        action: 'startRecording',
        formData: formData
    });
	startTime = new Date();
}

async function checkTabState() {
	const tabs = await chrome.tabs.query({url: chrome.runtime.getURL('pages/media.html')});
	logClientAction({ action: "Check tab state for media.html", tabsCount: tabs.length });
	if (tabs && tabs.length === 1) {
		if (tabs[0].active) {
			logClientAction({ action: "Tab state for media.html active"});
			return [true, tabs[0].id];
		} else {
			logClientAction({ action: "Tab state for media.html not active"});
			return [false, tabs[0].id];
		}
	}
	return undefined;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	const extensionUrl = chrome.runtime.getURL('pages/media.html');
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
				url: chrome.runtime.getURL('pages/media.html'),
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
			if (!result[0] && message.activateMediaTab) {
				logClientAction({ action: "Activate existing media.html tab", tabId: result[1] });
				await chrome.tabs.update(result[1], {active: true});
			}
		}
		if (message.action === "startRecord") {
			sendStartMessage(message.formData);
			logClientAction({ action: "sendStartMessage", message: message.formData});
		} else {
			chrome.runtime.sendMessage({action: message.action + "Media"});
			logClientAction({ action: "Send message", messageType: `${message.action}Media` });
		}
	} else if (message.action === 'stopRecord') {
		setScreenCaptureActive(false);
		logClientAction({ action: "Receive message", messageType: "stopRecord" });
		chrome.runtime.sendMessage({
			action: 'stopRecording'
		});
		logClientAction({ action: "Send message", messageType: "stopRecording" });
}});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'uploadVideo') {
        uploadVideo().then(() => sendResponse({ status: "done" }));
        return true;
    }
});

async function uploadVideo() {
    const { session_id } = await chrome.storage.local.get(['session_id']);

    if (!session_id) {
        console.error("Session ID не найден");
        logClientAction({ action: `Upload fails due to missing session ID ${session_id}` });
        return;
    }

    const files = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (!files.length) {
        logClientAction("Ошибка при поиске записей");
        throw new Error(`Ошибка при поиске записей`);
    }

    const formData = new FormData();
    const rootDirectory = await navigator.storage.getDirectory();

    for (const filename of files) {
        const file = await (await rootDirectory.getFileHandle(filename)).getFile();
        if (filename.includes('screen')) {
            formData.append('screen_video', file, filename);
        } else {
            formData.append('camera_video', file, filename);
        }
    }

    formData.append("id", session_id);
    const metadata = (await chrome.storage.local.get('metadata'))['metadata'] || {};
    formData.append("metadata", metadata);

    logClientAction({ action: "Send upload request", sessionId: session_id });

    const eventSource = new EventSource(`http://127.0.0.1:5000/progress/${session_id}`);
    const steps = 7;

    eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const percent = data.step * Math.floor(100 / steps);
        if (data.step == steps) {
            eventSource.close();
            await showModalNotify([`Статус: ${data.message}`, `Отправка завершена на 100 %`], "Записи успешно отправлены", true);
        } else {
            await showModalNotify([`Статус: ${data.message}`, `Отправка завершена на ${percent} %`], "Идёт отправка...", true);
        }
    };

    eventSource.onerror = async (err) => {
        eventSource.close();
        logClientAction({ action: `EventSource error`, error: err });
        await showModalNotify([
            "Ошибка соединения с сервером!",
            "Попробуйте отправить запись ещё раз.",
            "Свяжитесь с преподавателем, если не удаётся загрузить."
        ], 'Ошибка', true);
    };

    fetch('http://127.0.0.1:5000/upload_video', {
        method: "POST",
        body: formData,
    })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
            const result = await response.json();
            console.log("Видео успешно отправлено:", result);
            logClientAction({ action: "Upload succeeded", sessionId: session_id });
        })
        .then(async () => {
            sendButtonsStates('needPermissions');
            await deleteFiles();
            await clearLogs();
            logClientAction({ action: "Очистка после загрузки" });
        })
        .catch(error => {
            console.error("Ошибка загрузки:", error);
            sendButtonsStates('failedUpload');
            logClientAction({ action: "Upload failed", error: error.message });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'screenCaptureStatus') {
		logClientAction({ action: "listener screenCaptureStatus", active: message.active });
		setScreenCaptureActive(message.active);
		sendResponse({ success: true });
	}
	if (message.type === 'getScreenCaptureStatus') {
		logClientAction({ action: "listener getScreenCaptureStatus", active: screenCaptureActive });
		sendResponse({ active: screenCaptureActive });
	}
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	const extensionUrl = chrome.runtime.getURL('pages/media.html');
	logClientAction({action: "onRemoved listener", extensionUrl});

	chrome.tabs.query({ url: extensionUrl }, function(tabs) {
		if (tabs.length === 0) {
			setScreenCaptureActive(false);
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
				logClientAction("timeStr saved to storage");
			});
		}
	});
});

function closeTabAndOpenTab(tabId, settingsUrl, delay = 150) {
	openTab(settingsUrl);
	chrome.tabs.remove(tabId);
	logClientAction("First close tab media.html");

	const checkInterval = setInterval(() => {
		chrome.tabs.get(tabId, () => {
			if (chrome.runtime.lastError) {
				clearInterval(checkInterval);
				logClientAction("Successfully closed tab media.html");
				openTab(settingsUrl);
			} else {
				chrome.tabs.remove(tabId);
				logClientAction("Сlosed tab media.html");
			}
		});
	}, delay);
}

function openTab(url) {
	logClientAction("openTab " + url);
	chrome.tabs.query({ url: url }, (tabs) => {
		if (tabs && tabs.length > 0) {
			chrome.tabs.update(tabs[0].id, { active: true });
			logClientAction("Update for " + url);
		} else {
			chrome.tabs.create({ url: url, active: true });
			logClientAction("Create for " + url);
		}
	});
}

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.action === 'gotoMediaTab') {
			(async () => {
				logClientAction("listener gotoMediaTab");

				const result = await checkTabState();
				if (result === undefined) {
					const tab = await chrome.tabs.create({
						url: chrome.runtime.getURL('pages/media.html'),
						index: 0,
						pinned: true,
						active: true
					});
					await new Promise((resolve) => {
						const listener = (tabId, changed) => {
							if (tabId === tab.id && changed.status === 'complete') {
								chrome.tabs.onUpdated.removeListener(listener);
								resolve();
							}
						};
						chrome.tabs.onUpdated.addListener(listener);
					});
				} else {
					const mediaExtensionUrl = chrome.runtime.getURL("pages/media.html");
					openTab(mediaExtensionUrl);
				}
				sendResponse({ status: "done" });
			})();

			return true;
		}
	}
);

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
	  if (message.action === "closeTabAndOpenTab") {
			chrome.tabs.query({ url: message.mediaExtensionUrl }, (tabs) => {
				if (tabs && tabs.length > 0) {
					const tabId = tabs[0].id;
					logClientAction("Try close media.html");
					closeTabAndOpenTab(tabId, message.settingsUrl)
				} else {
					logClientAction("media.html not found before redirect");
					openTab(message.settingsUrl);
				}
			});
		}
	  sendResponse(message);
	}
);