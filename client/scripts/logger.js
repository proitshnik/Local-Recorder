let logQueue = Promise.resolve();
let logBuffer = [];
let isFlushing = false;

function flushLogs() {
    if (isFlushing || logBuffer.length === 0) return;
    isFlushing = true;

    logQueue = logQueue.then(() => new Promise((resolve) => {
        chrome.storage.local.get(['extension_logs'], (result) => {
            let logs = [];
            try {
                logs = result.extension_logs ? JSON.parse(result.extension_logs) : [];
            } catch (e) {
                console.error('Ошибка при парсинге extension_logs:', e.message);
                logs = [];
            }

            logs.push(...logBuffer);
            logBuffer = [];

            let serializedLogs;
            try {
                serializedLogs = JSON.stringify(logs);
                console.log('Размер сериализованных логов:', new TextEncoder().encode(serializedLogs).length, 'байт');
            } catch (e) {
                console.error('Ошибка сериализации логов:', e.message);
                isFlushing = false;
                resolve();
                return;
            }

            chrome.storage.local.set({ 'extension_logs': serializedLogs }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Ошибка при сохранении логов:', chrome.runtime.lastError.message);
                } else {
                    console.log('Батч логов успешно сохранен:', logs.slice(-logBuffer.length));
                }
                isFlushing = false;
                resolve();
            });
        });
    }));
}

export function logClientAction(data) {
    console.log('Начало логирования:', data);

    chrome.storage.local.get(['clearingLogs'], (result) => {
        if (result.clearingLogs) {
            console.log('Попытка логирования во время очистки логов. Лог пропущен:', data);
            return;
        }


        const time_act = new Date().toISOString();
        const logEntry = typeof data === 'string'
            ? { time_act, action: data }
            : { time_act, ...data };

        logBuffer.push(logEntry);

        if (logBuffer.length >= 5 || data.action === 'Get browser fingerprint') {
            flushLogs();
        }
    });
}

setInterval(flushLogs, 5000);