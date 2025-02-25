document.getElementById('recordButton').onclick = async function () {
    const username = document.getElementById('username').value;
    if (!username) {
        alert('Пожалуйста, введите ваше имя.');
        return;
    }

    if (this.textContent === 'Начать запись') {
        localStorage.setItem('username', username);

        // Запрашиваем доступ к экрану и микрофону
        chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], async (streamId) => {
            if (!streamId) {
                alert('Запись экрана отменена.');
                return;
            }

            try {
                // Получаем медиапоток с экрана и микрофона
                const screenStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: streamId
                        }
                    }
                });

                const microphoneStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });

                // Объединяем потоки
                const combinedStream = new MediaStream([
                    ...screenStream.getVideoTracks(),
                    ...microphoneStream.getAudioTracks()
                ]);

                // Создаем MediaRecorder
                mediaRecorder = new MediaRecorder(combinedStream, {
                    mimeType: 'video/webm; codecs=vp9,opus'
                });
                mediaRecorder.ondataavailable = handleDataAvailable;
                mediaRecorder.start();
                startTime = new Date();

                this.textContent = 'Остановить запись';
                this.classList.add('stop-button');
            } catch (error) {
                console.error('Ошибка при получении доступа к медиаустройствам:', error);
                alert('Не удалось начать запись. Проверьте разрешения.');
            }
        });
    } else {
        // Останавливаем запись
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            this.textContent = 'Начать запись';
            this.classList.remove('stop-button');
        }
    }
};

let mediaRecorder;
let recordedChunks = [];
let startTime;

// Обработчик данных записи
function handleDataAvailable(event) {
    if (event.data.size > 0) {
        recordedChunks.push(event.data);
        const username = localStorage.getItem('username');
        const formattedDate = formatDate(startTime);
        const filename = `${username}_${formattedDate}.webm`;
        const blob = new Blob(recordedChunks, { type: 'video/webm' });

        saveVideoLocally(blob, filename);
        sendVideoToServer(blob, filename);
        recordedChunks = [];
    }
}

// Форматирование даты
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Сохранение видео локально
function saveVideoLocally(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// Отправка видео на сервер
function sendVideoToServer(blob, filename) {
    let formData = new FormData();
    formData.append('file', blob, filename);
    fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData
    }).then(response => response.json())
        .then(success => {
            console.log('Видео успешно загружено:', success);
        }).catch(error => {
            console.error('Ошибка при загрузке видео:', error);
        });
}
