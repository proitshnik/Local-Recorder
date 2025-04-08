import fs from 'fs';
import { marked } from 'marked';
import path from 'path';

// Пути
const inputPath = path.resolve('README.md');
const outputPath = path.resolve('client/assets/help/readme.html');

// Чтение README.md
fs.readFile(inputPath, 'utf-8', (err, data) => {
    if (err) {
        console.error('Ошибка чтения README.md:', err);
        return;
    }

    // Конвертация Markdown в HTML
    const html = marked(data);

    // Обёртка для читаемого вида
    const fullHtml = `
<!-- Этот файл сгенерирован автоматически из README.md -->
<section class="readme">
${html}
</section>`.trim();

    // Запись в readme.html
    fs.writeFile(outputPath, fullHtml, (err) => {
        if (err) {
            console.error('Ошибка записи readme.html:', err);
        } else {
            console.log('readme.html успешно сгенерирован!');
        }
    });
});
