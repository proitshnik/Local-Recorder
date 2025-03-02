export async function deleteFilesFromTempList() {
    const tempFiles = (await chrome.storage.local.get('tempFiles'))['tempFiles'] || [];
    if (tempFiles.length > 0) {
      const root = await navigator.storage.getDirectory();
      for (const file of tempFiles) {
        await root.removeEntry(file).catch((e) => {console.log(e)});
      }
      chrome.storage.local.remove('tempFiles');
    }
  }