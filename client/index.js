import { deleteFilesFromTempList } from "./common.js";
import { log_client_action } from "./logger.js";

const startRecordButton = document.querySelector('.record-section__button_record-start');
const stopRecordButton = document.querySelector('.record-section__button_record-stop');
const uploadButton = document.querySelector('.upload_button');
const noPatronymicCheckbox = document.querySelector('#no_patronymic_checkbox');

const inputElements = {
	group: document.querySelector('#group_input'),
	name: document.querySelector('#name_input'),
	surname: document.querySelector('#surname_input'),
	patronymic: document.querySelector('#patronymic_input')
};

const validationRules = {
    group: {
        regex: /^\d{4}$/, 
        message: "Группа должна содержать ровно 4 цифры. Пример: '1234'"
    },
    name: {
        regex: /^[А-ЯЁ][а-яё]+$/, 
        message: "Имя должно начинаться с заглавной буквы и содержать только буквы. Пример: 'Иван'"
    },
    surname: {
        regex: /^[А-ЯЁ][а-яё]+$/, 
        message: "Фамилия должна начинаться с заглавной буквы и содержать только буквы. Пример: 'Иванов'"
    },
    patronymic: {
        regex: /^[А-ЯЁ][а-яё]+$/, 
        message: "Отчество должно начинаться с заглавной буквы и содержать только буквы. Пример: 'Иванович'"
    }
};

function validateInput(input) {
    const rule = validationRules[input.id.replace('_input', '')];
    const messageElement = input.nextElementSibling;

    if (!input.value.trim()) {
        messageElement.textContent = rule.message;
        return;
    }
    
    if (!rule.regex.test(input.value)) {
        messageElement.textContent = `Неверно! ${rule.message}`;
    } else {
        messageElement.textContent = "Верно!";
    }
}

function handleFocus(event) {
    const input = event.target;
    const rule = validationRules[input.id.replace('_input', '')];
    const messageElement = input.nextElementSibling;
    
    if (!input.value.trim()) {
        messageElement.textContent = rule.message;
    }
}

function handleBlur(event) {
    const input = event.target;
    const messageElement = input.nextElementSibling;
    
    if (!input.value.trim()) {
        messageElement.textContent = "";
    } else {
        validateInput(input);
    }
}

function saveInputValues() {
    chrome.storage.local.set({
        'inputElementsValue': {
            group: inputElements.group.value,
            name: inputElements.name.value,
            surname: inputElements.surname.value,
            patronymic: inputElements.patronymic.value,
            noPatronymicChecked: noPatronymicCheckbox.checked
        }
    });
	log_client_action('Input values saved');
}

async function checkAndCleanLogs() {
	const now = new Date();
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

	const lastRecord = await chrome.storage.local.get('lastRecordTime');
	const lastRecordTime = lastRecord.lastRecordTime ? new Date(lastRecord.lastRecordTime) : null;

	if (!lastRecordTime || lastRecordTime < oneDayAgo) {
		const logsResult = await chrome.storage.local.get('extension_logs');
		if (logsResult.extension_logs) {
			const logs = JSON.parse(logsResult.extension_logs);
			const cleanedLogs = logs.filter(log => {
				const logTime = new Date(log.time_act);
				return (now - logTime) <= 24 * 60 * 60 * 1000;
			});

			await chrome.storage.local.set({
				'extension_logs': JSON.stringify(cleanedLogs)
			});
		}
	}
}


function savePatronymic() {
    chrome.storage.local.set({
        'savedPatronymic': inputElements.patronymic.value
    });
}

noPatronymicCheckbox.addEventListener('change', async () => {
    if (noPatronymicCheckbox.checked) {
        savePatronymic();
        inputElements.patronymic.value = '';
        inputElements.patronymic.disabled = true;
        inputElements.patronymic.nextElementSibling.textContent = "";
        inputElements.patronymic.style.backgroundColor = "#DCDCDC";
    } else {
        let storedData = await chrome.storage.local.get('savedPatronymic');
        inputElements.patronymic.value = storedData.savedPatronymic || "";
        inputElements.patronymic.disabled = false;
        inputElements.patronymic.style.backgroundColor = "";
        validateInput(inputElements.patronymic);
    }
    saveInputValues();
});

document.querySelectorAll('input').forEach(input => {
    input.setAttribute('autocomplete', 'off');
});

window.addEventListener('load', async () => {
	log_client_action('Popup opened');

	await checkAndCleanLogs();
	log_client_action('Old logs cleaned due to 24-hour inactivity');

    let inputValues = await chrome.storage.local.get('inputElementsValue');
    inputValues = inputValues.inputElementsValue || {};    
    for (const [key, value] of Object.entries(inputValues)) {
        if (key === 'noPatronymicChecked') {
            noPatronymicCheckbox.checked = value;
            if (value) {
                inputElements.patronymic.value = "";
                inputElements.patronymic.setAttribute('disabled', '');
                inputElements.patronymic.nextElementSibling.textContent = "";
                inputElements.patronymic.style.backgroundColor = "#DCDCDC";
            }
        } else {
            const input = inputElements[key];
            input.value = value;
            if (value.trim()) { 
                validateInput(input);
            } else {
                input.nextElementSibling.textContent = "";
            }
        }
    }

    Object.values(inputElements).forEach(input => {
        input.addEventListener('input', () => {
            input.value = input.value.trim()
            validateInput(input);
            saveInputValues();
        });
        input.addEventListener('focus', handleFocus);
        input.addEventListener('blur', handleBlur);
    });
});

async function startRecCallback() {
    let allValid = true;
    Object.values(inputElements).forEach(input => {
        if (input !== inputElements.patronymic || !noPatronymicCheckbox.checked) {
            validateInput(input);
            if (!input.value.trim() || input.nextElementSibling.textContent.startsWith("Неверно!")) {
                allValid = false;
            }
        }
    });
    if (!allValid) {
        console.warn("Невозможно начать запись: есть ошибки или незаполненные поля.");
        return;
    }

    startRecordButton.setAttribute('disabled', '');
    stopRecordButton.removeAttribute('disabled');
    saveInputValues();

	const browserFingerprint = {
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

	log_client_action({
		action: 'Start recording initiated',
		browserFingerprint: browserFingerprint
	});


	await chrome.storage.local.set({
		'lastRecordTime': new Date().toISOString()
	});
    
    const formData = new FormData();
    formData.append('group', inputElements.group.value);
    formData.append('name', inputElements.name.value);
    formData.append('surname', inputElements.surname.value);
    formData.append('patronymic', noPatronymicCheckbox.checked ? "Без_отчества" : inputElements.patronymic.value.trim());

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

		chrome.storage.local.set({'session_id': sessionId}, () => {
			console.log('session_id успешно сохранён!');
			log_client_action(`Session initialized with ID: ${sessionId}`);
		});

	} catch (error) {
		console.error("Ошибка инициализации сессии", error);
		log_client_action(`Session initialization failed: ${error.message}`);
		startRecordButton.removeAttribute('disabled');
		stopRecordButton.setAttribute('disabled', '');
		return;
	}

	// После успешной инициализации сессии отправляем сообщение для начала записи
	await chrome.runtime.sendMessage({
		action: "startRecord"
	});
	log_client_action('Start recording message sent');
}

async function stopRecCallback() {
	stopRecordButton.setAttribute('disabled', '');
	startRecordButton.removeAttribute('disabled');
	log_client_action('Stop recording initiated');
	await chrome.runtime.sendMessage({
		action: "stopRecord"
	});
	log_client_action('Stop recording message sent');
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
