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

var rootDirectory = null;
var combinedFileName = null;
var cameraFileName = null;
var combinedFileHandle = null;
var cameraFileHandle = null;
var combinedWritableStream = null;
var cameraWritableStream = null;
var forceTimeout = null;

var startRecordTime = null;
var finishRecordTime = null;

const stopStreams = () => {
    Object.entries(streams).forEach(([stream, value]) => {
        if (value) {
            value.getTracks().forEach(track => track.stop());
            streams[stream] = null;
        }
    });
};

async function getMediaDevices() {
    return new Promise(async (resolve, reject) => {
        try {
            chrome.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
                if (!streamId) {
                    console.error('Пользователь отменил выбор экрана');
                    reject('Пользователь отменил выбор экрана');
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
                        throw new Error('Не удалось получить видеопоток с экрана');
                    }

                    let micPermissionDenied = false;
                    let camPermissionDenied = false;

                    try {
                        streams.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
                    } catch (micError) {
                        if (micError.name === 'NotAllowedError') {
                            micPermissionDenied = true;
                        } else {
                            alert('Ошибка при доступе к микрофону: ' + micError.message);
                            stopStreams();
                            throw micError;
                        }
                    }

                    try {
                        streams.camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    } catch (camError) {
                        if (camError.name === 'NotAllowedError') {
                            camPermissionDenied = true;
                        } else {
                            alert('Ошибка при доступе к камере: ' + camError.message);
                            stopStreams();
                            throw camError;
                        }
                    }

                    if (micPermissionDenied && camPermissionDenied) {
                        stopStreams();
                        reject('Пожалуйста, предоставьте доступ к микрофону и камере в настройках браузера.');
                        return;
                    } else if (micPermissionDenied) {
                        stopStreams();
                        reject('Пожалуйста, предоставьте доступ к микрофону в настройках браузера.');
                        return;
                    } else if (camPermissionDenied) {
                        stopStreams();
                        reject('Пожалуйста, предоставьте доступ к камере в настройках браузера.');
                        return;
                    }


                    streams.combined = new MediaStream([
                        streams.screen.getVideoTracks()[0],
                        streams.microphone.getAudioTracks()[0]
                    ]);

                    combinedPreview.srcObject = streams.combined;
                    cameraPreview.srcObject = streams.camera;

                    combinedPreview.onloadedmetadata = function() {
                        combinedPreview.width = combinedPreview.videoWidth > 1280 ? 1280 : combinedPreview.videoWidth;
                        combinedPreview.height = combinedPreview.videoHeight > 720 ? 720 : combinedPreview.videoHeight;
                    };

                    cameraPreview.onloadedmetadata = function() {
                        cameraPreview.width = 320;
                        cameraPreview.height = 240;
                    };

                    recorders.combined = new MediaRecorder(streams.combined, { mimeType: 'video/webm; codecs=vp9,opus' });
                    recorders.camera = new MediaRecorder(streams.camera, { mimeType: 'video/webm; codecs=vp9' });

                    let combinedFinished = false;
                    let cameraFinished = false;

                    recorders.combined.ondataavailable = async (event) => {
                        if (event.data.size > 0 && combinedWritableStream) {
                            await combinedWritableStream.write(event.data);
                        }
                    };

                    recorders.camera.ondataavailable = async (event) => {
                        if (event.data.size > 0 && cameraWritableStream) {
                            await cameraWritableStream.write(event.data);
                        }
                    };

                    recorders.combined.onstop = async () => {
                        combinedFinished = true;
                        if (combinedWritableStream) {
                            await combinedWritableStream.close();
                            await handleFileSave(combinedFileHandle, combinedFileName);
                        }
                        if (combinedFinished && cameraFinished) {
                            cleanup();
                        }
                    };

                    recorders.camera.onstop = async () => {
                        cameraFinished = true;
                        if (cameraWritableStream) {
                            await cameraWritableStream.close();
                            await handleFileSave(cameraFileHandle, cameraFileName);
                        }
                        if (combinedFinished && cameraFinished) {
                            cleanup();
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

async function cleanup() {
    if (forceTimeout) {
        clearTimeout(forceTimeout);
    }
    stopStreams();
    combinedPreview.srcObject = null;
    cameraPreview.srcObject = null;
    finishRecordTime = getCurrentDateString(new Date());
    console.log('Все потоки и запись остановлены.');
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
    } catch (error) {
        console.error(`Ошибка при сохранении файла ${name}:`, error);
    }
}

const getCurrentDateString = (date) => {
    return `${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
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
    chrome.storage.local.set({'tempFiles': tempFiles});
}

const beforeUnloadHandler = (event) => {
    event.preventDefault();
    event.returnValue = true;
};

window.addEventListener('beforeunload', beforeUnloadHandler);

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'stopRecording') {
        if (recorders.combined || recorders.camera) {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            stopRecord();
        }
    }
    else if (message.action === 'startRecording' && !recorders.combined) {
        try {
            await getMediaDevices();
            await startRecord();
        } catch (error) {
            alert(error);
            console.log(error);
        }
    }
});

function stopRecord() {
    if (recorders.combined) recorders.combined.stop();
    if (recorders.camera) recorders.camera.stop();
}

async function startRecord() {
    if (getAvailableDiskSpace() < 2600000000) {
        console.log('На диске недостаточно места!');
        return;
    }
    if (!combinedPreview.srcObject || !cameraPreview.srcObject) {
        console.log('Выдайте разрешения');
        return;
    }

    rootDirectory = await navigator.storage.getDirectory();
    startRecordTime = getCurrentDateString(new Date());

    combinedFileName = `proctoring_screen_${startRecordTime}.webm`;
    cameraFileName = `proctoring_camera_${startRecordTime}.webm`;

    try {
        combinedFileHandle = await rootDirectory.getFileHandle(combinedFileName, { create: true });
        combinedWritableStream = await combinedFileHandle.createWritable();

        cameraFileHandle = await rootDirectory.getFileHandle(cameraFileName, { create: true });
        cameraWritableStream = await cameraFileHandle.createWritable();

        await Promise.all([
            addFileToTempList(combinedFileName),
            addFileToTempList(cameraFileName)
        ]);

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

        forceTimeout = setTimeout(() => {
            console.log('Запись принудительно завершена спустя 4 часа!');
            stopRecord();
        }, 14400000);

        recorders.combined.start(5000);
        recorders.camera.start(5000);
        console.log('Запись начата');
    } catch (error) {
        console.error('Ошибка при запуске записи:', error);
        cleanup();
    }
}