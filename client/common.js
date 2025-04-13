import { log_client_action } from "./logger";

export async function deleteFilesFromTempList() {
    const tempFiles = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (tempFiles.length > 0) {
        const root = await navigator.storage.getDirectory();
        for (const file of tempFiles) {
            await root.removeEntry(file).catch((e) => {console.log(e)});
        }
        chrome.storage.local.remove('tempFiles');
    }
}

// Асинхронная версия модального уведомления, возвращающая Promise
export function showVisualCueAsync(messages, title = "Уведомление") {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "closePopup" });

        chrome.runtime.sendMessage({ 
            action: "gotoMediaTab",
            mediaExtensionUrl: chrome.runtime.getURL("media.html") }, (response) => {
                if (chrome.runtime.lastError) {
                console.error('Error send gotoMediaTab', chrome.runtime.lastError.message);
                log_client_action("Error send gotoMediaTab", chrome.runtime.lastError.message);
                }
                console.log('Response gotoMediaTab', response);
                log_client_action("Response gotoMediaTab", response);
            });

        const existingOverlay = document.getElementById('custom-modal-overlay');
        if (existingOverlay) existingOverlay.remove();

        if (!Array.isArray(messages)) {
            messages = [messages];
        }

        const overlay = document.createElement('div');
        overlay.id = 'custom-modal-overlay';

        const modal = document.createElement('div');
        modal.id = 'custom-modal';

        modal.innerHTML = `
            <h2>${title}</h2>
            <div class="modal-content">
                ${messages.map(msg => `<p>${msg}</p>`).join('')}
            </div>
            <button id="modal-close-btn">Хорошо. Я прочитал(а).</button>
        `;

        modal.querySelector('#modal-close-btn').addEventListener('click', () => {
            overlay.remove();
            document.body.style.overflow = '';
            resolve();
        });

        document.body.style.overflow = 'hidden';
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

export function showVisualCue(messages, title = "Уведомление") {

    chrome.runtime.sendMessage({ action: "closePopup" });

    const existingOverlay = document.getElementById('custom-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    if (!Array.isArray(messages)) {
        messages = [messages];
    }

    const overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';

    const modal = document.createElement('div');
    modal.id = 'custom-modal';

    modal.innerHTML = `
        <h2>${title}</h2>
    <div class="modal-content">
      ${messages.map(msg => `<p>${msg}</p>`).join('')}
    </div>
    <button id="modal-close-btn">
      Хорошо. Я прочитал(а).
    </button>`;

    document.body.style.overflow = 'hidden';

    modal.querySelector('#modal-close-btn').addEventListener('click', () => {
        overlay.remove();
        document.body.style.overflow = '';
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

export function showGlobalVisualCue(messages, title) {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'showModal',
                title: title,
                message: messages
            });
        });
    });
}

export function waitForNotificationSuppression(timeout = 150) {
    return new Promise((resolve) => {
        // Создаём временный слушатель сообщений для получения сигнала от background.js
        function messageListener(message, sender, sendResponse) {
            if (message.action === 'suppressGlobalVisualCue') {
                chrome.runtime.onMessage.removeListener(messageListener);
                resolve(true);
            }
        }
        chrome.runtime.onMessage.addListener(messageListener);

        // Если сигнал не придёт за timeout мс, считаем, что уведомление нужно показать
        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve(false);
        }, timeout);
    });
}


export function buttonsStatesSave(state) {
	chrome.storage.local.set({'bState': state});
}