import {showVisualCue, showVisualCueAsync, waitForNotificationSuppression} from './common.js';
import { deleteFilesFromTempList, buttonsStatesSave } from "./common.js";
import { log_client_action } from './logger.js';

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
var notifications_flag = true;
var invalidStop = false;

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
    log_client_action('All streams stopped')
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

    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
}

function getBrowserFingerprint() {
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
                console.log("Логи очищены перед завершением");
            } else {
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

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
};

const setMetadatasRecordOn = () => {
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
};

async function checkOpenedPopup() {
    const a = await chrome.runtime.getContexts({contextTypes: ['POPUP']});
    return a.length > 0;
}

async function sendButtonsStates(state) {
    if (state === 'readyToUpload' && !server_connection) {
        state = 'needPermissions';
    }
    if (await checkOpenedPopup()) chrome.runtime.sendMessage({action: 'updateButtonStates', state: state}, (response) => {
        if (chrome.runtime.lastError) {
            log_client_action(`Message with state: ${state} failed. Error: ${chrome.runtime.lastError.message}`);
            buttonsStatesSave(state);
        } else {
            log_client_action(`Message with state: ${state} sent successfully`);
        }
    });
    else buttonsStatesSave(state);
}

async function getMediaDevices() {
    return new Promise(async (resolve, reject) => {
        let streamLossSource = null;
        try {
            chrome.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
                if (!streamId) {
                    log_client_action('User canceled screen selection');
                    console.error('Пользователь отменил выбор экрана');
                    reject('Пользователь отменил выбор экрана');
                    await showVisualCueAsync(["Пользователь отменил выбор экрана!"], "Ошибка");
                    return;
                }
                try {
                    streams.screen = await navigator.mediaDevices.getUserMedia({
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: streamId
                            }
                        },
                    });

                    if (!streams.screen || streams.screen.getVideoTracks().length === 0) {
                        log_client_action('Screen permission denied');
                        throw new Error('Не удалось получить видеопоток с экрана');
                    }

                    chrome.runtime.sendMessage({ type: 'screenCaptureStatus', active: true });

                    let micPermissionDenied = false;
                    let camPermissionDenied = false;

                    try {
                        streams.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
                        log_client_action('Microphone access granted');
                    } catch (micError) {
                        if (micError.name === 'NotAllowedError') {
                            micPermissionDenied = true;
                            log_client_action('Microphone permission denied: NotAllowedError');
                            await showVisualCueAsync("Ошибка при доступе к микрофону: NotAllowedError", "Ошибка");
                        } else {
                            log_client_action('Microphone permission denied');
                            //alert('Ошибка при доступе к микрофону: ' + micError.message);
                            await showVisualCueAsync('Ошибка при доступе к микрофону: ' + micError.message, "Ошибка");
                            stopStreams();
                            reject(micError);
                            return;
                        }
                    }

                    try {
                        streams.camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                        log_client_action('Camera access granted');
                    } catch (camError) {
                        if (camError.name === 'NotAllowedError') {
                            log_client_action('Camera permission denied: NotAllowedError');
                            await showVisualCueAsync("Ошибка при доступе к камере: NotAllowedError", "Ошибка");
                            camPermissionDenied = true;
                        } else {
                            log_client_action('Camera permission denied');
                            //alert('Ошибка при доступе к камере: ' + camError.message);
                            await showVisualCueAsync('Ошибка при доступе к камере: ' + camError.message, "Ошибка");
                            stopStreams();
                            reject(camError);
                            return;
                        }
                    }

                    if (micPermissionDenied || camPermissionDenied) {
                        stopStreams();
                        const extensionId = chrome.runtime.id;
                        const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension://${extensionId}`;

                        // alert('Не предоставлен доступ к камере или микрофону.\n' +
                        //     'Сейчас откроется вкладка с настройками доступа для этого расширения.\n' +
                        //     'Пожалуйста, убедитесь, что камера и микрофон разрешены.');
                        await showVisualCueAsync(['Не предоставлен доступ к камере или микрофону.',
                            'Сейчас откроется вкладка с настройками доступа для этого расширения.',
                            'Пожалуйста, убедитесь, что камера и микрофон разрешены.']);

                        const mediaExtensionUrl = chrome.runtime.getURL("media.html");

                        // Закрытие вкладки media.html c открытием вкладки с настройками разрешений расширения
                        chrome.runtime.sendMessage({
                            action: 'closeTabAndOpenTab',
                            mediaExtensionUrl: mediaExtensionUrl,
                            settingsUrl: settingsUrl
                        });

                        log_client_action('Redirecting to permission settings');
                        reject('Доступ к устройствам не предоставлен');
                        return;
                    }

                    // Обработка потери доступа
                    streams.camera.oninactive = async function () {
                        if (streamLossSource) return;
                        streamLossSource = 'camera';
                        log_client_action('Camera stream inactive');

                        if (!recorders.combined && !recorders.camera) return;

                        if (recorders.combined.state === 'inactive' && recorders.camera.state === 'inactive') {
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Разрешение на камеру отозвано.", 
                                "Дайте доступ заново в расширении по кнопке Разрешения."], "Доступ к камере потерян!");
                            stopStreams();
                        } else {
                            stopDuration();
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Текущие записи завершатся. Чтобы продолжить запись заново, выдайте разрешения и начните запись."], "Доступ к камере потерян!");
                            invalidStop = true;
                            stopRecord();
                        }
                    };

                    streams.screen.getVideoTracks()[0].onended = async function () {
                        chrome.runtime.sendMessage({ type: 'screenCaptureStatus', active: false });
                        if (streamLossSource) return;
                        streamLossSource = 'screen';
                        log_client_action('Screen stream ended');

                        if (!recorders.combined || recorders.combined.state === 'inactive') {
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Разрешение на захват экрана отозвано.", 
                                "Дайте доступ заново в расширении по кнопке Разрешения."], "Доступ к экрану потерян!");
                            stopStreams();
                        } else {
                            stopDuration();
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Текущие записи завершатся. Чтобы продолжить запись заново, выдайте разрешения и начните запись."], "Доступ к экрану потерян!");
                            invalidStop = true;
                            stopRecord();
                        }
                    };

                    streams.microphone.getAudioTracks()[0].onended = async function () {
                        if (streamLossSource) return;
                        streamLossSource = 'microphone';
                        log_client_action('Microphone stream ended');

                        if (!recorders.combined || recorders.combined.state === 'inactive') {
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Разрешение на микрофон отозвано.", 
                                "Дайте доступ заново в расширении по кнопке Разрешения."], "Доступ к микрофону потерян!");
                            stopStreams();
                        } else {
                            stopDuration();
                            await sendButtonsStates('needPermissions');
                            await showVisualCueAsync(["Текущие записи завершатся. Чтобы продолжить запись заново, выдайте разрешения и начните запись."], "Доступ к микрофону потерян!");
                            invalidStop = true;
                            stopRecord();
                        }
                    };

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
                    log_client_action('Combined recorder initialized');
                    recorders.camera = new MediaRecorder(streams.camera, { mimeType: 'video/mp4; codecs="avc1.64001E"' });
                    log_client_action('Camera recorder initialized');

                    recorders.combined.ondataavailable = async (event) => {
                        if (event.data.size > 0 && combinedWritableStream) {
                            log_client_action(`Combined data available: ${event.data.size} bytes`);
                            await combinedWritableStream.write(event.data);
                        }
                    };

                    recorders.camera.ondataavailable = async (event) => {
                        if (event.data.size > 0 && cameraWritableStream) {
                            log_client_action(`Camera data available: ${event.data.size} bytes`);
                            await cameraWritableStream.write(event.data);
                        }
                    };

                    resolve();
                } catch (error) {
                    console.error('Ошибка при захвате:', error);
                    stopStreams();
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

function hideMutePreviews() {
    cameraPreview.style.display = 'none';
    combinedPreview.style.display = 'none';

    combinedPreview.muted = true;
}

previewButton.addEventListener('click', () => {
    if (!isRecording) return;

    combinedPreview.muted = true;

    isPreviewEnabled = !isPreviewEnabled;

    const displayValue = isPreviewEnabled ? 'block' : 'none';
    cameraPreview.style.display = displayValue;
    combinedPreview.style.display = displayValue;

    log_client_action(isPreviewEnabled ? 'Preview mode enabled' : 'Preview mode disabled');

    updatePreviewButton();
});

function updatePreviewButton() {
    if (!isRecording) {
        previewButton.disabled = true;
        previewButton.textContent = 'Включить';
        previewButton.classList.remove('enabled', 'disabled');
        return;
    }

    previewButton.disabled = false;
    previewButton.textContent = isPreviewEnabled ? 'Выключить' : 'Включить';
    previewButton.classList.toggle('enabled', !isPreviewEnabled);
    previewButton.classList.toggle('disabled', isPreviewEnabled);
}

async function cleanup() {
    if (forceTimeout) clearTimeout(forceTimeout);
    stopStreams();
    combinedPreview.srcObject = null;
    cameraPreview.srcObject = null;
    recorders.combined = null;
    recorders.camera = null;
    invalidStop = false;
    console.log('Все потоки и запись остановлены.');
    log_client_action('cleanup_completed');
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
        log_client_action(`file_saved: ${name}`);
    } catch (error) {
        console.error(`Ошибка при сохранении файла ${name}:`, error);
        log_client_action(`file_save_error: ${name} - ${error.message}`);
    }
}

const getCurrentDateString = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T` + 
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

const getAvailableDiskSpace = async () => {
    const estimate = await navigator.storage.estimate();
    return estimate.quota - estimate.usage;
};

async function addFileToTempList(fileName) {
    const tempFiles = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (!tempFiles.includes(fileName)) {
        tempFiles.push(fileName);
    }
    return chrome.storage.local.set({'tempFiles': tempFiles});
}

// системное ограничение браузера позволяет выводить пользовательское уведомление только после алерта (в целях безопасности)
const beforeUnloadHandler = (event) => {
    // TODO
    // showVisualCueAsync(["Не закрывайте вкладку расширения при записи!", 
    //     "Не обновляйте вкладку расширения при записи!",
    //     "Не закрывайте браузер при записи!", 
    //     "При закрытии или обновлении вкладки расширения (речь не о всплывающем окне расширения), а также закрытии самого браузера запись будет прервана!"], "Внимание!");
    event.preventDefault();
    event.returnValue = true;
};

window.addEventListener('beforeunload', beforeUnloadHandler);

window.addEventListener('unload', () => {
    buttonsStatesSave('needPermissions');
})

window.addEventListener('load', () => {
    Object.values(streams).some(async (stream) => {
        if (stream === null) {
            await sendButtonsStates('needPermissions');
            return true;
        }
    });
});

// Функция для отправки видео на сервер после завершения записи
async function uploadVideo() {
    chrome.storage.local.get(['session_id', 'extension_logs'], async ({ session_id, extension_logs }) => {
        if (!session_id) {
            console.error("Session ID не найден в хранилище");
            log_client_action('upload_error: no_session_id');
            return;
        }

        const files = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
        if (!files.length) {
            throw new Error(`Ошибка при поиске записей`);
        }

        const formData = new FormData();

        for (const filename of files) {
            if (filename.includes('screen')) {
                formData.append('screen_video', await (await rootDirectory.getFileHandle(filename, {create: false})).getFile(), filename);
            } else {
                formData.append('camera_video', await (await rootDirectory.getFileHandle(filename, {create: false})).getFile(), filename);
            }
        }
        
        formData.append("id", session_id);

        await setMetadatasRecordOff();
        formData.append("metadata", JSON.stringify(metadata));

        if (extension_logs) {
            let logsToSend;
            if (typeof extension_logs === "string") {
                try {
                    logsToSend = JSON.parse(extension_logs);
                } catch (e) {
                    console.error("Ошибка парсинга логов:", e);
                    logsToSend = [{ error: "Invalid logs", raw_data: extension_logs }];
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
        }
        //TODO log_client_action('upload_successful'); не попадает в logs

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
                log_client_action('upload_successful');
            })
            .then(async () => {
                await deleteFilesFromTempList();
                chrome.alarms.get('dynamicCleanup', (alarm) => {
                    if (alarm) {
                        chrome.alarms.clear('dynamicCleanup');
                    }
                    log_client_action('Delete tempfiles successful');
                });
            })
            .catch(async (error) => {
                console.error("Ошибка при отправке видео на сервер:", error);
                await sendButtonsStates('failedUpload');
                log_client_action(`upload_error: ${error.message}`);
            })
            .finally(async () => {
                await clearLogs();
            });
    });
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'stopRecording') {
        log_client_action('Stop recording command received');
        if (recorders.combined || recorders.camera) {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            stopRecord();
            if (!server_connection) await clearLogs();
            await sendButtonsStates('readyToUpload');
        }
    }
    else if (message.action === 'getPermissionsMedia') {
        server_connection = (await chrome.storage.local.get('server_connection'))['server_connection'];
        getMediaDevices()
        .then(async () => {
            await sendButtonsStates('readyToRecord');
        })
        .catch(async () => {
            await sendButtonsStates('needPermissions');
        });
    }
    else if (message.action === 'startRecording') {
        log_client_action('Start recording command received');
        
        const formData = new FormData();
        formData.append('group', message.formData.group || '');
        formData.append('name', message.formData.name || '');
        formData.append('surname', message.formData.surname || '');
        formData.append('patronymic', message.formData.patronymic || '');
        formData.append('link', message.formData.link || '');

        if (server_connection) await initSession(formData);
        else {
            log_client_action({
                action: 'Start recording initiated',
                browserFingerprint: getBrowserFingerprint()
            });

            await chrome.storage.local.set({ 'lastRecordTime': new Date().toISOString() });

            const sessionId = generateObjectId();
            await chrome.storage.local.set({ 'session_id': sessionId });
            log_client_action(`Session initialized with ID: ${sessionId}`);
        }
        
        startRecord()
        .then(async () => {
            await sendButtonsStates('recording');
        })
        .catch(async (error) => {
            // В startRecord есть свой обработчик ошибок
            await sendButtonsStates('needPermissions');
            await showVisualCueAsync(["Ошибка при запуске записи:", error], "Ошибка");
        });
    }
    else if (message.action === 'uploadVideoMedia') {
        log_client_action('Start uploading command received');
        uploadVideo()
        .then(async () => {
            await sendButtonsStates('needPermissions');
        })
        .catch(async () => {
            await sendButtonsStates('failedUpload');
        });
    }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'suppressGlobalVisualCue') {
        notifications_flag = false;
        console.log('notifications_flag = ', notifications_flag);
    }
});

async function initSession(formData) {
    log_client_action({
        action: 'Start recording initiated',
        browserFingerprint: getBrowserFingerprint()
    });

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
        log_client_action(`Session initialized with ID: ${sessionId}`);
    } catch (error) {
        console.error("Ошибка инициализации сессии", error);
        await showVisualCueAsync(["Ошибка инициализации сессии", error.message], "Ошибка")
        log_client_action(`Session initialization failed: ${error.message}`);
        // startRecordButton.removeAttribute('disabled');
		// stopRecordButton.setAttribute('disabled', '');
        throw error;
    }
}

// Инициализируем промис, который разрешится, когда придёт сигнал о подавлении уведомления
let suppressNotificationPromise = new Promise((resolve) => {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'suppressGlobalVisualCue') {
            resolve(true);
        }
    });
});

function stopDuration() {
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
    });

    chrome.runtime.sendMessage({type: 'stopRecordSignal'}, function(response) {
        console.log('stopRecordSignal sent');
    });
}

async function stopRecord() {
    if (!invalidStop) stopDuration();
    chrome.runtime.sendMessage({ type: 'screenCaptureStatus', active: false });
  
    isRecording = false;
    isPreviewEnabled = false;
    hideMutePreviews();
    updatePreviewButton();

    setMetadatasRecordOn();
    endTime = new Date();
    const stopPromises = [];

    if (recorders.combined) {
        stopPromises.push(new Promise(async (resolve) => {
            recorders.combined.onstop = async () => {
                if (combinedWritableStream) {
                    await combinedWritableStream.close();
                    await handleFileSave(combinedFileHandle, combinedFileName);
                }
                resolve();
            };
            if (recorders.combined.state === 'inactive') {
                if (combinedWritableStream) {
                    await combinedWritableStream.close();
                    await handleFileSave(combinedFileHandle, combinedFileName);
                }
                resolve();
            }
            else recorders.combined.stop();
        }));
    }

    if (recorders.camera) {
        stopPromises.push(new Promise(async (resolve) => {
            recorders.camera.onstop = async () => {
                if (cameraWritableStream) {
                    await cameraWritableStream.close();
                    await handleFileSave(cameraFileHandle, cameraFileName);
                }
                resolve();
            };
            if (recorders.camera.state === 'inactive') {
                if (cameraWritableStream) {
                    await cameraWritableStream.close();
                    await handleFileSave(cameraFileHandle, cameraFileName);
                }
                resolve();
            }
            else recorders.camera.stop();
        }));
    }

    // Ждем завершения обоих рекордеров, затем вызываем uploadVideo() и cleanup()
    Promise.all(stopPromises).then(async () => {
        if (invalidStop) {
            // До этого уже вызывается функция
            await sendButtonsStates('needPermissions');
        } else {
            await sendButtonsStates('readyToUpload');
        }
        cleanup();
        if (!server_connection) {
            await deleteFilesFromTempList();
            chrome.alarms.get('dynamicCleanup', (alarm) => {
                if (alarm) {
                    chrome.alarms.clear('dynamicCleanup');
                }
                log_client_action('Delete tempfiles successful');
            });
        }
    }).catch(error => {
        console.error("Ошибка при остановке записи:", error);
        cleanup();
    });

    // После остановки записи ждём либо подтверждения подавления, либо, по истечении таймаута, выполняем уведомление
    waitForNotificationSuppression().then((suppress) => {
        if (!suppress) {
            showVisualCueAsync(["Запись завершена. Файл будет сохранен и загружен на сервер."], "Окончание записи");
        }
    });
    //chrome.runtime.sendMessage({ action: "closePopup" });
    log_client_action('Recording stopping');
}

async function startRecord() {
    if (getAvailableDiskSpace() < 2600000000) {
        console.log('На диске недостаточно места!');
        log_client_action('start_record_error: insufficient_space');
        return;
    }
    if (!combinedPreview.srcObject || !cameraPreview.srcObject) {
        console.log('Выдайте разрешения');
        log_client_action('start_record_error: no_permissions');
        return;
    }

    rootDirectory = await navigator.storage.getDirectory();
    log_client_action('Root directory accessed');
    startTime = new Date();

    let startRecordTime = getCurrentDateString(startTime);

    combinedFileName = `proctoring_screen_${startRecordTime}.mp4`;
    cameraFileName = `proctoring_camera_${startRecordTime}.mp4`;

    try {
        combinedFileHandle = await rootDirectory.getFileHandle(combinedFileName, {create: true});
        combinedWritableStream = await combinedFileHandle.createWritable();
        log_client_action(`Combined file handle created: ${combinedFileName}`);

        cameraFileHandle = await rootDirectory.getFileHandle(cameraFileName, {create: true});
        cameraWritableStream = await cameraFileHandle.createWritable();
        log_client_action(`Camera file handle created: ${cameraFileName}`);

        await addFileToTempList(combinedFileName);
        await addFileToTempList(cameraFileName);
        log_client_action('Files added to temp list');

        chrome.storage.local.set({
            'fileNames': {
                screen: combinedFileName,
                camera: cameraFileName
            }
        });

        await chrome.runtime.sendMessage({
            action: 'scheduleCleanup',
            delayMinutes: 245
        });
        log_client_action('File names saved to storage');

        forceTimeout = setTimeout(() => {
            console.log('Запись принудительно завершена спустя 4 часа!');
            stopRecord();
            log_client_action('recording_force_stopped');
        }, 14400000);
        
        startTime = new Date();
        recorders.combined.start(5000);
        recorders.camera.start(5000);

        isRecording = true;
        isPreviewEnabled = false;
        hideMutePreviews();
        updatePreviewButton();


        console.log('Запись начата');
        log_client_action('recording_started');
        //chrome.runtime.sendMessage({ action: "closePopup" });
        showVisualCueAsync(["Началась запись экрана. Убедитесь, что ваше устройство работает корректно."], "Начало записи");
    } catch (error) {
        console.error('Ошибка при запуске записи:', error.message);
        log_client_action('recording_stopped ' + error);
        cleanup();
        // Есть внешний обработчик ошибок
        // showVisualCue(["Ошибка при запуске записи:", error], "Ошибка");
        // await sendButtonsStates('needPermissions');
        throw error;
    }
}
