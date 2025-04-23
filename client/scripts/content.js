// function showVisualCue(messages, title = "Уведомление") {

//     chrome.runtime.sendMessage({ action: "closePopup" });

//     const existingOverlay = document.getElementById('custom-modal-overlay');
//     if (existingOverlay) {
//         existingOverlay.remove();
//         // logClientAction({ action: "Remove existing modal overlay" });
//     }

//     if (!Array.isArray(messages)) {
//         messages = [messages];
//     }

//     const overlay = document.createElement('div');
//     overlay.id = 'custom-modal-overlay';

//     const modal = document.createElement('div');
//     modal.id = 'custom-modal';

//     modal.innerHTML = `
//         <h2>${title}</h2>
//     <div class="modal-content">
//       ${messages.map(msg => `<p>${msg}</p>`).join('')}
//     </div>
//     <button id="modal-close-btn">
//       Хорошо. Я прочитал(а).
//     </button>`;

//     document.body.style.overflow = 'hidden';

//     modal.querySelector('#modal-close-btn').addEventListener('click', () => {
//         overlay.remove();
//         document.body.style.overflow = '';
//         // logClientAction({ action: "Click modal close button" });
//     });

//     overlay.appendChild(modal);
//     document.body.appendChild(overlay);
//     // logClientAction({ action: "Display modal overlay", title, messages });
// }
// // Приём сообщений от фонового скрипта
// chrome.runtime.onMessage.addListener((message) => {
//     if (message.action === 'showModal') {
//         // logClientAction({ action: "Receive message", messageType: "showModal" });
//         showVisualCue(message.message, message.title);
//         chrome.runtime.sendMessage({ action: 'stopMediaNotification' }, (response) => {
//             if (chrome.runtime.lastError) {
//                 console.error('Error send stopMediaNotification', chrome.runtime.lastError.message);
//                 // logClientAction("Error send stopMediaNotification", chrome.runtime.lastError.message);
//             }
//             else {
//                 console.log('Response stopMediaNotification', response);
//                 // logClientAction("Response stopMediaNotification", response);
//             }
//         });
//     }
// });

async function showNotificationModal(messages, title) {
    return new Promise((resolve) => {
        const existingOverlay = document.getElementById('custom-modal-overlay');
        if (existingOverlay) existingOverlay.remove();

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'showModalNotifyOnActiveTab') {
        showNotificationModal(message.messages, message.title).then(() => {
        sendResponse({ confirmed: true });
        });
        return true;
    }
});
