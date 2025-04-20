let logQueue = Promise.resolve();

export function logClientAction(data) {
    logQueue = logQueue.then(() => new Promise((resolve) => {
        chrome.storage.local.get(['clearingLogs'], (result) => {
            if (result.clearingLogs) {
                console.log('Попытка логирования во время очистки логов. Лог пропущен:', data);
                resolve();
                return;
            }

            chrome.storage.local.get(['extension_logs'], (result) => {
                const logs = result.extension_logs ? JSON.parse(result.extension_logs) : [];
                const time_act = new Date().toISOString();

                const logEntry = typeof data === 'string'
                    ? { time_act, action: data }
                    : { time_act, ...data };

                logs.push(logEntry);
                chrome.storage.local.set({ 'extension_logs': JSON.stringify(logs) }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Ошибка при сохранении логов:', chrome.runtime.lastError);
                    }
                    resolve();
                });
            });
        });
    }));
}
