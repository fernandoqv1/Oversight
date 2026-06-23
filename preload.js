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
  startWirelessImport: () => ipcRenderer.invoke('start-wireless-import'),
  stopWirelessImport: () => ipcRenderer.invoke('stop-wireless-import'),
  onWirelessPhotoReceived: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('wireless-photo-received', listener);
    return () => ipcRenderer.removeListener('wireless-photo-received', listener);
  },
  // Project file storage (photos, documents)
  saveProjectFile: (projectId, category, fileId, buffer) =>
    ipcRenderer.invoke('save-project-file', projectId, category, fileId, buffer),
  readProjectFile: (projectId, category, fileId) =>
    ipcRenderer.invoke('read-project-file', projectId, category, fileId),
  deleteProjectFile: (projectId, category, fileId) =>
    ipcRenderer.invoke('delete-project-file', projectId, category, fileId),
  listProjectFiles: (projectId, category) =>
    ipcRenderer.invoke('list-project-files', projectId, category),
  deleteProjectFolder: (projectId) =>
    ipcRenderer.invoke('delete-project-folder', projectId),
  copyFileToProject: (projectId, category, fileId, srcPath) =>
    ipcRenderer.invoke('copy-file-to-project', projectId, category, fileId, srcPath),
  openFileDialog: (options) =>
    ipcRenderer.invoke('open-file-dialog', options),
  // Disk-backed project JSON storage (resilient against localStorage wipes)
  saveProjectJson: (projectId, jsonString) => ipcRenderer.invoke('save-project-json', projectId, jsonString),
  loadProjectJson: (projectId) => ipcRenderer.invoke('load-project-json', projectId),
  listAllProjectIds: () => ipcRenderer.invoke('list-all-project-ids'),
  deleteProjectJson: (projectId) => ipcRenderer.invoke('delete-project-json', projectId),
  // Wireless document upload
  startWirelessDocumentImport: () => ipcRenderer.invoke('start-wireless-document-import'),
  stopWirelessDocumentImport: () => ipcRenderer.invoke('stop-wireless-document-import'),
  onWirelessDocumentReceived: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('wireless-document-received', listener);
    return () => ipcRenderer.removeListener('wireless-document-received', listener);
  },
});
