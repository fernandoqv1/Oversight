const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  exportProject: (projectData, filename) => ipcRenderer.invoke('export-project', projectData, filename),
  importProject: () => ipcRenderer.invoke('import-project'),
  readTemplate: (templatePath) => ipcRenderer.invoke('read-template', templatePath),
  convertImageForUpload: (byteArray, fileName) => ipcRenderer.invoke('convert-image-for-upload', byteArray, fileName),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
});
