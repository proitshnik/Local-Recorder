import { log_client_action } from "./logger";

function showVisualCue(messages, title = "Уведомление") {

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
// Приём сообщений от фонового скрипта
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'showModal') {
        showVisualCue(message.message, message.title);
        chrome.runtime.sendMessage({ action: 'stopMediaNotification' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error send stopMediaNotification', chrome.runtime.lastError.message);
                log_client_action("Error send stopMediaNotification", chrome.runtime.lastError.message);
            }
            else {
                console.log('Response stopMediaNotification', response);
                log_client_action("Response stopMediaNotification", response);
            }
        });
    }
});