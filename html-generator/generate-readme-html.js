import fs from 'fs';
import path from 'path';
import vm from 'vm';

// Пути
const inputPath = path.resolve('../README.md');
// const inputPath = path.resolve('../client/README.md');
const outputPath = path.resolve('../client/assets/help/readme.html');
const markedPath = path.resolve('./libraries/marked.min.js');

// Загружаем marked.min.js как строку и выполняем в sandbox
const sandbox = {};
const markedCode = fs.readFileSync(markedPath, 'utf-8');
vm.createContext(sandbox);
vm.runInContext(markedCode, sandbox);
const marked = sandbox.marked; // теперь можно использовать marked()

// Чтение README.md
fs.readFile(inputPath, 'utf-8', (err, data) => {
    if (err) {
        console.error('Ошибка чтения README.md:', err);
        return;
    }

    // Конвертация Markdown в HTML
    const html = marked.parse(data);

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
