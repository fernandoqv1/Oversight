const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

/** Default page zoom for all app windows (1.0 = browser 100%) */
const DEFAULT_ZOOM_FACTOR = 0.675;

let mainWindow;
let updateCheckInProgress = false;
let autoUpdater = null;

function getAutoUpdater() {
  if (!app.isPackaged) return null;
  if (autoUpdater) return autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    return autoUpdater;
  } catch (error) {
    console.error('electron-updater is not available:', error);
    return null;
  }
}

function sendUpdateStatus(status, data = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update-status', { status, ...data });
}

function setupAutoUpdater() {
  const updater = getAutoUpdater();
  if (!updater) return;

  updater.on('checking-for-update', () => {
    updateCheckInProgress = true;
    sendUpdateStatus('checking');
  });
  updater.on('update-available', (info) => {
    sendUpdateStatus('available', { version: info?.version || '' });
  });
  updater.on('update-not-available', () => {
    updateCheckInProgress = false;
    sendUpdateStatus('not-available');
  });
  updater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', {
      percent: Math.round(progress?.percent || 0)
    });
  });
  updater.on('update-downloaded', (info) => {
    updateCheckInProgress = false;
    sendUpdateStatus('downloaded', { version: info?.version || '' });
  });
  updater.on('error', (error) => {
    updateCheckInProgress = false;
    console.error('Auto update error:', error);
    sendUpdateStatus('error', { message: error?.message || 'Update check failed' });
  });
}

/**
 * Show page zoom in the window title (e.g. "AsbTrack Oversight — 75%") so Ctrl+/Ctrl- zoom is visible
 * in the title bar and taskbar preview.
 */
function wireZoomTitleDisplay(win) {
  let baseTitle = 'Oversight Desktop';

  const stripZoomSuffix = (t) =>
    String(t || '').replace(/\s*[-–—]\s*\d+(?:\.\d+)?%\s*$/, '').trim();

  const zoomPct = () => Math.round(win.webContents.getZoomFactor() * 100);

  const apply = () => {
    win.setTitle(`${baseTitle} — ${zoomPct()}%`);
  };

  win.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    const raw = title && String(title).trim();
    baseTitle = stripZoomSuffix(raw) || baseTitle;
    apply();
  });

  win.webContents.on('zoom-changed', () => {
    apply();
  });

  win.webContents.on('did-finish-load', () => {
    const stripped = stripZoomSuffix(win.webContents.getTitle());
    if (stripped) baseTitle = stripped;
    apply();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Block window.open and target=_blank: deny new windows by default. An XSS in the
  // renderer would otherwise be able to spawn a window with our preload context.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Restrict in-app navigation to local file:// URLs within our app directory.
  // Prevents an injected link from redirecting the renderer to a remote origin
  // (which would then still have access to the preload-exposed IPC bridge).
  const appDir = __dirname;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      if (target.protocol !== 'file:') {
        event.preventDefault();
        return;
      }
      const targetPath = decodeURIComponent(target.pathname.replace(/^\//, ''));
      const resolved = path.resolve(targetPath);
      if (!resolved.toLowerCase().startsWith(appDir.toLowerCase())) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Refuse any webview attachment - we do not use <webview> tags.
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  wireZoomTitleDisplay(mainWindow);

  mainWindow.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR);

  // Load the index.html file - using relative path from main.js location
  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // #region agent log
  try { debugPhoneLog('main.js:startup', 'app ready - new code loaded', { isPackaged: app.isPackaged, version: app.getVersion(), logPath: debugPhoneLogPath }, 'STARTUP'); } catch (e) { /* ignore */ }
  // #endregion
  createWindow();
  setupAutoUpdater();

  const updater = getAutoUpdater();
  if (updater) {
    setTimeout(() => {
      updater.checkForUpdates().catch((error) => {
        console.error('Initial update check failed:', error);
        sendUpdateStatus('error', { message: error?.message || 'Update check failed' });
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Updates only run in the packaged app.' };
  }
  const updater = getAutoUpdater();
  if (!updater) {
    return { success: false, error: 'Auto-update is not available in this build.' };
  }
  if (updateCheckInProgress) {
    return { success: true, checking: true };
  }
  try {
    updateCheckInProgress = true;
    const result = await updater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo || null };
  } catch (error) {
    updateCheckInProgress = false;
    console.error('Manual update check failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  const updater = getAutoUpdater();
  if (!updater) {
    return { success: false, error: 'Auto-update is not available in this build.' };
  }
  try {
    updater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    console.error('Install update failed:', error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file operations for Excel export/import
ipcMain.handle('export-project', async (event, projectData, filename) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Project',
      defaultPath: filename || 'project.xlsx',
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePath) {
      // The actual export will be done in the renderer process
      // We just return the file path
      return { success: true, filePath };
    }
    return { success: false };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-project', async (event) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Project',
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      // Read the file and return the path
      // The actual import will be done in the renderer process
      return { success: true, filePath: filePaths[0] };
    }
    return { success: false };
  } catch (error) {
    console.error('Import error:', error);
    return { success: false, error: error.message };
  }
});

// Handle folder selection for project folder location
ipcMain.handle('select-folder', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Project Folder',
      properties: ['openDirectory']
    });
    if (filePaths && filePaths.length > 0) {
      return { success: true, folderPath: filePaths[0] };
    }
    return { success: false };
  } catch (error) {
    console.error('Select folder error:', error);
    return { success: false, error: error.message };
  }
});

// Open folder in file explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') {
      return { success: false, error: 'No folder path provided' };
    }
    // Reject embedded null bytes which can cause path-truncation tricks.
    if (folderPath.includes('\0')) {
      return { success: false, error: 'Invalid path' };
    }
    // Verify the target exists and is a directory before opening. shell.openPath
    // happily launches executables and shortcuts via OS file association, so
    // restricting to directories prevents a tampered project record from
    // launching arbitrary binaries through this IPC.
    let stat;
    try {
      stat = await fs.stat(folderPath);
    } catch {
      return { success: false, error: 'Folder not found or not accessible' };
    }
    if (!stat.isDirectory()) {
      return { success: false, error: 'Path is not a directory' };
    }
    const result = await shell.openPath(folderPath);
    // shell.openPath returns '' on success, or error message on failure
    if (result === '') {
      return { success: true };
    }
    return { success: false, error: result || 'Folder not found or not accessible' };
  } catch (error) {
    console.error('Open folder error:', error);
    return { success: false, error: error.message };
  }
});

// Handle template file reading for document generation.
// Hardened against path traversal: only basenames ending in .docx are accepted,
// the resolved path must stay within the bundled templates directory, and
// optional 'templates/' prefixes from older callers are normalized.
ipcMain.handle('read-template', async (event, templatePath) => {
  try {
    if (typeof templatePath !== 'string' || !templatePath) {
      return { success: false, error: 'Invalid template path' };
    }
    if (templatePath.includes('\0')) {
      return { success: false, error: 'Invalid template path' };
    }
    // Normalize: strip optional leading "templates/" or "templates\" the renderer
    // may pass, then reduce to a basename to defeat traversal attempts.
    const stripped = templatePath.replace(/^[\\/]*templates[\\/]+/i, '');
    const baseName = path.basename(stripped);
    if (!baseName || baseName === '.' || baseName === '..') {
      return { success: false, error: 'Invalid template path' };
    }
    // Allow only .docx templates (the only format the app generates).
    if (!baseName.toLowerCase().endsWith('.docx')) {
      return { success: false, error: 'Only .docx templates are allowed' };
    }
    const templatesDir = path.resolve(__dirname, 'templates');
    const fullPath = path.resolve(templatesDir, baseName);
    // Defense in depth: confirm the resolved path is inside the templates dir.
    if (!(fullPath === templatesDir || fullPath.startsWith(templatesDir + path.sep))) {
      return { success: false, error: 'Invalid template path' };
    }
    const buffer = await fs.readFile(fullPath);
    return { success: true, data: buffer };
  } catch (error) {
    console.error('Template read error:', error);
    return { success: false, error: error.message };
  }
});

// ---------- Phone Photo Import (libimobiledevice + MTP fallback) ----------

const phoneImobile = require('./lib/phone-imobile');

// #region agent log
const debugPhoneLogPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'debug-ad218e.log')
  : path.join(__dirname, 'debug-ad218e.log');
function debugPhoneLog(location, message, data, hypothesisId) {
  const entry = JSON.stringify({ sessionId: 'ad218e', location, message, data, hypothesisId, timestamp: Date.now() });
  try { require('fs').appendFileSync(debugPhoneLogPath, `${entry}\n`); } catch { /* ignore */ }
  fetch('http://127.0.0.1:7450/ingest/17289360-d3d5-4846-a1eb-264da60df995', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ad218e' },
    body: entry,
  }).catch(() => {});
}
// #endregion

function getPhotoBridgeScript() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'photo-bridge.ps1');
  }
  return path.join(__dirname, 'scripts', 'photo-bridge.ps1');
}

function normalizePhoneBackend(options) {
  if (options && options.backend === 'libimobiledevice') {
    return { backend: 'libimobiledevice', udid: options.udid || null };
  }
  return { backend: 'mtp', udid: null };
}

async function detectPhoneDevicesUnified() {
  const devices = [];
  const backends = { libimobiledevice: false, mtp: false };
  const imobileAvailable = phoneImobile.isAvailable();
  let imResult = null;
  let imobileError = null;

  if (imobileAvailable) {
    try {
      imResult = await phoneImobile.detect();
      if (imResult.available) backends.libimobiledevice = true;
      if (imResult.success && Array.isArray(imResult.devices)) {
        for (const d of imResult.devices) {
          devices.push({
            name: d.name,
            backend: 'libimobiledevice',
            udid: d.udid,
          });
        }
      }
    } catch (error) {
      imobileError = error.message;
      console.warn('libimobiledevice detect failed:', error.message);
    }
  }

  let mtpResult = null;
  let mtpError = null;
  try {
    mtpResult = await runPhotoBridge(['-Action', 'detect'], 30000);
    if (mtpResult.success) {
      backends.mtp = true;
      for (const d of mtpResult.devices || []) {
        const duplicate = devices.some((existing) => {
          const a = (existing.name || '').toLowerCase();
          const b = (d.name || '').toLowerCase();
          return a === b || a.includes('iphone') && b.includes('iphone');
        });
        if (!duplicate) {
          devices.push({ name: d.name, backend: 'mtp', type: d.type || '' });
        }
      }
    }
  } catch (error) {
    mtpError = error.message;
    console.warn('MTP detect failed:', error.message);
  }

  devices.sort((a, b) => {
    if (a.backend === b.backend) return 0;
    return a.backend === 'libimobiledevice' ? -1 : 1;
  });

  const imobileStatus = {
    available: imobileAvailable,
    connected: (imResult?.devices?.length ?? 0) > 0,
    error: imobileError || imResult?.error || null,
  };

  return { success: true, devices, backends, imobileStatus };
}

const phoneThumbCache = new Map();

function sniffImageFormat(buffer) {
  if (!buffer || buffer.length < 12) return 'unknown';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';
  const box = buffer.slice(4, 8).toString('ascii');
  if (box === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('hei') || brand === 'mif1' || brand === 'hevc' || brand === 'avif') return 'heic';
  }
  if (buffer.slice(0, 4).toString('ascii') === 'ftyp') return 'heic';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E) return 'png';
  return 'unknown';
}

function iosPhotoDedupKey(fileName) {
  const upper = String(fileName || '').toUpperCase();
  const edited = upper.match(/^IMG_E(\d+)/);
  if (edited) return { key: edited[1], edited: true };
  const original = upper.match(/^IMG_(\d+)/);
  if (original) return { key: original[1], edited: false };
  return { key: upper, edited: false };
}

function dedupeIosMtpPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return photos;
  const groups = new Map();
  for (const photo of photos) {
    const name = photo.name || path.basename(photo.path || '');
    const { key, edited } = iosPhotoDedupKey(name);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { photo, edited });
      continue;
    }
    // Prefer original (IMG_####) over edited duplicate (IMG_E####) for reliable MTP copy
    if (!edited && existing.edited) {
      groups.set(key, { photo, edited: false });
    }
  }
  return Array.from(groups.values()).map((entry) => entry.photo);
}

const PHONE_PREVIEW_MAX_DIM = 1200;

function estimatePreviewSeconds(photoCount, phase = 'previews') {
  const count = Math.max(1, Number(photoCount) || 1);
  if (phase === 'list') return Math.max(15, Math.ceil(count * 3));
  if (phase === 'copying') return Math.max(20, Math.ceil(count * 18));
  return Math.max(12, Math.ceil(count * 8));
}

function remainingPreviewSeconds(total, completed, previewStartMs, previewBudgetSec) {
  const remaining = Math.max(0, total - completed);
  if (remaining === 0) return 0;
  if (completed > 0) {
    const elapsedSec = (Date.now() - previewStartMs) / 1000;
    const perItem = elapsedSec / completed;
    return Math.max(1, Math.ceil(perItem * remaining));
  }
  return Math.max(1, Math.ceil((previewBudgetSec / total) * remaining));
}

function remainingCopyPhaseSeconds(elapsedSec, copyBudgetSec, previewBudgetSec) {
  if (elapsedSec <= copyBudgetSec) {
    return Math.ceil((copyBudgetSec - elapsedSec) + previewBudgetSec);
  }
  const overrun = elapsedSec - copyBudgetSec;
  const copyTail = Math.max(12, Math.ceil(copyBudgetSec * 0.2 + overrun * 0.45));
  return Math.ceil(copyTail + previewBudgetSec);
}

function resizeNativeImage(img, maxDim = PHONE_PREVIEW_MAX_DIM) {
  if (!img || img.isEmpty()) return null;
  const size = img.getSize();
  let w = size.width;
  let h = size.height;
  if (w > maxDim || h > maxDim) {
    if (w >= h) {
      h = Math.round(h * maxDim / w);
      w = maxDim;
    } else {
      w = Math.round(w * maxDim / h);
      h = maxDim;
    }
  }
  return img.resize({ width: Math.max(1, w), height: Math.max(1, h), quality: 'best' }).toJPEG(100);
}

async function buildThumbnailJpeg(filePath, maxDim = PHONE_PREVIEW_MAX_DIM) {
  let input;
  try {
    input = await fs.readFile(filePath);
  } catch {
    return null;
  }
  if (!input.length) return null;

  async function convertHeicBuffer() {
    const heicConvert = require('heic-convert');
    const output = await heicConvert({ buffer: input, format: 'JPEG', quality: 1 });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }

  const format = sniffImageFormat(input);

  if (format === 'heic') {
    try {
      const jpegBuffer = await convertHeicBuffer();
      const img = nativeImage.createFromBuffer(jpegBuffer);
      return resizeNativeImage(img, maxDim);
    } catch {
      return null;
    }
  }

  if (format === 'jpeg') {
    const img = nativeImage.createFromBuffer(input);
    if (img && !img.isEmpty()) return resizeNativeImage(img, maxDim);
    try {
      const jpegBuffer = await convertHeicBuffer();
      const converted = nativeImage.createFromBuffer(jpegBuffer);
      return resizeNativeImage(converted, maxDim);
    } catch {
      return null;
    }
  }

  const imgFromPath = nativeImage.createFromPath(filePath);
  if (imgFromPath && !imgFromPath.isEmpty()) return resizeNativeImage(imgFromPath, maxDim);

  try {
    const jpegBuffer = await convertHeicBuffer();
    const converted = nativeImage.createFromBuffer(jpegBuffer);
    return resizeNativeImage(converted, maxDim);
  } catch {
    return null;
  }
}

async function importDevicePhotosToTemp(deviceName, photoPaths) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) {
    return { byName: new Map(), errors: [] };
  }

  const tempDir = toWindowsPath(path.join(app.getPath('temp'), 'oversight-phone-thumbs', `${Date.now()}-import`));
  await fs.mkdir(tempDir, { recursive: true });
  const timeoutMs = Math.min(600000, 45000 + paths.length * 90000);
  const importResult = await runPhotoBridge(
    ['-Action', 'import', '-DeviceName', deviceName, '-Files', JSON.stringify(paths), '-DestDir', tempDir],
    timeoutMs
  );

  const byName = new Map();
  for (const item of importResult.imported || []) {
    if (item?.name && item?.localPath) {
      byName.set(item.name, item.localPath);
    }
  }
  return { byName, errors: importResult.errors || [], tempDir };
}

function findImportedLocalPath(byName, photoPath) {
  if (!byName || !photoPath) return null;
  const baseName = path.basename(photoPath);
  if (byName.has(baseName)) return byName.get(baseName);
  const lower = baseName.toLowerCase();
  for (const [name, localPath] of byName.entries()) {
    if (String(name).toLowerCase() === lower) return localPath;
  }
  return null;
}

function serializePhonePreviewPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).map((photo, index) => ({
    path: photo.path,
    previewPath: photo.previewPath || undefined,
    previewMimeType: photo.previewMimeType || undefined,
    index,
  }));
}

async function buildHighResPreviewsFromDevice(deviceName, photos, onProgress) {
  if (!deviceName || !Array.isArray(photos) || photos.length === 0) return photos;

  const paths = photos.map((photo) => photo.path).filter(Boolean);
  const total = photos.length;
  const jobStartMs = Date.now();
  const copyBudgetSec = estimatePreviewSeconds(total, 'copying');
  const previewBudgetSec = estimatePreviewSeconds(total, 'previews');
  const report = (payload) => {
    if (typeof onProgress === 'function') onProgress(payload);
  };

  const reportCopyProgress = () => {
    const elapsedSec = (Date.now() - jobStartMs) / 1000;
    report({
      phase: 'copying',
      completed: 0,
      total,
      secondsRemaining: remainingCopyPhaseSeconds(elapsedSec, copyBudgetSec, previewBudgetSec),
    });
  };

  reportCopyProgress();
  const copyHeartbeat = setInterval(reportCopyProgress, 1000);

  let byName;
  try {
    ({ byName } = await importDevicePhotosToTemp(deviceName, paths));
  } finally {
    clearInterval(copyHeartbeat);
  }

  const previewRoot = path.join(app.getPath('temp'), 'oversight-phone-import', `previews-${Date.now()}`);
  await fs.mkdir(previewRoot, { recursive: true });

  const results = [];
  const previewStartMs = Date.now();
  let previewCompleted = 0;

  report({
    phase: 'previews',
    completed: 0,
    total,
    secondsRemaining: remainingPreviewSeconds(total, 0, previewStartMs, previewBudgetSec),
  });

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    if (!photo?.path) {
      results.push(photo);
      continue;
    }
    const localPath = findImportedLocalPath(byName, photo.path);
    let updated = photo;
    if (localPath) {
      try {
        const jpeg = await buildThumbnailJpeg(localPath);
        if (jpeg) {
          const safeName = path.basename(photo.path).replace(/[^a-zA-Z0-9._-]/g, '_');
          const previewPath = path.join(previewRoot, `${index}-${safeName}.jpg`);
          await fs.writeFile(previewPath, jpeg);
          updated = {
            ...photo,
            previewPath,
            previewMimeType: 'image/jpeg',
            thumbBase64: jpeg.toString('base64'),
            thumbMimeType: 'image/jpeg',
          };
          phoneThumbCache.set(`${deviceName}|${photo.path}`, {
            success: true,
            base64: updated.thumbBase64,
            mimeType: 'image/jpeg',
          });
        }
      } catch {
        /* keep photo without preview */
      }
    }
    results.push(updated);

    previewCompleted += 1;
    report({
      phase: 'previews',
      completed: previewCompleted,
      total,
      secondsRemaining: remainingPreviewSeconds(total, previewCompleted, previewStartMs, previewBudgetSec),
      photo: updated.previewPath
        ? { path: updated.path, previewPath: updated.previewPath, index }
        : { path: updated.path, index },
    });
  }

  return results;
}

function toWindowsPath(filePath) {
  return String(filePath).replace(/\//g, '\\');
}

async function fetchMtpShellThumbnails(deviceName, photoPaths) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) return [];

  const normalizedPaths = paths.map((p) => toWindowsPath(p));
  const timeoutMs = Math.min(120000, 20000 + normalizedPaths.length * 2500);
  const result = await runPhotoBridge(
    ['-Action', 'thumbnails', '-DeviceName', deviceName, '-Files', JSON.stringify(normalizedPaths)],
    timeoutMs
  );

  if (!result.success) {
    throw new Error(result.error || 'Shell thumbnail request failed');
  }

  const byNormalized = new Map();
  for (let i = 0; i < paths.length; i += 1) {
    byNormalized.set(normalizedPaths[i], paths[i]);
  }

  const fetched = [];
  for (const thumb of result.thumbnails || []) {
    const normalizedKey = toWindowsPath(thumb.path);
    const originalPath = byNormalized.get(normalizedKey) || thumb.path;
    const response = {
      path: originalPath,
      success: !!(thumb.success && thumb.base64),
      base64: thumb.base64 || undefined,
      mimeType: result.mimeType || 'image/jpeg',
    };
    if (response.success) {
      phoneThumbCache.set(`${deviceName}|${originalPath}`, {
        success: true,
        base64: response.base64,
        mimeType: response.mimeType,
      });
    }
    fetched.push(response);
  }

  debugPhoneLog('main.js:thumbnails', 'shell thumbnails built', {
    requested: paths.length,
    successCount: fetched.filter((t) => t.success).length,
  }, 'A,C');

  return fetched;
}

async function fetchMtpCopyThumbnails(deviceName, photoPaths) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) return [];

  const photos = paths.map((photoPath) => ({ path: photoPath }));
  const withPreviews = await buildHighResPreviewsFromDevice(deviceName, photos);
  return withPreviews.map((photo) => ({
    path: photo.path,
    success: !!(photo.thumbBase64),
    base64: photo.thumbBase64 || undefined,
    mimeType: photo.thumbMimeType || 'image/jpeg',
  }));
}

async function runPhotoBridge(args, timeoutMs) {
  let bridgeArgs = [...args];
  const filesIdx = bridgeArgs.indexOf('-Files');
  if (filesIdx !== -1 && filesIdx + 1 < bridgeArgs.length) {
    const filesJson = bridgeArgs[filesIdx + 1];
    if (typeof filesJson === 'string' && filesJson.trim().startsWith('[')) {
      const filesPath = toWindowsPath(path.join(app.getPath('temp'), `oversight-bridge-${Date.now()}.json`));
      await fs.writeFile(filesPath, filesJson, 'utf8');
      bridgeArgs = [
        ...bridgeArgs.slice(0, filesIdx),
        '-FilesPath', filesPath,
        ...bridgeArgs.slice(filesIdx + 2),
      ];
    }
  }

  return new Promise(async (resolve, reject) => {
    const scriptPath = getPhotoBridgeScript();
    try {
      await fs.access(scriptPath);
    } catch {
      reject(new Error(`Phone import script not found at ${scriptPath}`));
      return;
    }
    const psArgs = [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...bridgeArgs,
    ];
    const proc = spawn('powershell.exe', psArgs, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Phone import operation timed out'));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        reject(new Error(stderr.trim() || 'Failed to parse photo bridge output'));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function cachePhotosFromListResult(deviceName, photos) {
  if (!deviceName || !Array.isArray(photos)) return;
  for (const photo of photos) {
    if (photo.thumbBase64) {
      phoneThumbCache.set(`${deviceName}|${photo.path}`, {
        success: true,
        base64: photo.thumbBase64,
        mimeType: photo.thumbMimeType || 'image/jpeg',
      });
    }
  }
}

ipcMain.handle('load-phone-photo-previews', async (event, deviceName, photos) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    const list = Array.isArray(photos) ? photos : [];
    const sendProgress = (payload) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('phone-import-preview-progress', payload);
      }
    };
    const upgraded = await buildHighResPreviewsFromDevice(deviceName, list, sendProgress);
    cachePhotosFromListResult(deviceName, upgraded);
    return { success: true, photos: serializePhonePreviewPhotos(upgraded) };
  } catch (error) {
    console.error('load-phone-photo-previews error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('upgrade-phone-photo-previews', async (_event, deviceName, photos) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    const upgraded = await buildHighResPreviewsFromDevice(deviceName, Array.isArray(photos) ? photos : []);
    cachePhotosFromListResult(deviceName, upgraded);
    return { success: true, photos: serializePhonePreviewPhotos(upgraded) };
  } catch (error) {
    console.error('upgrade-phone-photo-previews error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quick-list-phone-photos', async (_event, dateFilter) => {
  try {
    const args = ['-Action', 'quick-list'];
    if (dateFilter && typeof dateFilter === 'string') {
      args.push('-DateFilter', dateFilter);
    }
    const result = await runPhotoBridge(args, dateFilter ? 120000 : 240000);
    if (result.success && Array.isArray(result.photos)) {
      result.photos = dedupeIosMtpPhotos(result.photos);
    }
    return result;
  } catch (error) {
    console.error('quick-list-phone-photos error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-phone-devices', async () => {
  try {
    return await detectPhoneDevicesUnified();
  } catch (error) {
    console.error('detect-phone-devices error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-phone-photos', async (_event, deviceName, dateFilter, deviceOptions) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }

    const args = ['-Action', 'list', '-DeviceName', deviceName];
    if (dateFilter && typeof dateFilter === 'string') {
      args.push('-DateFilter', dateFilter);
    }
    const listTimeout = dateFilter ? 120000 : 240000;
    try {
      const result = await runPhotoBridge(args, listTimeout);
      if (result.success && Array.isArray(result.photos)) {
        const before = result.photos.length;
        result.photos = dedupeIosMtpPhotos(result.photos);
        cachePhotosFromListResult(deviceName, result.photos);
        debugPhoneLog('main.js:list', 'mtp list with previews', {
          before,
          after: result.photos.length,
          withThumbs: result.photos.filter((p) => p.thumbBase64).length,
        }, 'DEDUP');
        return { ...result, backend: 'mtp' };
      }
    } catch (error) {
      console.warn('MTP list failed; trying libimobiledevice:', error.message);
    }

    const backend = normalizePhoneBackend(deviceOptions);
    if (backend.backend === 'libimobiledevice' && backend.udid) {
      try {
        const result = await phoneImobile.list(backend.udid, dateFilter || '');
        if (result.success && Array.isArray(result.photos) && result.photos.length > 0) {
          return { ...result, backend: 'libimobiledevice' };
        }
      } catch (error) {
        console.warn('libimobiledevice list failed:', error.message);
      }
    }

    return { success: false, error: 'Could not load photos from the connected phone.' };
  } catch (error) {
    console.error('list-phone-photos error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-phone-photos', async (_event, deviceName, filePaths, deviceOptions) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { success: false, error: 'No files selected' };
    }
    const backend = normalizePhoneBackend(deviceOptions);
    const tempDir = toWindowsPath(path.join(app.getPath('temp'), 'oversight-phone-import', Date.now().toString()));
    await fs.mkdir(tempDir, { recursive: true });

    if (backend.backend === 'libimobiledevice' && backend.udid) {
      try {
        const result = await phoneImobile.importPhotos(backend.udid, filePaths, tempDir);
        if ((result.imported || []).length > 0) {
          return { ...result, backend: 'libimobiledevice' };
        }
        console.warn('libimobiledevice import returned no files; falling back to MTP');
      } catch (error) {
        console.warn('libimobiledevice import failed; falling back to MTP:', error.message);
      }
    }

    const filesJson = JSON.stringify(filePaths);
    const result = await runPhotoBridge(
      ['-Action', 'import', '-DeviceName', deviceName, '-Files', filesJson, '-DestDir', tempDir],
      120000
    );
    return { ...result, backend: 'mtp' };
  } catch (error) {
    console.error('import-phone-photos error:', error);
    return { success: false, error: error.message };
  }
});

async function fetchImobilePhotoThumbnails(udid, deviceName, photoPaths) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) return { success: true, thumbnails: [] };

  const cached = [];
  const uncached = [];
  for (const photoPath of paths) {
    const cacheKey = `${deviceName}|${photoPath}`;
    if (phoneThumbCache.has(cacheKey)) {
      cached.push({ path: photoPath, ...phoneThumbCache.get(cacheKey) });
    } else {
      uncached.push(photoPath);
    }
  }

  const tempDir = path.join(app.getPath('temp'), 'oversight-phone-thumbs', `${Date.now()}-imobile`);
  await fs.mkdir(tempDir, { recursive: true });
  const importResult = await phoneImobile.importPhotos(udid, uncached, tempDir);
  const fetched = [];

  for (const photoPath of uncached) {
    const fileName = path.basename(photoPath);
    const match = (importResult.imported || []).find((item) => item.name === fileName);
    if (!match?.localPath) {
      fetched.push({ path: photoPath, success: false });
      continue;
    }
    const jpeg = await buildThumbnailJpeg(match.localPath);
    if (!jpeg) {
      fetched.push({ path: photoPath, success: false });
      continue;
    }
    const response = { success: true, base64: jpeg.toString('base64'), mimeType: 'image/jpeg' };
    phoneThumbCache.set(`${deviceName}|${photoPath}`, response);
    fetched.push({ path: photoPath, ...response });
  }

  return { success: true, thumbnails: [...cached, ...fetched] };
}

async function fetchPhonePhotoThumbnails(deviceName, photoPaths, deviceOptions) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) {
    return { success: true, thumbnails: [] };
  }

  const backend = normalizePhoneBackend(deviceOptions);
  // #region agent log
  debugPhoneLog('main.js:thumbnails', 'thumb request start', {
    deviceName,
    pathCount: paths.length,
    backend: backend.backend,
    hasUdid: !!backend.udid,
    samplePaths: paths.slice(0, 2),
  }, 'C');
  // #endregion

  const cached = [];
  const uncached = [];
  for (const photoPath of paths) {
    const cacheKey = `${deviceName}|${photoPath}`;
    if (phoneThumbCache.has(cacheKey)) {
      cached.push({ path: photoPath, ...phoneThumbCache.get(cacheKey) });
    } else {
      uncached.push(photoPath);
    }
  }

  const resolved = [...cached];

  if (uncached.length > 0) {
    const withPreviews = await buildHighResPreviewsFromDevice(
      deviceName,
      uncached.map((photoPath) => ({ path: photoPath }))
    );
    for (const photo of withPreviews) {
      if (!photo?.path || !photo.thumbBase64) continue;
      resolved.push({
        path: photo.path,
        success: true,
        base64: photo.thumbBase64,
        mimeType: photo.thumbMimeType || 'image/jpeg',
      });
    }
  }

  const resolvedByPath = new Map(resolved.map((t) => [t.path, t]));
  const finalThumbs = paths.map(
    (photoPath) => resolvedByPath.get(photoPath) || { path: photoPath, success: false }
  );

  return { success: true, thumbnails: finalThumbs };
}

ipcMain.handle('get-phone-photo-thumbnails', async (_event, deviceName, photoPaths, deviceOptions) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    return await fetchPhonePhotoThumbnails(deviceName, photoPaths, deviceOptions);
  } catch (error) {
    console.error('get-phone-photo-thumbnails error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-phone-photo-thumbnail', async (_event, deviceName, photoPath, deviceOptions) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    if (!photoPath || typeof photoPath !== 'string') {
      return { success: false, error: 'Photo path is required' };
    }
    const cacheKey = `${deviceName}|${photoPath}`;
    if (phoneThumbCache.has(cacheKey)) {
      return phoneThumbCache.get(cacheKey);
    }
    const batch = await fetchPhonePhotoThumbnails(deviceName, [photoPath], deviceOptions);
    if (!batch.success) return batch;
    const match = (batch.thumbnails || []).find((t) => t.path === photoPath);
    if (match?.success && match.base64) {
      return { success: true, base64: match.base64, mimeType: match.mimeType || 'image/jpeg' };
    }
    return { success: false, error: 'Could not load photo preview' };
  } catch (error) {
    console.error('get-phone-photo-thumbnail error:', error);
    return { success: false, error: error.message };
  }
});

function isPathUnderDir(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const base = path.resolve(baseDir);
  if (process.platform === 'win32') {
    const normalized = resolved.toLowerCase();
    const normalizedBase = base.toLowerCase();
    return normalized === normalizedBase || normalized.startsWith(`${normalizedBase}${path.sep}`);
  }
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

ipcMain.handle('read-phone-preview', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'File path is required' };
    }
    if (filePath.includes('\0')) {
      return { success: false, error: 'Invalid path' };
    }
    const tempRoot = app.getPath('temp');
    const resolved = path.resolve(filePath);
    const allowedRoots = [
      path.join(tempRoot, 'oversight-phone-import'),
      path.join(tempRoot, 'oversight-phone-thumbs'),
    ];
    if (!allowedRoots.some((root) => isPathUnderDir(resolved, root))) {
      return { success: false, error: 'Access denied: file outside temp import directory' };
    }
    const buffer = await fs.readFile(resolved);
    return {
      success: true,
      base64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
      name: path.basename(resolved),
    };
  } catch (error) {
    console.error('read-phone-preview error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-imported-photo', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'File path is required' };
    }
    if (filePath.includes('\0')) {
      return { success: false, error: 'Invalid path' };
    }
    const tempRoot = app.getPath('temp');
    const resolved = path.resolve(filePath);
    const allowedRoots = [
      path.join(tempRoot, 'oversight-phone-import'),
      path.join(tempRoot, 'oversight-phone-thumbs'),
    ];
    if (!allowedRoots.some((root) => isPathUnderDir(resolved, root))) {
      return { success: false, error: 'Access denied: file outside temp import directory' };
    }
    const buffer = await fs.readFile(resolved);
    return { success: true, data: Array.from(new Uint8Array(buffer)), name: path.basename(resolved) };
  } catch (error) {
    console.error('read-imported-photo error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('convert-image-for-upload', async (_event, byteArray, fileName) => {
  try {
    if (!Array.isArray(byteArray) || byteArray.length === 0) {
      return { success: false, error: 'Empty image data' };
    }
    const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    const isHeic = ext === 'heic' || ext === 'heif';
    if (!isHeic) {
      return { success: false, error: 'Not a HEIC/HEIF file' };
    }
    const heicConvert = require('heic-convert');
    const input = Buffer.from(byteArray);
    const output = await heicConvert({
      buffer: input,
      format: 'JPEG',
      quality: 0.92
    });
    const jpeg = Buffer.isBuffer(output) ? output : Buffer.from(output);
    return { success: true, base64: jpeg.toString('base64'), mimeType: 'image/jpeg' };
  } catch (error) {
    console.error('HEIC convert error:', error);
    return { success: false, error: error.message || 'HEIC could not be converted' };
  }
});
