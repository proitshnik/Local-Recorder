import { deleteFilesFromTempList } from "./common.js";

const saveLocationButton = document.querySelector('.save-location_button');
const startRecordButton = document.querySelector('.record-start_button');
const stopRecordButton = document.querySelector('.record-stop_button');
const permissionsButton = document.querySelector('.permissions_button');
const uploadButton = document.querySelector('.upload_button');
const uploadInfo = document.querySelector('.upload_info');
const userInputs = document.querySelectorAll('.user-inputs > input');
const outputVideo = document.querySelector('.output-video');
//const cameraSelector = document.querySelector('.camera');
//const screenSelector = document.querySelector('.screen');
//const audioSelector = document.querySelector('.microphone');

let recorder = null;
let cancel = false;
let startRecordTime = null;
let finishRecordTime = null;

// Сохранение в Origin Private File System

let rootDirectory = null;
let fileName = null;
let fileHandle = null;
let writableStream = null;

let forceTimeout = null;


const getStorage = async () => {
  rootDirectory = await navigator.storage.getDirectory();
};

async function addFileToTempList(fileName) {
  const tempFiles =  (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
  // get tempFiles = {'tempFiles': [...]}
  if (!tempFiles.includes(fileName)) {
    tempFiles.push(fileName);
  }
  chrome.storage.local.set({'tempFiles': tempFiles});
}

const getAvailableDiskSpace = async () => {
    const estimate = await navigator.storage.estimate();
    return estimate.quota - estimate.usage;
};

const getCurrentDateString = (date) => {
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
}

async function getMedia() {
    try {
        // facingMode: "user" - для получения фронтальной камеры
        //const cameraStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "user"} });

        const screenStream = await navigator.mediaDevices.getDisplayMedia({video: true});
        const audioStream = await navigator.mediaDevices.getUserMedia({audio: true});

        const audioTrack = audioStream.getAudioTracks()[0];
        const videoTrack = screenStream.getVideoTracks()[0];

        const combinedStream = new MediaStream([videoTrack, audioTrack]);

        outputVideo.srcObject = combinedStream;

        outputVideo.onloadedmetadata = function () {
            outputVideo.width = outputVideo.videoWidth > 800 ? 800 : outputVideo.videoWidth;
            outputVideo.height = outputVideo.videoHeight > 600 ? 600 : outputVideo.videoHeight;
        };


        videoTrack.onended = function () {
            uploadInfo.textContent = "Демонстрация экрана была прекращена. Пожалуйста, перезапустите запись.";
            cancel = true;
        };

        audioTrack.onended = function () {
            uploadInfo.textContent = "Разрешение на микрофон было сброшено. Пожалуйста, разрешите микрофон для продолжения.";
            cancel = true;
        };

        recorder = new MediaRecorder(combinedStream, {mimeType: "video/webm"});

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

            console.log("Запись завершена и файл сохранён локально.");
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
            }

            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }

            if (combinedStream) {
                combinedStream.getTracks().forEach(track => track.stop());
            }

            outputVideo.srcObject = null;

            console.log("Все потоки и запись остановлены.");
        };

    } catch (err) {
        console.log(err);
    }
}

async function startRecordCallback() {
    if (getAvailableDiskSpace() < 2600000000) {
      uploadInfo.textContent = "На диске недостаточно места! Очистите место и попробуйте снова!";
      return;
    }
    if (!outputVideo.srcObject) {
        uploadInfo.textContent = "Выдайте разрешения";
        return;
    }
    uploadInfo.textContent = "";
    startRecordButton.setAttribute('disabled', '');
    stopRecordButton.removeAttribute('disabled');
    startRecordTime = getCurrentDateString(new Date());
    fileName = `proctoring_${startRecordTime}.webm`;
    fileHandle = await rootDirectory.getFileHandle(fileName, { create: true });
    writableStream = await fileHandle.createWritable();
    addFileToTempList(fileName);
    // Через 4 часа
    await chrome.runtime.sendMessage({ 
      action: 'scheduleCleanup', 
      delayMinutes: 245 
    });
    forceTimeout = setTimeout(() => {
      uploadInfo.textContent = 'Запись была принудительно завершена спустя 4 часа!';
      stopRecordCallback();
    }, 14400000);
    recorder.start(1000);
}

function stopRecordCallback() {
    stopRecordButton.setAttribute('disabled', '');
    startRecordButton.removeAttribute('disabled');
    finishRecordTime = getCurrentDateString(new Date());
    recorder.stop();
}

function getPermissionsCallback() {
  cancel = false;
  uploadButton.classList.remove('upload_button_fail');
  uploadButton.classList.remove('upload_button_success');
  uploadInfo.textContent = "";
  getStorage();
  getMedia();
}

startRecordButton.addEventListener('click', startRecordCallback);

stopRecordButton.addEventListener('click', stopRecordCallback)

permissionsButton.addEventListener('click', getPermissionsCallback);

uploadButton.addEventListener('click', async () => {
  console.log("Отправка...");
  if (usernameInput.value === '') {
    uploadInfo.textContent = `Введите имя в поле!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  if (!fileHandle || cancel) {
    uploadInfo.textContent = `Записи не было или сбросили разрешение!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  if (recorder.state !== 'inactive') {
    uploadInfo.textContent = `Остановите запись!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  const file = await fileHandle.getFile();
  if (!file) {
    uploadInfo.textContent = `Файл не найден!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  uploadInfo.textContent = "";
  const username = usernameInput.value;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('username', username);
  formData.append('start', startRecordTime);
  formData.append('end', finishRecordTime);

  fetch('http://127.0.0.1:5000/upload', {
    method: 'POST',
    mode: 'cors',
    body: formData,
  })
    .then(res => {
      if (res.ok) {
        return res.json();
      }
      return Promise.reject(`Ошибка при загрузке файла: ${res.status}`);
    })
    .then(async (result) => {
      uploadInfo.textContent = `Файл успешно загружен, ID: ${result.file_id}`;
      uploadButton.classList.remove('upload_button_fail');
      uploadButton.classList.add('upload_button_success');
      await deleteFilesFromTempList();
      chrome.alarms.get('dynamicCleanup', (alarm) => {
        if (alarm) {
          chrome.alarms.clear('dynamicCleanup');
        }
      });
    })
    .catch(err => {
      uploadInfo.textContent = err;
      uploadButton.classList.remove('upload_button_success');
      uploadButton.classList.add('upload_button_fail');
    });
});