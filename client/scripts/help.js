const manifest = chrome.runtime.getManifest();
document.title = `Справка ${manifest.name}`;
document.getElementById('ext-version').textContent = manifest.version;

fetch(chrome.runtime.getURL('../assets/help/readme.html'))
    .then(response => response.text())
    .then(html => {
        document.getElementById('readme-content').innerHTML = html;
    });