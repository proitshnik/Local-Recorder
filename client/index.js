import { deleteFilesFromTempList } from "./common.js";

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
	const fileNames = await chrome.storage.local.get('fileNames')['fileNames'];
	if (!fileNames || !fileNames.screen || !fileNames.camera) {
		console.log('Один или оба файла не найдены!');
		return;
	}

	const rootDirectory = await navigator.storage.getDirectory();

	const screenFileHandle = await rootDirectory.getFileHandle(fileNames.screen, { create: false });
	const cameraFileHandle = await rootDirectory.getFileHandle(fileNames.camera, { create: false });

	const screenFile = await screenFileHandle.getFile();
	const cameraFile = await cameraFileHandle.getFile();

	if (!screenFile || !cameraFile) {
		console.log('Один или оба файла не найдены!');
		return;
	}

	const username = inputElements.name.value;
	const formData = new FormData();
	formData.append('screen_file', screenFile);  // Файл экрана
	formData.append('camera_file', cameraFile);  // Файл камеры
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
			return Promise.reject(`Ошибка при загрузке файлов: ${res.status}`);
		})
		.then(async () => {
			console.log('Файлы успешно загружены');
			await deleteFilesFromTempList();
			chrome.alarms.get('dynamicCleanup', (alarm) => {
				if (alarm) {
					chrome.alarms.clear('dynamicCleanup');
				}
			});
		})
		.catch(err => {
			console.log(err);
		});
});