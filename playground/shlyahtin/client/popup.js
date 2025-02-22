const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const usernameInput = document.getElementById("username");

let mediaRecorder;
let chunks = [];

startBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();

    if (!username) {
        alert("Введите имя пользователя!");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

        mediaRecorder = new MediaRecorder(stream);
        chunks = [];

        mediaRecorder.ondataavailable = event => chunks.push(event.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${username}_recording.webm`; // Имя пользователя в названии файла
            a.click();

            stopBtn.style.display = "none";
            startBtn.style.display = "inline-block";
        };

        mediaRecorder.start();
        console.log("Запись началась");

        startBtn.style.display = "none";
        stopBtn.style.display = "inline-block";

    } catch (error) {
        console.error("Ошибка при получении доступа к экрану:", error);
    }
});

stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        console.log("Запись остановлена");
    }
});
