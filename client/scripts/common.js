import { logClientAction } from "./logger.js";

export async function deleteFilesFromTempList() {
    const tempFiles = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (tempFiles.length > 0) {
        const root = await navigator.storage.getDirectory();
        logClientAction({ action: "Start delete temporary files", fileCount: tempFiles.length });
        for (const file of tempFiles) {
            try {
                await root.removeEntry(file);
                logClientAction({ action: "Delete temp file", fileName: file });
            } catch (e) {
                console.log(e);
                logClientAction({ action: "Fail to delete temp file", fileName: file, error: String(e) });
            }
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
            mediaExtensionUrl: chrome.runtime.getURL("pages/media.html") }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error send gotoMediaTab', chrome.runtime.lastError.message);
                    logClientAction({ action: "Error send gotoMediaTab", message: chrome.runtime.lastError.message});
                }
                else {
                    // console.log('Response gotoMediaTab', response);
                    logClientAction({ action: "Response gotoMediaTab", response});
                }
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
    if (existingOverlay) {
        existingOverlay.remove();
        logClientAction({ action: "Remove existing modal overlay before showing new one" });
    }

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
        logClientAction({ action: "Close modal overlay by user" });
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    logClientAction({ action: "Display modal overlay", title, messages });
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
            logClientAction({ action: 'Send message to content script', messageType: "showModal", tabId: tab.id, title, messages });
        });
    });
}

export function waitForNotificationSuppression(timeout = 300) {
    return new Promise((resolve) => {
        // Создаём временный слушатель сообщений для получения сигнала от background.js
        function messageListener(message, sender, sendResponse) {
            if (message.action === 'suppressGlobalVisualCue') {
                logClientAction("waitForNotificationSuppression suppressGlobalVisualCue")
                chrome.runtime.onMessage.removeListener(messageListener);
                resolve(true);
            }
        }
        chrome.runtime.onMessage.addListener(messageListener);

        // Если сигнал не придёт за timeout мс, считаем, что уведомление нужно показать
        setTimeout(() => {
            logClientAction("waitForNotificationSuppression suppressGlobalVisualCue timeout")
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve(false);
        }, timeout);
    });
}


export function buttonsStatesSave(state) {
	chrome.storage.local.set({'bState': state});
    logClientAction({ action: "Save buttons states"});
}