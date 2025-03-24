document.addEventListener("DOMContentLoaded", function () {
    // Если на странице есть форма поиска, то обработчик отправки формы
    const searchForm = document.getElementById("searchForm");
    if (searchForm) {
        searchForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const formData = new FormData(this);
            const query = new URLSearchParams(formData).toString();

            fetch(`/get_sessions?${query}`)
                .then(response => response.json())
                .then(data => {
                    localStorage.setItem("searchResults", JSON.stringify(data));
                    window.location.href = "/results";
                })
                .catch(error => console.error("Ошибка запроса:", error));
        });
    }

    // Код ниже выполняется только на странице /results
    const resultsContainer = document.getElementById("results");
    if (!resultsContainer) return;

    const searchResults = JSON.parse(localStorage.getItem("searchResults") || "[]");

    if (!searchResults || searchResults.length === 0) {
        resultsContainer.innerHTML = "<p>Нет записей в базе данных.</p>";
    } else {
        const table = document.createElement("table");

        const columns = [
            "id",
            "group",
            "surname",
            "name",
            "patronymic",
            "session_date_start",
            "session_time_start",
            "session_date_end",
            "session_time_end",
            "screen_video_path",
            "camera_video_path",
            "status"
        ];

        // Создаем заголовок таблицы
        const headerRow = document.createElement("tr");
        columns.forEach(column => {
            const th = document.createElement("th");
            th.textContent = column;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // Заполняем таблицу данными
        searchResults.forEach(session => {
            const row = document.createElement("tr");
            columns.forEach(column => {
                const td = document.createElement("td");
                td.textContent = session[column] || "";
                row.appendChild(td);
            });
            table.appendChild(row);
        });

        resultsContainer.appendChild(table);
    }
});
