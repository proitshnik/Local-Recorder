var streams = {
    screen: null,
    microphone: null,
    camera: null,
    combined: null
};

var recorder = null;
var previewVideo = document.querySelector('.main__preview');

// Переменные для записи и сохранения файла
var rootDirectory = null;
var fileName = null;
var fileHandle = null;
var writableStream = null;
var forceTimeout = null;

var startRecordTime = null;
var finishRecordTime = null;

async function getMediaDevices() {
    return new Promise((resolve, reject) => {
        try {
            chrome.desktopCapture.chooseDesktopMedia(['screen', 'audio'], async (streamId) => {
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
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: streamId,
                            }
                        }
                    });

                    if (!streams.screen || streams.screen.getVideoTracks().length === 0) {
                        throw new Error('Не удалось получить видеопоток с экрана');
                    }
                    if (streams.screen.getAudioTracks().length === 0) {
                        throw new Error('Не удалось получить аудиопоток с экрана');
                    }
                    
                    streams.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
                    
                    if (!streams.microphone || streams.microphone.getAudioTracks().length === 0) {
                        throw new Error('Не удалось получить аудиопоток с микрофона');
                    }
        
                    streams.combined = new MediaStream([streams.screen.getVideoTracks()[0], streams.screen.getAudioTracks()[0],
                        streams.microphone.getAudioTracks()[0]]);
                        
                    previewVideo.srcObject = streams.combined;
        
                    previewVideo.onloadedmetadata = function() {
                        previewVideo.width = previewVideo.videoWidth > 1280 ? 1280 : previewVideo.videoWidth;
                        previewVideo.height = previewVideo.videoHeight > 720 ? 720 : previewVideo.videoHeight;
                    };
        
                    recorder = new MediaRecorder(streams.combined, { mimeType: 'video/mp4;codecs="avc1.42E01E, mp4a.40.2"' });
                    
                    recorder.ondataavailable = async (event) => {
                        if (event.data.size > 0) {
                            await writableStream.write(event.data);
                        }
                    };
        
                    recorder.onstop = async () => {
                        if (forceTimeout) {  
                            clearTimeout(forceTimeout);
                        }
                        await writableStream.close();
            
                        const file = await fileHandle.getFile();
                        const url = URL.createObjectURL(file);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = fileName;
                        link.click();
            
                        console.log('Запись завершена и файл сохранён локально.');
                    
                        if (streams.screen) {
                            streams.screen.getTracks().forEach(track => track.stop());
                        }
                    
                        if (streams.microphone) {
                            streams.microphone.getTracks().forEach(track => track.stop());
                        }
            
                        if (streams.combined) {
                            streams.combined.getTracks().forEach(track => track.stop());
                        }
            
                        previewVideo.srcObject = null;
            
                        console.log('Все потоки и запись остановлены.');
                    };

                    resolve();
                } catch (error) {
                    console.error('Ошибка при захвате:', error);
                    streams.screen = null;
                    streams.microphone = null;
                    reject(error);
                }
            });
        } catch (error) {
            console.log(error);
            reject(error);
        }
    });
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

// Если не делать никаких действий на открытой странице, то нет эффекта.
window.addEventListener('beforeunload', beforeUnloadHandler);

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'stopRecording') {
        if (recorder) {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            stopRecord();
        }
    }
    else if (message.action === 'startRecording' && !recorder) {
        try {
            await getMediaDevices();
            await startRecord();
        } catch (error) {
            // TODO. Обрабатывать ошибки
            console.log(error);
        }
    }
});

function stopRecord() {
    finishRecordTime = getCurrentDateString(new Date());
    recorder.stop();
}

async function startRecord() {
    if (getAvailableDiskSpace() < 2600000000) {
      console.log('На диске недостаточно места! Очистите место и попробуйте снова!');
      return;
    }
    if (!previewVideo.srcObject) {
      console.log('Выдайте разрешения');
      return;
    }
    rootDirectory = await navigator.storage.getDirectory();
    startRecordTime = getCurrentDateString(new Date());
    fileName = `proctoring_${startRecordTime}.mp4`;
    chrome.storage.local.set({'fileName': fileName});
    fileHandle = await rootDirectory.getFileHandle(fileName, { create: true });
    writableStream = await fileHandle.createWritable();
    addFileToTempList(fileName);
    // Через 4 часа
    await chrome.runtime.sendMessage({ 
        action: 'scheduleCleanup', 
        delayMinutes: 245 
    });
    forceTimeout = setTimeout(() => {
        console.log('Запись была принудительно завершена спустя 4 часа!');
        stopRecord();
    }, 14400000);
    recorder.start(5000);
}