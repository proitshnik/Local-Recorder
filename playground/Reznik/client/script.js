// DOM элементы
const startButton = document.querySelector('.userArea_buttonStart');
const stopButton = document.querySelector('.userArea_buttonStop');
const usernameInput = document.querySelector('.inputName');

// Переменные для управления записью
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;

// Функция для генерации уникального ID записи
function generateRecordingId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `rec_${timestamp}_${random}`;
}

// Функция для начала записи
async function startRecording() {
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Пожалуйста, введите имя.');
        return;
    }

    try {
        recordingStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                mediaSource: "screen"
            }
        });

        recordedChunks = [];
        mediaRecorder = new MediaRecorder(recordingStream);

        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        });

        mediaRecorder.addEventListener('stop', () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            downloadVideo(url, generateRecordingId());
            recordedChunks = [];
        });

        mediaRecorder.start(100);
        startButton.disabled = true;
        stopButton.disabled = false;
        console.log('Запись началась');

    } catch (error) {
        console.error('Ошибка при получении доступа к экрану:', error);
        alert('Произошла ошибка при попытке получить доступ к экрану. Проверьте разрешения в Chrome.');
    }
}

// Функция для остановки записи
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        startButton.disabled = false;
        stopButton.disabled = true;
        console.log('Запись окончена');
    }
}

// Функция для скачивания видео
function downloadVideo(url, recordingId) {
    const username = usernameInput.value.trim() || 'recording';
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${username}_recording_${recordingId}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        alert(`Запись успешно завершена!`);
    }, 100);
}

// Обработчики событий
startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);