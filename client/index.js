import {deleteFilesFromTempList} from "./common.js";

const startRecordButton = document.querySelector('.record-section__button_record-start');
const stopRecordButton = document.querySelector('.record-section__button_record-stop');
const uploadButton = document.querySelector('.upload_button');

const inputElements = {
    group: document.querySelector('#group_input'),
    name: document.querySelector('#name_input'),
    surname: document.querySelector('#surname_input'),
    patronymic: document.querySelector('#patronymic_input')
};

window.addEventListener('load', async () => {
    let inputValues = await chrome.storage.local.get('inputElementsValue');
    inputValues = inputValues.inputElementsValue || {};
    for (const [key, value] of Object.entries(inputValues)) {
        inputElements[key].value = value;
    }
});

async function startRecCallback() {
    startRecordButton.setAttribute('disabled', '');
    stopRecordButton.removeAttribute('disabled');
    chrome.storage.local.set({
        'inputElementsValue': {
            group: inputElements.group.value,
            name: inputElements.name.value,
            surname: inputElements.surname.value,
            patronymic: inputElements.patronymic.value
        }
    });

    const formData = new FormData();
    formData.append('group', inputElements.group.value);
    formData.append('name', inputElements.name.value);
    formData.append('surname', inputElements.surname.value);
    formData.append('patronymic', inputElements.patronymic.value);


    try {
        const response = await fetch('http://127.0.0.1:5000/start_session', {
            method: 'POST',
            mode: 'cors',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Сервер вернул ${response.status}');
        }
        const result = await response.json();
        const sessionId = result.id;

        chrome.storage.local.set({'session_id': sessionId}, () => {
            console.log('session_id успешно сохранён!');
        });

    } catch (error) {
        console.error("Ошибка инициализации сессии", error);
        startRecordButton.removeAttribute('disabled');
        stopRecordButton.setAttribute('disabled', '');
        return;
    }

    // После успешной инициализации сессии отправляем сообщение для начала записи
    await chrome.runtime.sendMessage({
        action: "startRecord"
    });
}

async function stopRecCallback() {
    stopRecordButton.setAttribute('disabled', '');
    startRecordButton.removeAttribute('disabled');
    await chrome.runtime.sendMessage({
        action: "stopRecord"
    });
}

startRecordButton.addEventListener('click', startRecCallback);

stopRecordButton.addEventListener('click', stopRecCallback);

uploadButton.addEventListener('click', async () => {
    console.log("Отправка...");
    const fileName = await chrome.storage.local.get('fileName')['fileName'];
    if (!fileName) {
        console.log('Файл не найден!');
        return;
    }
    const fileHandle = await rootDirectory.getFileHandle(fileName, {create: false});
    const file = await fileHandle.getFile();
    if (!file) {
        console.log('Файл не найден!');
        //uploadInfo.textContent = `Файл не найден!`;
        //uploadButton.classList.add('upload_button_fail');
        return;
    }
    //uploadInfo.textContent = "";
    const username = inputElements.name.value;
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
        .then(async () => {
            //uploadInfo.textContent = `Файл успешно загружен, ID: ${result.file_id}`;
            //uploadButton.classList.remove('upload_button_fail');
            //uploadButton.classList.add('upload_button_success');
            await deleteFilesFromTempList();
            chrome.alarms.get('dynamicCleanup', (alarm) => {
                if (alarm) {
                    chrome.alarms.clear('dynamicCleanup');
                }
            });
        })
        .catch(err => {
            console.log(err);
            //uploadInfo.textContent = err;
            //uploadButton.classList.remove('upload_button_success');
            //uploadButton.classList.add('upload_button_fail');
        });
});