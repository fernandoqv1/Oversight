const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Synchronous on purpose: these back window.alert/window.confirm overrides,
  // whose call sites rely on blocking semantics (`if (!confirm(...)) return`).
  nativeAlert: (message) => ipcRenderer.sendSync('native-alert', message),
  nativeConfirm: (message) => ipcRenderer.sendSync('native-confirm', message),
  exportProject: (projectData, filename) => ipcRenderer.invoke('export-project', projectData, filename),
  importProject: () => ipcRenderer.invoke('import-project'),
  readTemplate: (templatePath) => ipcRenderer.invoke('read-template', templatePath),
  convertImageForUpload: (byteArray, fileName) => ipcRenderer.invoke('convert-image-for-upload', byteArray, fileName),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  checkAppleDrivers: () => ipcRenderer.invoke('check-apple-drivers'),
  ensureAppleDrivers: () => ipcRenderer.invoke('ensure-apple-drivers'),
  onAppleDriversProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('apple-drivers-progress', listener);
    return () => ipcRenderer.removeListener('apple-drivers-progress', listener);
  },
  detectPhoneDevices: () => ipcRenderer.invoke('detect-phone-devices'),
  listPhonePhotos: (deviceName, dateFilter, deviceOptions) => ipcRenderer.invoke('list-phone-photos', deviceName, dateFilter, deviceOptions),
  quickListPhonePhotos: (dateFilter) => ipcRenderer.invoke('quick-list-phone-photos', dateFilter),
  loadPhonePhotoPreviews: (deviceName, photos, deviceOptions) => ipcRenderer.invoke('load-phone-photo-previews', deviceName, photos, deviceOptions),
  upgradePhonePhotoPreviews: (deviceName, photos) => ipcRenderer.invoke('upgrade-phone-photo-previews', deviceName, photos),
  onPhoneImportPreviewProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('phone-import-preview-progress', listener);
    return () => ipcRenderer.removeListener('phone-import-preview-progress', listener);
  },
  importPhonePhotos: (deviceName, filePaths, deviceOptions) => ipcRenderer.invoke('import-phone-photos', deviceName, filePaths, deviceOptions),
  onPhoneImportProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('phone-import-progress', listener);
    return () => ipcRenderer.removeListener('phone-import-progress', listener);
  },
  getPhonePhotoThumbnail: (deviceName, photoPath, deviceOptions) => ipcRenderer.invoke('get-phone-photo-thumbnail', deviceName, photoPath, deviceOptions),
  getPhonePhotoThumbnails: (deviceName, photoPaths, deviceOptions) => ipcRenderer.invoke('get-phone-photo-thumbnails', deviceName, photoPaths, deviceOptions),
  readImportedPhoto: (filePath) => ipcRenderer.invoke('read-imported-photo', filePath),
  readPhonePreview: (filePath) => ipcRenderer.invoke('read-phone-preview', filePath),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
});
