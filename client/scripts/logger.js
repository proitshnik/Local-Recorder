let logQueue = Promise.resolve();
let logBuffer = [];
let isFlushing = false;

export async function flushLogs() {
    if (isFlushing || logBuffer.length === 0) return;
    isFlushing = true;

    logQueue = logQueue.then(async () => {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['extension_logs'], (result) => resolve(result));
            });

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
                // console.log('Размер сериализованных логов:', new TextEncoder().encode(serializedLogs).length, 'байт');
            } catch (e) {
                console.error('Ошибка сериализации логов:', e.message);
                return;
            }

            await new Promise((resolve) => {
                chrome.storage.local.set({ 'extension_logs': serializedLogs }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Ошибка при сохранении логов:', chrome.runtime.lastError.message);
                    } else {
                        // console.log('Батч логов успешно сохранен', logs);
                    }
                    resolve();
                });
            });
        } catch (e) {
            console.error('Ошибка при выполнении flushLogs:', e);
        } finally {
            isFlushing = false;
        }
    });
}

export function logClientAction(data) {
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
    });
}

setInterval(flushLogs, 2000);

export function clearLogs() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ clearingLogs: true }, () => {
            setTimeout(() => {
                chrome.storage.local.remove('extension_logs', () => {
                    if (chrome.runtime.lastError) {
                        console.error('Ошибка при очистке логов:', chrome.runtime.lastError);
                        chrome.storage.local.set({ clearingLogs: false });
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log('Логи успешно очищены');
                        logClientAction({ action: 'Логи успешно очищены' });
                        chrome.storage.local.set({ clearingLogs: false });
                        resolve();
                    }
                });
            }, 100);  // Задержка 100ms перед удалением, чтобы дать шанс завершиться логам
        });
    });
}
