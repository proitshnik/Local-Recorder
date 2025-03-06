import { deleteFilesFromTempList } from "./common.js";

const startRecordButton = document.querySelector('.record-section__button_record-start');
const stopRecordButton = document.querySelector('.record-section__button_record-stop');

async function startRecCallback() {
	startRecordButton.setAttribute('disabled', '');
    stopRecordButton.removeAttribute('disabled');
	console.log("Start callback!");
	await chrome.runtime.sendMessage({
		action: "startRecord"
	});
}

async function stopRecCallback() {
	console.log("Stop callback!");
	stopRecordButton.setAttribute('disabled', '');
    startRecordButton.removeAttribute('disabled');
	await chrome.runtime.sendMessage({
		action: "stopRecord"
	});
}

startRecordButton.addEventListener('click', startRecCallback);

stopRecordButton.addEventListener('click', stopRecCallback)

/*
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
});*/