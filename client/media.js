import { showVisualCue } from './common.js';
import { deleteFilesFromTempList, buttonsStatesSave } from "./common.js";
import { logClientAction } from './logger.js';

var streams = {
    screen: null,
    microphone: null,
    camera: null,
    combined: null
};

var recorders = {
    combined: null,
    camera: null
};

var combinedPreview = document.querySelector('.combined__preview');
var cameraPreview = document.querySelector('.camera__preview');

var previewButton = document.getElementById('preview-toggle-btn');
var isRecording = false;
var isPreviewEnabled = false;

var rootDirectory = null;
var combinedFileName = null;
var cameraFileName = null;
var combinedFileHandle = null;
var cameraFileHandle = null;
var combinedWritableStream = null;
var cameraWritableStream = null;
var forceTimeout = null;
var startTime = undefined;
var endTime = undefined;
var server_connection = undefined;

var metadata = {
    screen: {
        session_client_start: undefined,
        session_client_end: undefined,
        session_client_duration: undefined,
        session_client_mime: undefined,
        session_client_resolution: undefined,
        session_client_size: undefined // MB
    },
    camera: {
        session_client_start: undefined,
        session_client_end: undefined,
        session_client_duration: undefined,
        session_client_mime: undefined,
        session_client_resolution: undefined,
        session_client_size: undefined // MB
    }
};

const stopStreams = () => {
    Object.entries(streams).forEach(([stream, value]) => {
        if (value) {
            value.getTracks().forEach(track => track.stop());
            streams[stream] = null;
        }
    });
    logClientAction({ action: "Stop streams" });
};

function generateObjectId() {
    const bytes = new Uint8Array(12);
    const timestamp = Math.floor(Date.now() / 1000);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, timestamp, false);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes.subarray(4));
    } else {
      for (let i = 4; i < 12; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    logClientAction({ action: "Generate ObjectId" });

    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
}

function getBrowserFingerprint() {
    logClientAction({ action: "Get browser fingerprint" });
    return {
        browserVersion: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || 'unknown',
        userAgent: navigator.userAgent,
        language: navigator.language || navigator.userLanguage || 'unknown',
        cpuCores: navigator.hardwareConcurrency || 'unknown',
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        availableScreenResolution: `${window.screen.availWidth}x${window.screen.availHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
        timestamp: new Date().toISOString(),
        cookiesEnabled: navigator.cookieEnabled ? 'yes' : 'no',
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        doNotTrack: navigator.doNotTrack || window.doNotTrack || 'unknown'
    };
}

async function clearLogs() {
    await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "clearLogs" }, (response) => {
            if (response.success) {
                logClientAction({ action: "Clear logs" });
                console.log("Логи очищены перед завершением");
            } else {
                logClientAction({ action: "Error while clearing logs", error: response.error });
                console.error("Ошибка очистки логов:", response.error);
            }
            resolve();
        });
    });
}

const getDifferenceInTime = (date1, date2) => {
    const diff = Math.abs(Math.floor(date2.getTime() / 1000) - Math.floor(date1.getTime() / 1000)); // ms
    const totalSeconds = Math.floor(diff);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Для удобного представления
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');

    logClientAction({ action: "Calculate difference in time" });
    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
};

const setMetadatasRecordOn = () => {
    console.log(startTime);
    metadata.screen.session_client_start = getCurrentDateString(startTime);
    metadata.screen.session_client_mime = recorders.combined.mimeType;
    const [screenVideoTrack] = streams.screen.getVideoTracks();
    const screenSettings = screenVideoTrack.getSettings();
    metadata.screen.session_client_resolution = `${screenSettings.width}×${screenSettings.height}`;
    metadata.camera.session_client_start = getCurrentDateString(startTime);
    metadata.camera.session_client_mime = recorders.camera.mimeType;
    const [cameraVideoTrack] = streams.camera.getVideoTracks();
    const cameraSettings = cameraVideoTrack.getSettings();
    metadata.camera.session_client_resolution = `${cameraSettings.width}×${cameraSettings.height}`;
    logClientAction({ action: "Set metadata record on" });
};

const setMetadatasRecordOff = async () => {
    metadata.screen.session_client_end = getCurrentDateString(endTime);
    metadata.screen.session_client_duration = getDifferenceInTime(endTime, startTime);
    metadata.camera.session_client_end = getCurrentDateString(endTime);
    metadata.camera.session_client_duration = getDifferenceInTime(endTime, startTime);
    const screenFile = await combinedFileHandle.getFile();
    metadata.screen.session_client_size = (screenFile.size / 1000000).toFixed(3);
    const cameraFile = await cameraFileHandle.getFile();
    metadata.camera.session_client_size = (cameraFile.size / 1000000).toFixed(3);
    logClientAction({ action: "Set metadata record off" });
};

async function checkOpenedPopup() {
    let a = await chrome.runtime.getContexts({contextTypes: ['POPUP']});
    const isPopupOpen = a.length > 0;
    logClientAction({ action: "Check if popup is open", popupOpen: isPopupOpen.toString() });
    return isPopupOpen;
}

async function sendButtonsStates(state) {
    if (state === 'readyToUpload' && !server_connection) {
        state = 'needPermissions';
        logClientAction({ action: "Update buttons states due to missing server connection" });
    }
    if (await checkOpenedPopup()) {
        chrome.runtime.sendMessage({action: 'updateButtonStates', state: state});
        logClientAction({ action: "Send message", messageType: "updateButtonStates" });
    }
    else {
        buttonsStatesSave(state);
        logClientAction({ action: "Save buttons states locally" });
    }
}

async function getMediaDevices() {
    return new Promise(async (resolve, reject) => {
        try {
            logClientAction({ action: "Request screen media" });

            chrome.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
                if (!streamId) {
                    logClientAction({ action: "User cancels screen selection" });
                    console.error('Пользователь отменил выбор экрана');
                    reject('Пользователь отменил выбор экрана');
                    showVisualCue(["Пользователь отменил выбор экрана!"], "Ошибка");
                    return;
                }
                try {
                    logClientAction({ action: "User grants screen access" });

                    streams.screen = await navigator.mediaDevices.getUserMedia({
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: streamId
                            }
                        },
                    });

                    if (!streams.screen || streams.screen.getVideoTracks().length === 0) {
                        logClientAction({ action: "Screen stream not available" });
                        throw new Error('Не удалось получить видеопоток с экрана');
                    }

                    let micPermissionDenied = false;
                    let camPermissionDenied = false;

                    try {
                        streams.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
                        logClientAction({ action: "User grants microphone access" });
                    } catch (micError) {
                        if (micError.name === 'NotAllowedError') {
                            micPermissionDenied = true;
                            logClientAction({ action: "Microphone permission denied", error: "NotAllowedError" });
                            showVisualCue("Ошибка при доступе к микрофону: NotAllowedError", "Ошибка");
                        } else {
                            logClientAction({ action: "Microphone permission denied" });
                            alert('Ошибка при доступе к микрофону: ' + micError.message);
                            showVisualCue('Ошибка при доступе к микрофону: ' + micError.message, "Ошибка");
                            stopStreams();
                            reject(micError);
                            return;
                        }
                    }

                    try {
                        streams.camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                        logClientAction({ action: "User grants camera access" });
                    } catch (camError) {
                        if (camError.name === 'NotAllowedError') {
                            logClientAction({ action: "Camera permission denied", error: "NotAllowedError" });
                            showVisualCue("Ошибка при доступе к камере: NotAllowedError", "Ошибка");
                            camPermissionDenied = true;
                        } else {
                            logClientAction({ action: "Camera permission denied" });
                            alert('Ошибка при доступе к камере: ' + camError.message);
                            showVisualCue('Ошибка при доступе к камере: ' + camError.message, "Ошибка");
                            stopStreams();
                            reject(camError);
                            return;
                        }
                    }

                    if (micPermissionDenied || camPermissionDenied) {
                        stopStreams();
                        const extensionId = chrome.runtime.id;
                        const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension://${extensionId}`;

                        logClientAction({ action: "Prompt permission settings" });

                        alert('Не предоставлен доступ к камере или микрофону.\n' +
                            'Сейчас откроется вкладка с настройками доступа для этого расширения.\n' +
                            'Пожалуйста, убедитесь, что камера и микрофон разрешены.');
                        showVisualCue(['Не предоставлен доступ к камере или микрофону.',
                            'Сейчас откроется вкладка с настройками доступа для этого расширения.',
                            'Пожалуйста, убедитесь, что камера и микрофон разрешены.']);

                        // TODO Привязать к кнопке визуального уведомления, как в нем будет новая логика

                        const mediaExtensionUrl = chrome.runtime.getURL("media.html");

                        // Закрытие вкладки media.html перед открытием вкладки с настройками разрешений расширения
                        chrome.tabs.query({ url: mediaExtensionUrl }, (tabs) => {
                            if (tabs && tabs.length > 0) {
                                // Стоит обработчик, сохраняющий одну вкладку media.html
                                chrome.tabs.remove(tabs[0].id, () => {
                                    if (chrome.runtime.lastError) {
                                        // TODO Типичная проблема Chrome с нерешенным alert при переключении вкладки и возвращении
                                        // Tabs cannot be edited right now (user may be dragging a tab).
                                        // Не обрабатывается до внедрения нового уведомления 
                                        logClientAction({ action: "Fail to close media.html before redirect", error: chrome.runtime.lastError.message })
                                        showVisualCue("Не удалось закрыть вкладку: " + chrome.runtime.lastError.message, "Ошибка");
                                    } else {
                                        logClientAction({ action: "Successfully close media.html before redirect" });
                                    }
                                });
                            } else {
                                logClientAction({ action: "media.html not found before redirect" });
                            }
                        });

                        chrome.tabs.query({ url: settingsUrl }, (tabs) => {
                            if (tabs && tabs.length > 0) {
                                chrome.tabs.update(tabs[0].id, { active: true });
                                logClientAction({ action: "Focus on settings tab" });
                            } else {
                                chrome.tabs.create({ url: settingsUrl });
                                logClientAction({ action: "Create settings tab" });
                            }
                        });

                        logClientAction({ action: "Redirect to permission settings" });
                        reject('Доступ к устройствам не предоставлен');
                        return;
                    }

                    logClientAction({ action: "Initialize combined and camera recorders" });

                    streams.combined = new MediaStream([
                        streams.screen.getVideoTracks()[0],
                        streams.microphone.getAudioTracks()[0]
                    ]);

                    combinedPreview.srcObject = streams.combined;
                    cameraPreview.srcObject = streams.camera;

                    combinedPreview.onloadedmetadata = function () {
                        combinedPreview.width = combinedPreview.videoWidth > 1280 ? 1280 : combinedPreview.videoWidth;
                        combinedPreview.height = combinedPreview.videoHeight > 720 ? 720 : combinedPreview.videoHeight;
                    };

                    cameraPreview.onloadedmetadata = function () {
                        cameraPreview.width = 320;
                        cameraPreview.height = 240;
                    };

                    cameraPreview.style.display = 'block';
                    combinedPreview.style.display = 'block';

                    combinedPreview.muted = false;

                    recorders.combined = new MediaRecorder(streams.combined, { mimeType: 'video/mp4; codecs="avc1.64001E, opus"' });
                    recorders.camera = new MediaRecorder(streams.camera, { mimeType: 'video/mp4; codecs="avc1.64001E"' });

                    logClientAction({ action: "Create combined recorder" });
                    logClientAction({ action: "Create camera recorder" });

                    recorders.combined.ondataavailable = async (event) => {
                        if (event.data.size > 0 && combinedWritableStream) {
                            logClientAction({ action: "Combined data available", bytes: event.data.size });
                            await combinedWritableStream.write(event.data);
                        }
                    };

                    recorders.camera.ondataavailable = async (event) => {
                        if (event.data.size > 0 && cameraWritableStream) {
                            logClientAction({ action: "Camera data available", bytes: event.data.size });
                            await cameraWritableStream.write(event.data);
                        }
                    };
                  
                    resolve();
                } catch (error) {
                    logClientAction({ action: "Error during screen capture setup", error: error.message });
                    stopStreams();
                    reject(error);
                }
            });
        } catch (error) {
            logClientAction({ action: "General error in getMediaDevices", error: error.message });
            reject(error);
        }
    });
}

function hideMutePreviews() {
    cameraPreview.style.display = 'none';
    combinedPreview.style.display = 'none';
    combinedPreview.muted = true;

    logClientAction({ action: "Hide and mute previews" });
}

previewButton.addEventListener('click', () => {
    if (!isRecording) {
        logClientAction({ action: "Ignore preview toggle click - not recording" });
        return;
    }

    combinedPreview.muted = true;

    isPreviewEnabled = !isPreviewEnabled;

    const displayValue = isPreviewEnabled ? 'block' : 'none';
    cameraPreview.style.display = displayValue;
    combinedPreview.style.display = displayValue;

    logClientAction(isPreviewEnabled ? { action: "Enable preview mode" } : { action: "Disable preview mode" });

    updatePreviewButton();
});

function updatePreviewButton() {
    if (!isRecording) {
        previewButton.disabled = true;
        previewButton.textContent = 'Включить';
        previewButton.classList.remove('enabled', 'disabled');
        logClientAction({ action: "Update preview button - not recording" });
        return;
    }

    previewButton.disabled = false;
    previewButton.textContent = isPreviewEnabled ? 'Выключить' : 'Включить';
    previewButton.classList.toggle('enabled', !isPreviewEnabled);
    previewButton.classList.toggle('disabled', isPreviewEnabled);

    logClientAction({ action: "Update preview button", previewEnabled: isPreviewEnabled.toString() });
}

async function cleanup() {
    if (forceTimeout) clearTimeout(forceTimeout);
    stopStreams();
    combinedPreview.srcObject = null;
    cameraPreview.srcObject = null;
    recorders.combined = null;
    recorders.camera = null;
    console.log('Все потоки и запись остановлены.');
    logClientAction({ action: "Complete cleanup" });
}

async function handleFileSave(handle, name) {
    try {
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        console.log(`Файл ${name} сохранен`);
        logClientAction({ action: "Save file", fileName: name });
    } catch (error) {
        console.error(`Ошибка при сохранении файла ${name}:`, error);
        logClientAction({ action: "Fail to save file", fileName: name, error: error.message });
    }
}

const getCurrentDateString = (date) => {
    logClientAction({ action: "Generate current date string" });
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T` + 
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

const getAvailableDiskSpace = async () => {
    const estimate = await navigator.storage.estimate();
    const freeSpace = estimate.quota - estimate.usage;
    logClientAction({ action: "Check available disk space", freeSpace });
    return freeSpace;
};

async function addFileToTempList(fileName) {
    const tempFiles = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (!tempFiles.includes(fileName)) {
        logClientAction({ action: "Add file to temp list", fileName });
        tempFiles.push(fileName);
    } else {
        logClientAction({ action: "File already exists in temp list", fileName });
    }
    chrome.storage.local.set({'tempFiles': tempFiles});
}

// системное ограничение браузера позволяет выводить пользовательское уведомление только после алерта (в целях безопасности)
const beforeUnloadHandler = (event) => {
    logClientAction({ action: "Trigger beforeunload warning" });
    showVisualCue(["Не закрывайте вкладку расширения при записи!", 
        "Не обновляйте вкладку расширения при записи!",
        "Не закрывайте браузер при записи!", 
        "При закрытии или обновлении вкладки расширения (речь не о всплывающем окне расширения), а также закрытии самого браузера запись будет прервана!"], "Внимание!");
    event.preventDefault();
    event.returnValue = true;
};

window.addEventListener('beforeunload', beforeUnloadHandler);

window.addEventListener('unload', () => {
    logClientAction({ action: "Tab media.html unload - save state as needPermissions" });
    buttonsStatesSave('needPermissions');
})

window.addEventListener('load', () => {
    logClientAction({ action: "Load media.html tab" });
    Object.values(streams).some(async (stream) => {
        if (stream === null) {
            logClientAction({ action: "Some stream is null - request permissions" });
            await sendButtonsStates('needPermissions');
            return true;
        }
    });
});

// Функция для отправки видео на сервер после завершения записи
async function uploadVideo(combinedFile, cameraFile) {
    chrome.storage.local.get(['session_id', 'extension_logs'], async ({ session_id, extension_logs }) => {
        if (!session_id) {
            console.error("Session ID не найден в хранилище");
            logClientAction({ action: "Upload fails due to missing session ID" });
            return;
        }

        const formData = new FormData();
        formData.append("id", session_id);
        formData.append("screen_video", combinedFile, combinedFileName);
        formData.append("camera_video", cameraFile, cameraFileName);
        await setMetadatasRecordOff();
        formData.append("metadata", JSON.stringify(metadata));

        logClientAction({ action: "Prepare upload payload", sessionId: session_id, fileNames: [combinedFileName, cameraFileName] });

        if (extension_logs) {
            let logsToSend;
            if (typeof extension_logs === "string") {
                try {
                    logsToSend = JSON.parse(extension_logs);
                } catch (e) {
                    console.error("Ошибка парсинга логов:", e);
                    logsToSend = [{ error: "Invalid logs", raw_data: extension_logs }];
                    logClientAction({ action: "Parse logs error", error: e.message });
                }
            } else {
                logsToSend = extension_logs;
            }

            const logsBlob = new Blob([JSON.stringify(logsToSend, null, 2)], { type: 'application/json' });
            formData.append("logs", logsBlob, "extension_logs.json");

            const logsFileName = `extension_logs_${session_id}_${getCurrentDateString(new Date())}.json`;
            const url = URL.createObjectURL(logsBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = logsFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            logClientAction({ action: "Download logs file", fileName: logsFileName });
        }

        logClientAction({ action: "Send upload request", sessionId: session_id, messageType: "upload_video" });

        fetch('http://127.0.0.1:5000/upload_video', {
            method: "POST",
            body: formData,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Ошибка при загрузке видео: ${response.status}`);
                }
                const result = await response.json();
                console.log("Видео успешно отправлено:", result);
                logClientAction({ action: "Upload video succeeds", sessionId: session_id });
            })
            .then(async () => {
                await deleteFilesFromTempList();
                chrome.alarms.get('dynamicCleanup', (alarm) => {
                    if (alarm) {
                        chrome.alarms.clear('dynamicCleanup');
                    }
                    logClientAction({ action: "Delete temp files succeeds" });
                });
            })
            .catch(async (error) => {
                console.error("Ошибка при отправке видео на сервер:", error);
                await sendButtonsStates('failedUpload');
                logClientAction({ action: "Upload video fails", error: error.message, sessionId: session_id });
            })
            .finally(async () => {
                await clearLogs();
                logClientAction({ action: "Clear logs after upload video" });
            });
    });
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'stopRecording') {
        logClientAction({ action: "Receive message", messageType: "stopRecording" });
        if (recorders.combined || recorders.camera) {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            stopRecord();
            if (!server_connection) await clearLogs();
            await sendButtonsStates('readyToUpload');
        }
    }
    else if (message.action === 'getPermissionsMedia') {
        logClientAction({ action: "Receive message", messageType: "getPermissionsMedia" });
        server_connection = (await chrome.storage.local.get('server_connection'))['server_connection'];
        getMediaDevices()
        .then(async () => {
            logClientAction({ action: "Get media devices success" });
            await sendButtonsStates('readyToRecord');
        })
        .catch(async () => {
            logClientAction({ action: "Get media devices failed" });
            await sendButtonsStates('needPermissions');
        });
    }
    else if (message.action === 'startRecording') {
        logClientAction({ action: "Receive message", messageType: "startRecording" });

        const formData = new FormData();
        formData.append('group', message.formData.group || '');
        formData.append('name', message.formData.name || '');
        formData.append('surname', message.formData.surname || '');
        formData.append('patronymic', message.formData.patronymic || '');
        formData.append('link', message.formData.link || '');

        if (server_connection) {
            await initSession(formData);
        } else {
            logClientAction({ action: "Start recording without server", browserFingerprint: getBrowserFingerprint() });

            await chrome.storage.local.set({ 'lastRecordTime': new Date().toISOString() });

            const sessionId = generateObjectId();
            await chrome.storage.local.set({ 'session_id': sessionId });
            logClientAction({ action: "Generate session ID locally", sessionId });
        }
        
        startRecord()
        .then(async () => {
            logClientAction({ action: "Start recording succeeds" });
            await sendButtonsStates('recording');
        })
        .catch(async (error) => {
            // В startRecord есть свой обработчик ошибок
            logClientAction({ action: "Start recording fails", error: error.message });
            showVisualCue(["Ошибка при запуске записи:", error], "Ошибка");
            await sendButtonsStates('needPermissions');
        });
    }
    else if (message.action === 'uploadVideoMedia') {
        logClientAction({ action: "Receive message", messageType: "uploadVideoMedia" });
        uploadVideo(await combinedFileHandle.getFile(), await cameraFileHandle.getFile())
        .then(async () => {
            await sendButtonsStates('needPermissions');
        })
        .catch(async () => {
            await sendButtonsStates('failedUpload');
        });
    }
});

async function initSession(formData) {
    logClientAction({ action: "Start recording via initSession", browserFingerprint: getBrowserFingerprint() });

    await chrome.storage.local.set({
        'lastRecordTime': new Date().toISOString()
    });

    try {
        const response = await fetch('http://127.0.0.1:5000/start_session', {
            method: 'POST',
            mode: 'cors',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Сервер вернул ${response.status}`);
        }

        const result = await response.json();
        const sessionId = result.id;

        await chrome.storage.local.set({ 'session_id': sessionId });

        console.log('session_id успешно сохранён!');
        logClientAction({ action: "Save session ID from server", sessionId });
    } catch (error) {
        console.error("Ошибка инициализации сессии", error);
        showVisualCue(["Ошибка инициализации сессии", error], "Ошибка")
        logClientAction(`Session initialization failed: ${error.message}`);
        logClientAction({ action: "Session initialization fails", error: error.message });
        // startRecordButton.removeAttribute('disabled');
		// stopRecordButton.setAttribute('disabled', '');
        throw error;
    }
}

function stopRecord() {
    isRecording = false;
    isPreviewEnabled = false;
    hideMutePreviews();
    updatePreviewButton();

    setMetadatasRecordOn();
    endTime = new Date();
    const stopPromises = [];

    if (recorders.combined) {
        stopPromises.push(new Promise((resolve) => {
            recorders.combined.onstop = async () => {
                if (combinedWritableStream) {
                    await combinedWritableStream.close();
                    await handleFileSave(combinedFileHandle, combinedFileName);
                    logClientAction({ action: "Save recorded file", fileType: "screen", fileName: combinedFileName });
                }
                resolve();
            };
            recorders.combined.stop();
        }));
    }

    if (recorders.camera) {
        stopPromises.push(new Promise((resolve) => {
            recorders.camera.onstop = async () => {
                if (cameraWritableStream) {
                    await cameraWritableStream.close();
                    await handleFileSave(cameraFileHandle, cameraFileName);
                    logClientAction({ action: "Save recorded file", fileType: "camera", fileName: cameraFileName });
                }
                resolve();
            };
            recorders.camera.stop();
        }));
    }

    // Ждем завершения обоих рекордеров, затем вызываем uploadVideo() и cleanup()
    Promise.all(stopPromises).then(async () => {
        await sendButtonsStates('readyToUpload');
        logClientAction({ action: "Recording stopped and files saved" });
        cleanup();
    }).catch(error => {
        console.error("Ошибка при остановке записи:", error);
        logClientAction({ action: "Fail to stop recording", error: error.message });
        cleanup();
    });
    showVisualCue(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
    logClientAction({ action: "Stop recording triggered" });
}

async function startRecord() {
    if (getAvailableDiskSpace() < 2600000000) {
        console.log('На диске недостаточно места!');
        logClientAction({ action: "Fail to start recording", reason: "Insufficient disk space" });
        return;
    }
    if (!combinedPreview.srcObject || !cameraPreview.srcObject) {
        console.log('Выдайте разрешения');
        logClientAction({ action: "Fail to start recording", reason: "Missing media permissions" });
        return;
    }

    rootDirectory = await navigator.storage.getDirectory();
    logClientAction({ action: "Access root directory" });

    startTime = new Date();
    let startRecordTime = getCurrentDateString(startTime);

    combinedFileName = `proctoring_screen_${startRecordTime}.mp4`;
    cameraFileName = `proctoring_camera_${startRecordTime}.mp4`;

    try {
        combinedFileHandle = await rootDirectory.getFileHandle(combinedFileName, {create: true});
        combinedWritableStream = await combinedFileHandle.createWritable();
        logClientAction({ action: "Create file handle", fileType: "screen", fileName: combinedFileName });

        cameraFileHandle = await rootDirectory.getFileHandle(cameraFileName, {create: true});
        cameraWritableStream = await cameraFileHandle.createWritable();
        logClientAction({ action: "Create file handle", fileType: "camera", fileName: cameraFileName });

        await Promise.all([
            addFileToTempList(combinedFileName),
            addFileToTempList(cameraFileName)
        ]);
        logClientAction({ action: "Add files to temp list", files: [combinedFileName, cameraFileName] });

        chrome.storage.local.set({
            'fileNames': {
                screen: combinedFileName,
                camera: cameraFileName
            }
        });
        logClientAction({ action: "Save fileNames to storage" });

        await chrome.runtime.sendMessage({
            action: 'scheduleCleanup',
            delayMinutes: 245
        });
        logClientAction({ action: "Send message", messageType: "scheduleCleanup" });

        forceTimeout = setTimeout(() => {
            console.log('Запись принудительно завершена спустя 4 часа!');
            stopRecord();
            logClientAction({ action: "Force stop recording after 4 hours" });
        }, 14400000);
        
        startTime = new Date();
        recorders.combined.start(5000);
        recorders.camera.start(5000);

        isRecording = true;
        isPreviewEnabled = false;
        hideMutePreviews();
        updatePreviewButton();

        console.log('Запись начата');
        logClientAction({ action: "Start recording" });
        showVisualCue(["Началась запись экрана. Убедитесь, что ваше устройство работает корректно."], "Начало записи");
    } catch (error) {
        console.error('Ошибка при запуске записи:', error.message);
        logClientAction({ action: "Fail to start recording", error: error.message });
        cleanup();
        // Есть внешний обработчик ошибок
        // showVisualCue(["Ошибка при запуске записи:", error], "Ошибка");
        // await sendButtonsStates('needPermissions');
        throw error;
    }
}