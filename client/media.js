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
    try {
        // TODO. Оставить выбор только всего экрана. Если получится сделать чтобы при выборе звук экрана нельзя было отключить
        streams.screen = await navigator.mediaDevices.getDisplayMedia({video: true, audio: true,});
        streams.microphone = await navigator.mediaDevices.getUserMedia({audio: true});

        streams.combined = new MediaStream([streams.screen.getVideoTracks()[0],
            streams.screen.getAudioTracks()[0], streams.microphone.getAudioTracks()[0]]);
        
        previewVideo.srcObject = streams.combined;

        previewVideo.onloadedmetadata = function() {
            previewVideo.width = previewVideo.videoWidth > 1280 ? 1280 : previewVideo.videoWidth;
            previewVideo.height = previewVideo.videoHeight > 720 ? 720 : previewVideo.videoHeight;
        };

        recorder = new MediaRecorder(streams.combined, { mimeType: "video/mp4;codecs=avc1,mp4a.40.2" });
        
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

        
    } catch (error) {
        // TODO.
        console.log(error);
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

window.addEventListener('load', async () => {
    try {
        await getMediaDevices();
        await startRecord();
    } catch (error) {
        console.log(error);
    }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'stopRecording') {
        if (recorder) {
            stopRecord();
        }
    }
    // TODO.
    else if (message.action === 'startRecording' && !recorder) {
        try {
            await getMediaDevices();
            await startRecord();
        } catch (error) {
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