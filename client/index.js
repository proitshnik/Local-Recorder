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

let directoryHandle = null;
let fileHandler = null;
let recorder = null;
let cancel = false;
let startRecordTime = null;
let finishRecordTime = null;

const getCurrentDateString = (date) => {
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
}

async function getMedia() {
    if (!directoryHandle) {
        uploadInfo.textContent = "Выберите место сохранения";
        return;
    }
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

        // Для записи создаем новый MediaRecorder
        recorder = new MediaRecorder(combinedStream, {mimeType: "video/webm"});

        // Получаем путь для сохранения файла

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

    } catch (err) {
        console.log(err);
    }
}

async function startRecordCallback() {
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
    finishRecordTime = getCurrentDateString(new Date());
    recorder.stop();
}

function getPermissionsCallback() {
    cancel = false;
    uploadButton.classList.remove('upload_button_fail');
    uploadButton.classList.remove('upload_button_success');
    uploadInfo.textContent = "";
    getMedia();
}

startRecordButton.addEventListener('click', startRecordCallback);

stopRecordButton.addEventListener('click', stopRecordCallback)

permissionsButton.addEventListener('click', getPermissionsCallback);

// saveLocationButton.addEventListener('click', async () => {
//     directoryHandle = await window.showDirectoryPicker();
//     startRecordTime = getCurrentDateString(new Date());
//     fileHandler = await directoryHandle.getFileHandle(`proctoring_${startRecordTime}`, {create: true});
//     console.log(directoryHandle);
// });

uploadButton.addEventListener('click', async () => {
    console.log("Отправка...");

    const formData = new FormData();

    // Проверяем заполненность полей и добавляем их в formData
    let allFieldsFilled = true;
    for (let elem of userInputs) {
        const fieldName = elem.getAttribute('name');
        const fieldValue = elem.value.trim();

        if (fieldValue === '') {
            allFieldsFilled = false;
            uploadInfo.textContent = `Заполните все поля!`;
            uploadButton.classList.add('upload_button_fail');
            break; // Прерываем цикл, если нашли пустое поле
        }

        formData.append(fieldName, fieldValue);
    }

    // Если поля не заполнены, выходим
    if (!allFieldsFilled) return;

    // Проверяем остальные условия
    if (!fileHandler || cancel) {
        uploadInfo.textContent = `Записи не было или сбросили разрешение!`;
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

    // Добавляем файл и временные метки
    formData.append('file', file);
    formData.append('start', startRecordTime);
    formData.append('end', finishRecordTime);

    uploadInfo.textContent = "";

    // Отправка данных
    fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        mode: 'cors',
        body: formData,
    })
        .then(res => {
            if (res.ok) return res.json();
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
        });
});