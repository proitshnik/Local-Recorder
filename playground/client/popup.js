let mediaRecorder;
let recordedChunks = [];

// TODO(пока случайный id)
function generateRecordingId() {
    return 'recording-' + Math.random().toString(36).substr(2, 9); // Генерация случайной строки
}

// Запуск записи
function startRecording(stream) {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    const recordingId = generateRecordingId(); // Генерация ID записи

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        downloadVideo(url);
        alert(`Запись завершена! ID записи: ${recordingId}`); // Вывод ID записи
    };

    mediaRecorder.start();
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
}

// Остановка записи
function stopRecording() {
    mediaRecorder.stop();
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
}

// Функция для скачивания видео
function downloadVideo(url) {
    const username = document.getElementById('username').value.trim() || 'recording'; // Получаем имя пользователя или используем значение по умолчанию
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${username}_recording.webm`; // Имя файла для скачивания 
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Обработчики событий для кнопок
document.getElementById('startBtn').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert("Пожалуйста, введите ваше имя перед началом записи."); // Предупреждение, если имя не введено
        return;
    }

    navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    }).then((stream) => {
        startRecording(stream);
    }).catch((error) => {
        console.error("Ошибка при получении медиа-данных:", error);
    });
});

document.getElementById('stopBtn').addEventListener('click', stopRecording);
