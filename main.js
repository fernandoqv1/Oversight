const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;

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
