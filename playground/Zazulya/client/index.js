const saveLocationButton = document.querySelector('.save-location_button');
const startRecordButton = document.querySelector('.record-start_button');
const stopRecordButton = document.querySelector('.record-stop_button');
const permissionsButton = document.querySelector('.permissions_button');
const uploadButton = document.querySelector('.upload_button');
const uploadInfo = document.querySelector('.upload_info');
const usernameInput = document.querySelector('#username_input');
const outputVideo = document.querySelector('.output-video');
//const cameraSelector = document.querySelector('.camera');
//const screenSelector = document.querySelector('.screen');
//const audioSelector = document.querySelector('.microphone');

let directoryHandle = null;
let fileHandler = null;
let recorder = null;

let cancel = false;

// Not working
const combineCameraAndScreen = (cameraSelector, screenSelector) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 1280 || screenSelector.videoWidth;
  canvas.height = 960 || screenSelector.videoHeight;
  
  const drawComposite = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Очистка канваса
    ctx.drawImage(screenSelector, 0, 0, canvas.width, canvas.height);
    // Рисуем камеру в углу 
    const camWidth = canvas.width * 0.10;
    const camHeight = canvas.height * 0.10;
    ctx.drawImage(cameraSelector, canvas.width - camWidth - 10, canvas.height - camHeight - 10, camWidth, camHeight);
    
    requestAnimationFrame(drawComposite);
  }
  drawComposite();
  
  // fps = 60
  return canvas.captureStream(60);
};

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

        outputVideo.onloadedmetadata = function() {
            outputVideo.width = outputVideo.videoWidth > 800 ? 800 : outputVideo.videoWidth;
            outputVideo.height = outputVideo.videoHeight > 600 ? 600 : outputVideo.videoHeight;
        };


        videoTrack.onended = function() {
          uploadInfo.textContent = "Демонстрация экрана была прекращена. Пожалуйста, перезапустите запись.";
          cancel = true;
        };

        audioTrack.onended = function() {
          uploadInfo.textContent = "Разрешение на микрофон было сброшено. Пожалуйста, разрешите микрофон для продолжения.";
          cancel = true;
        };

        // Для записи создаем новый MediaRecorder
        recorder = new MediaRecorder(combinedStream, {mimeType: "video/webm"});
        console.log(recorder);
        // Получаем путь для сохранения файла
        fileHandler = await directoryHandle.getFileHandle("testreco.webm", {create: true});
        const writableStream = await fileHandler.createWritable();

        recorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                await writableStream.write(event.data);
            }
        };

        recorder.onstop = async () => {
            await writableStream.close();
            console.log("Запись завершена и файл сохранён локально.");
            //if (cameraStream) {
            //    cameraStream.getTracks().forEach(track => track.stop());
            //}
        
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
            }
        
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
        
            //if (canvasStream) {
            //    canvasStream.getTracks().forEach(track => track.stop());
            //}
            
            if (combinedStream) {
                combinedStream.getTracks().forEach(track => track.stop());
            }

            outputVideo.srcObject = null;

            console.log("Все потоки и запись остановлены.");
        };
        
    } catch(err) {
        console.log(err);
    }
}

function startRecordCallback() {
    if (directoryHandle === null) {
      uploadInfo.textContent = "Выберите место сохранения";
      return;
    }
    if (!outputVideo.srcObject) {
      uploadInfo.textContent = "Выдайте разрешения";
      return;
    }
    uploadInfo.textContent = "";
    startRecordButton.setAttribute('disabled', '');
    stopRecordButton.removeAttribute('disabled');
    recorder.start();
}

function stopRecordCallback() {
    stopRecordButton.setAttribute('disabled', '');
    startRecordButton.removeAttribute('disabled');
    recorder.stop();
}

function getPermissionsCallback() {
  cancel = false;
  uploadButton.classList.remove('upload_button_fail');
  uploadButton.classList.remove('upload_button_success');
  getMedia();
}

startRecordButton.addEventListener('click', startRecordCallback);

stopRecordButton.addEventListener('click', stopRecordCallback)

permissionsButton.addEventListener('click', getPermissionsCallback);

saveLocationButton.addEventListener('click', async () => {
  directoryHandle = await window.showDirectoryPicker();
  console.log(directoryHandle);
});

uploadButton.addEventListener('click', async () => {
  console.log("Отправка...");
  if (usernameInput.value === '') {
    uploadInfo.textContent = `Введите имя в поле!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  if (!fileHandler || cancel) {
    uploadInfo.textContent = `Записи не было или сбросили разрешение2!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  if (recorder.state !== 'inactive') {
    uploadInfo.textContent = `Остановите запись!`;
    uploadButton.classList.add('upload_button_fail');
    return;
  }
  const file = await fileHandler.getFile();
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
    .then(result => {
      uploadInfo.textContent = `Файл успешно загружен, ID: ${result.file_id}`;
      uploadButton.classList.remove('upload_button_fail');
      uploadButton.classList.add('upload_button_success');
    })
    .catch(err => {
      uploadInfo.textContent = err;
      uploadButton.classList.remove('upload_button_success');
      uploadButton.classList.add('upload_button_fail');
    })
});