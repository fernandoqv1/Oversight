const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

/** Default page zoom for all app windows (1.0 = browser 100%) */
const DEFAULT_ZOOM_FACTOR = 0.675;

let mainWindow;
let updateCheckInProgress = false;
let autoUpdater = null;

// Wireless photo import session state
let wirelessImportServer = null;
let wirelessImportBridgeProc = null;
let wirelessImportBridgeInfo = null;  // { ssid, password, gatewayIp } for the active session
let wirelessImportTempDir = null;
let wirelessImportSender = null;
let wirelessImportPhotoCount = 0;
// Pre-started Wi-Fi Direct bridge so the QR modal appears immediately
let wifiDirectPrestart = null;        // { proc, ssid, password, gatewayIp } — set when ready
let wifiDirectPrestartPromise = null; // in-flight Promise while startup is running

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

app.on('will-quit', () => {
  if (wifiDirectPrestart) {
    try { wifiDirectPrestart.proc.kill(); } catch { /* ignore */ }
    wifiDirectPrestart = null;
  }
  if (wirelessImportBridgeProc) {
    try { wirelessImportBridgeProc.kill(); } catch { /* ignore */ }
    wirelessImportBridgeProc = null;
  }
  wirelessImportBridgeInfo = null;
  if (wirelessImportServer) {
    try { wirelessImportServer.close(); } catch { /* ignore */ }
    wirelessImportServer = null;
  }
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  scheduleAppleDriverSetup();

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

  // Kill orphaned bridge processes from a previous crash, then pre-start
  // Wi-Fi Direct so the AP is ready before the inspector presses the button.
  require('child_process').exec(
    'powershell -NoProfile -NonInteractive -Command "' +
    'Get-WmiObject Win32_Process | ' +
    'Where-Object { $_.Name -eq \'powershell.exe\' -and $_.CommandLine -like \'*wifi-direct-bridge*\' } | ' +
    'ForEach-Object { $_.Terminate() }"',
    { windowsHide: true, timeout: 8000 },
    () => preStartWifiDirect()
  );
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
const appleDrivers = require('./lib/apple-drivers');

// Native alert()/confirm() replacements. Chromium's built-in dialogs break the
// renderer's focus state in Electron: after closing one, text inputs and
// <select> dropdowns stop accepting clicks until the page reloads. Routing the
// dialogs through Electron's own message box (plus a blur/focus cycle) avoids
// that. Synchronous IPC keeps the blocking `if (!confirm(...))` semantics that
// the renderer call sites rely on.
function showNativeMessageBox(event, options) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = dialog.showMessageBoxSync(win, options);
  if (win && !win.isDestroyed()) {
    // Re-assert focus so the renderer keeps receiving input events.
    win.blur();
    win.focus();
    win.webContents.focus();
  }
  return result;
}


ipcMain.on('native-alert', (event, message) => {
  try {
    showNativeMessageBox(event, {
      type: 'info',
      message: String(message ?? ''),
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
    });
  } catch (error) {
    console.error('native-alert error:', error);
  }
  event.returnValue = true;
});

ipcMain.on('native-confirm', (event, message) => {
  try {
    const choice = showNativeMessageBox(event, {
      type: 'question',
      message: String(message ?? ''),
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    event.returnValue = choice === 0;
  } catch (error) {
    console.error('native-confirm error:', error);
    event.returnValue = false;
  }
});

function scheduleAppleDriverSetup() {
  if (process.platform !== 'win32') return;
  if (!app.isPackaged) return;
  setTimeout(async () => {
    try {
      if (appleDrivers.checkDriverStatus() === 'installed') return;
      // Installing the MSI requires elevation, which surfaces as a UAC prompt
      // for "Windows Installer" — confusing when it appears out of nowhere on
      // launch. The installer/updater handles the driver silently now (setup
      // runs perMachine/elevated), so at runtime attempt at most once per app
      // version instead of nagging on every launch.
      const markerPath = path.join(app.getPath('userData'), 'apple-driver-attempt.json');
      try {
        const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
        if (marker && marker.version === app.getVersion()) return;
      } catch { /* no marker yet — first attempt for this version */ }
      await fs.writeFile(markerPath, JSON.stringify({ version: app.getVersion(), at: new Date().toISOString() }));

      const result = await appleDrivers.ensureAppleDrivers({
        onProgress: (msg) => {
          if (msg && String(msg).trim()) {
            console.log('[apple-drivers]', String(msg).trim());
          }
        },
      });
      console.log('[apple-drivers] startup result:', result.status, result.method || '');
    } catch (err) {
      console.warn('[apple-drivers] startup failed:', err.message);
    }
  }, 4000);
}

function getPhotoBridgeScript() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'photo-bridge.ps1');
  }
  return path.join(__dirname, 'scripts', 'photo-bridge.ps1');
}

function getWifiDirectBridgeScript() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'wifi-direct-bridge.ps1');
  }
  return path.join(__dirname, 'scripts', 'wifi-direct-bridge.ps1');
}

// Spawns wifi-direct-bridge.ps1 -Action start, resolves with { result, proc }
// once the script emits its first JSON line.  The process is kept alive so the
// AP stays up; the caller stores proc and kills it when the session ends.
function startWifiDirectBridge(ssid, password) {
  return new Promise((resolve, reject) => {
    const scriptPath = getWifiDirectBridgeScript();
    const psArgs = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Action', 'start',
    ];
    if (ssid) psArgs.push('-Ssid', ssid);
    if (password) psArgs.push('-Password', password);

    const proc = spawn('powershell.exe', psArgs, { windowsHide: true });
    let buffer = '';
    let stderr = '';
    let settled = false;

    const settle = (fn) => { if (!settled) { settled = true; fn(); } };

    const timeout = setTimeout(() => {
      settle(() => {
        proc.kill();
        reject(new Error('wifi-direct-bridge timed out waiting for startup (35 s)'));
      });
    }, 35000);

    proc.stdout.on('data', (d) => {
      buffer += d.toString();
      const nl = buffer.indexOf('\n');
      if (nl !== -1) {
        clearTimeout(timeout);
        const line = buffer.slice(0, nl).trim();
        settle(() => {
          try {
            const parsed = JSON.parse(line);
            resolve({ result: parsed, proc });
          } catch {
            proc.kill();
            reject(new Error(`wifi-direct-bridge produced invalid JSON: ${line}`));
          }
        });
      }
    });

    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const detail = stderr.trim() || `exit code ${code}`;
      settle(() => reject(new Error(`wifi-direct-bridge failed before producing output (${detail})`))); 
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      settle(() => reject(err));
    });
  });
}

// Pre-starts the Wi-Fi Direct AP in the background so the first button press
// shows QR codes immediately instead of waiting 5-15 s for the AP to come up.
// Stores an in-flight Promise so a concurrent start-wireless-import call can
// await it rather than spawning a second conflicting bridge process.
function preStartWifiDirect(attempt = 0) {
  if (wifiDirectPrestart || wifiDirectPrestartPromise) return;
  wifiDirectPrestartPromise = (async () => {
    try {
      const { createHash } = require('crypto');
      const machineKey = createHash('sha256').update(require('os').hostname()).digest('hex');
      const stableSsid = 'Oversight-' + machineKey.slice(0, 6).toUpperCase();
      const stablePass = machineKey.slice(6, 18);
      const { result, proc } = await startWifiDirectBridge(stableSsid, stablePass);
      if (result.success) {
        wifiDirectPrestart = { proc, ssid: result.ssid, password: result.password, gatewayIp: result.gatewayIp };
        console.log('[wifi-direct-prestart] AP ready:', result.ssid);
      } else {
        console.warn('[wifi-direct-prestart] bridge reported failure:', result.error);
        if (attempt < 2) setTimeout(() => preStartWifiDirect(attempt + 1), 20000);
      }
    } catch (err) {
      console.warn(`[wifi-direct-prestart] attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < 2) setTimeout(() => preStartWifiDirect(attempt + 1), 20000);
    } finally {
      wifiDirectPrestartPromise = null;
    }
  })();
}

// Returns a free TCP port by binding to port 0 then releasing it.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const srv = net.createServer();
    srv.unref();
    srv.listen(0, '0.0.0.0', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Returns the inline HTML served to the phone's browser at GET /upload.
function getMobileUploadHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Oversight Photo Upload</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;color:#1a1a2e}
.hdr{background:#4f46e5;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:10px}
.hdr-logo{width:32px;height:32px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hdr-text h1{font-size:17px;font-weight:700;line-height:1.2}
.hdr-text p{font-size:13px;opacity:.8;margin-top:2px}
.body{padding:16px;max-width:480px;margin:0 auto}
.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.08);margin-bottom:16px}
.step-label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6366f1;margin-bottom:10px}
.pick-btn{display:block;width:100%;padding:18px 20px;background:#eef2ff;border:2px dashed #a5b4fc;border-radius:12px;color:#4f46e5;font-size:16px;font-weight:700;text-align:center;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0);transition:background .15s}
.pick-btn:active{background:#e0e7ff}
input[type=file]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.thumb-wrap{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6}
.thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.thumb-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font-size:22px;opacity:0;transition:opacity .2s}
.thumb-wrap.uploading .thumb-overlay{opacity:1}
.thumb-wrap.done .thumb-overlay{opacity:1;background:rgba(16,185,129,.55)}
.thumb-wrap.err .thumb-overlay{opacity:1;background:rgba(220,38,38,.55)}
.upload-btn{display:block;width:100%;padding:18px;background:#4f46e5;color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0);transition:background .15s;margin-top:4px}
.upload-btn:active:not(:disabled){background:#3730a3}
.upload-btn:disabled{background:#a5b4fc;cursor:default}
.count-hint{font-size:13px;color:#6b7280;text-align:center;margin-top:10px}
.succ-card{display:none;background:#fff;border-radius:16px;padding:32px 20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.succ-ico{font-size:52px;margin-bottom:12px}
.succ-card h2{font-size:20px;font-weight:800;color:#1a1a2e}
.succ-card p{font-size:14px;color:#6b7280;margin-top:6px}
.more-btn{margin-top:20px;display:block;width:100%;padding:14px;background:#f3f4f6;color:#4f46e5;border:1.5px solid #c7d2fe;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
.limit-banner{margin-top:10px;padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;text-align:center}
</style>
</head>
<body>
<div class="hdr">
  <div class="hdr-logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
  <div class="hdr-text"><h1>Oversight</h1><p>Upload photos to your inspection log</p></div>
</div>
<div class="body">
  <div id="upload-section">
    <div class="card">
      <div class="step-label">Step 1 &mdash; Select photos</div>
      <label class="pick-btn" for="file-input" id="pick-lbl">
        &#128247;&nbsp; Choose Photos from Camera Roll
      </label>
      <input type="file" id="file-input" accept="image/*" multiple>
      <div class="preview-grid" id="preview-grid"></div>
    </div>
    <div class="card" id="upload-card" style="display:none">
      <div class="step-label">Step 2 &mdash; Upload to Oversight</div>
      <button class="upload-btn" id="upload-btn">
        &#8679;&nbsp; Upload Photos
      </button>
      <div class="count-hint" id="count-hint"></div>
    </div>
  </div>
  <div class="succ-card" id="succ-card">
    <div class="succ-ico">&#9989;</div>
    <h2 id="succ-msg">Photos uploaded!</h2>
    <p>Return to Oversight on the PC to continue.</p>
    <button class="more-btn" id="more-btn">Upload More Photos</button>
  </div>
</div>
<script>
(function(){
  var MAX=5;
  var totalUploaded=0;
  var tk=new URLSearchParams(location.search).get('token')||'';
  var fileInput=document.getElementById('file-input');
  var pickLbl=document.getElementById('pick-lbl');
  var previewGrid=document.getElementById('preview-grid');
  var uploadCard=document.getElementById('upload-card');
  var uploadBtn=document.getElementById('upload-btn');
  var countHint=document.getElementById('count-hint');
  var uploadSection=document.getElementById('upload-section');
  var succCard=document.getElementById('succ-card');
  var succMsg=document.getElementById('succ-msg');
  var moreBtn=document.getElementById('more-btn');
  var selectedFiles=[];
  var thumbEls=[];

  function remaining(){return MAX-totalUploaded;}

  fileInput.addEventListener('change',function(){
    var all=Array.from(fileInput.files||[]);
    var cap=remaining();
    var trimmed=all.length>cap;
    selectedFiles=all.slice(0,cap);
    previewGrid.innerHTML='';
    thumbEls=[];
    selectedFiles.forEach(function(f){
      var wrap=document.createElement('div');wrap.className='thumb-wrap';
      var img=document.createElement('img');
      var overlay=document.createElement('div');overlay.className='thumb-overlay';overlay.textContent='\u23f3';
      wrap.appendChild(img);wrap.appendChild(overlay);
      previewGrid.appendChild(wrap);
      thumbEls.push({wrap:wrap,overlay:overlay});
      var rd=new FileReader();
      rd.onload=function(e){img.src=e.target.result;overlay.textContent='';};
      rd.readAsDataURL(f);
    });
    if(selectedFiles.length>0){
      pickLbl.textContent='\u2713 '+selectedFiles.length+(trimmed?' of '+all.length:'')+' photo'+(selectedFiles.length!==1?'s':'')+' selected \u2014 tap to change';
      var hint=selectedFiles.length+' photo'+(selectedFiles.length!==1?'s':'')+' selected ('+totalUploaded+'+'+selectedFiles.length+' of '+MAX+' total)';
      if(trimmed)hint+=' \u2014 only '+cap+' slot'+(cap!==1?'s':'')+' remaining';
      countHint.textContent=hint;
      countHint.style.color=trimmed?'#d97706':'';
      uploadCard.style.display='';
    } else {
      pickLbl.innerHTML='\u{1F4F7}&nbsp; Choose Photos from Camera Roll';
      countHint.textContent='';countHint.style.color='';
      uploadCard.style.display='none';
    }
  });

  uploadBtn.addEventListener('click',async function(){
    if(!selectedFiles.length)return;
    uploadBtn.disabled=true;
    fileInput.disabled=true;
    pickLbl.style.pointerEvents='none';
    var ok=0;
    for(var i=0;i<selectedFiles.length;i++){
      var f=selectedFiles[i];
      var el=thumbEls[i];
      el.wrap.className='thumb-wrap uploading';
      el.overlay.textContent='\u23f3';
      try{
        var fd=new FormData();
        fd.append('photo',f,f.name);
        var r=await fetch(location.href.replace(location.search,'')+'?token='+encodeURIComponent(tk),{method:'POST',body:fd});
        if(r.ok){
          el.wrap.className='thumb-wrap done';
          el.overlay.textContent='\u2705';
          ok++;
        } else if(r.status===429){
          el.wrap.className='thumb-wrap err';
          el.overlay.textContent='\u274c';
          break;
        } else {
          el.wrap.className='thumb-wrap err';
          el.overlay.textContent='\u274c';
        }
      } catch(e){
        el.wrap.className='thumb-wrap err';
        el.overlay.textContent='\u274c';
      }
    }
    totalUploaded+=ok;
    uploadSection.style.display='none';
    succCard.style.display='';
    succMsg.textContent=ok+' of '+selectedFiles.length+' photo'+(selectedFiles.length!==1?'s':'')+' uploaded!';
    if(totalUploaded>=MAX){
      moreBtn.style.display='none';
      var lim=document.createElement('p');
      lim.className='limit-banner';
      lim.textContent='Maximum '+MAX+' photos reached. Return to Oversight on the PC.';
      succCard.appendChild(lim);
    } else {
      moreBtn.textContent='Upload More Photos ('+(MAX-totalUploaded)+' remaining)';
    }
  });

  moreBtn.addEventListener('click',function(){
    selectedFiles=[];thumbEls=[];
    previewGrid.innerHTML='';
    fileInput.value='';fileInput.disabled=false;
    pickLbl.innerHTML='\u{1F4F7}&nbsp; Choose Photos from Camera Roll ('+(MAX-totalUploaded)+' remaining)';
    pickLbl.style.pointerEvents='';
    countHint.textContent='';countHint.style.color='';
    uploadCard.style.display='none';
    uploadBtn.disabled=false;
    uploadSection.style.display='';
    succCard.style.display='none';
  });
})();
</script>
</body>
</html>`;
}

// Adds a persistent Windows Firewall program rule so the HTTP server can
// receive connections from phones on any port without a UAC prompt each session.
// The NSIS installer already adds this at install time (silently, with admin).
// This function is a fallback for dev/portable mode; it shows a friendly in-app
// explanation BEFORE triggering Windows UAC so the user knows what to expect
// and approves it. Once approved the rule persists — this runs only once per machine.
async function ensureWirelessFirewallRule() {
  const { exec } = require('child_process');
  // No spaces in the rule name — spaces cause netsh to silently truncate the
  // name when Start-Process reconstructs the argument string.
  const RULE_NAME = 'Oversight-Desktop-Wireless-Import';

  // Step 1: check whether the rule already exists — if yes, skip entirely.
  const exists = await new Promise((resolve) => {
    exec(`netsh advfirewall firewall show rule name="${RULE_NAME}"`, { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      const found = stdout && !stdout.toLowerCase().includes('no rules match');
      resolve(found);
    });
  });
  if (exists) return;

  // Step 2: try without elevation first (works if the process has admin rights,
  // e.g. when the packaged installer already set it up for the exe).
  const execPath = process.execPath;
  const directOk = await new Promise((resolve) => {
    exec(
      `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow program="${execPath}" profile=any`,
      { windowsHide: true, timeout: 8000 },
      (addErr, addOut) => {
        const ok = !addErr && !(addOut && addOut.toLowerCase().includes('requires elevation'));
        resolve(ok);
      }
    );
  });
  if (directOk) return;

  // Step 3: elevation required — show a friendly in-app explanation first so the
  // user understands what the upcoming Windows security prompt is for and
  // approves it rather than cancelling.
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Wireless Import — One-Time Setup',
    message: 'Allow Oversight to receive photos from your phone',
    detail:
      'To let your phone send photos to this PC over Wi-Fi, Oversight needs to add a Windows Firewall exception.\n\n' +
      'A Windows security prompt will appear next — please click "Yes" to allow it.\n\n' +
      'This only happens once. After approval, Wireless Import will work without any prompts.',
    buttons: ['Set Up Now', 'Skip for Now'],
    defaultId: 0,
    cancelId: 1,
    icon: nativeImage.createEmpty(),
  });

  if (response === 1) {
    return;
  }

  // Step 4: one-time UAC elevation — rule name has no spaces so netsh receives it intact.
  exec(
    `powershell -NoProfile -NonInteractive -Command "Start-Process -FilePath netsh -ArgumentList 'advfirewall','firewall','add','rule','name=${RULE_NAME}','dir=in','action=allow','program=${execPath}','profile=any' -Verb RunAs -Wait"`,
    { windowsHide: true, timeout: 30000 },
    () => {}
  );
}

// Starts an HTTP server that serves the mobile upload page and receives files.
// onFile({ localPath, name }) is called for each successfully normalized photo.
function startUploadServer(tempDir, sessionToken, port, onFile, maxFiles = 5) {
  const http = require('http');
  const Busboy = require('busboy');
  const fsSync = require('fs');

  let fileCount = 0;
  const html = getMobileUploadHtml();

  const server = http.createServer((req, res) => {
    let urlObj;
    try {
      urlObj = new URL(req.url, `http://localhost:${port}`);
    } catch (e) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && urlObj.pathname === '/upload') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && urlObj.pathname === '/upload') {
      const token = urlObj.searchParams.get('token');
      if (token !== sessionToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session — please reopen the upload page.' }));
        return;
      }

      if (fileCount >= maxFiles) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Maximum ${maxFiles} photos per session reached.`, limitReached: true }));
        return;
      }

      let bb;
      try {
        bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid multipart request' }));
        return;
      }

      const pendingNormalize = [];

      bb.on('file', (_fieldname, file, info) => {
        const rawName = String((info && info.filename) || 'photo.jpg');
        const safeName = `wireless_${Date.now()}_${Math.random().toString(36).slice(2)}_${path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const destPath = path.join(tempDir, safeName);
        const ws = fsSync.createWriteStream(destPath);
        file.pipe(ws);

        file.on('limit', () => {
          file.resume();
          console.warn('[wireless-import] file too large, skipped:', rawName);
        });

        const p = new Promise((resolve) => {
          ws.on('finish', async () => {
            try {
              const normalizedPath = await normalizePhonePhotoFile(destPath);
              fileCount++;
              onFile({ localPath: normalizedPath, name: path.basename(normalizedPath) });
              resolve(true);
            } catch (err) {
              console.error('[wireless-import] normalize error:', err.message);
              resolve(false);
            }
          });
          ws.on('error', (err) => {
            console.error('[wireless-import] write error:', err.message);
            resolve(false);
          });
        });

        pendingNormalize.push(p);
      });

      bb.on('finish', async () => {
        await Promise.all(pendingNormalize);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });

      bb.on('error', (err) => {
        console.error('[wireless-import] busboy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upload processing failed' }));
        }
      });

      req.pipe(bb);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (err) => {
    console.error('[wireless-import] server error:', err.message);
  });

  server.listen(port, '0.0.0.0');
  return server;
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
const phoneFullCopyCache = new Map();

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

function iosPhotoDedupKey(fileName, folderPath) {
  const upper = String(fileName || '').toUpperCase();
  // Scope the key to the containing folder: iPhone photo numbering wraps at
  // 9999, so the same IMG_#### can legitimately exist in different folders.
  const scope = String(folderPath || '').toUpperCase();
  const edited = upper.match(/^IMG_E(\d+)/);
  if (edited) return { key: `${scope}|${edited[1]}`, edited: true };
  const original = upper.match(/^IMG_(\d+)/);
  if (original) return { key: `${scope}|${original[1]}`, edited: false };
  return { key: `${scope}|${upper}`, edited: false };
}

function dedupeIosMtpPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return photos;
  const groups = new Map();
  for (const photo of photos) {
    const name = photo.name || path.basename(photo.path || '');
    const folder = photo.relPath != null ? photo.relPath : path.dirname(String(photo.path || ''));
    const { key, edited } = iosPhotoDedupKey(name, folder);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { photo, edited });
      continue;
    }
    // Prefer the edited variant (IMG_E####): it is what the user sees in the
    // Photos app, and the original of an edited pair frequently stalls during
    // MTP copy until the per-file timeout (verified against a real device).
    if (edited && !existing.edited) {
      groups.set(key, { photo, edited: true });
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
  return img.resize({ width: Math.max(1, w), height: Math.max(1, h), quality: 'best' }).toJPEG(88);
}

function parseTiffExifOrientation(buffer, tiffStart) {
  if (tiffStart + 8 >= buffer.length) return null;
  const le = buffer[tiffStart] === 0x49;
  const readU16 = (pos) => (le ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos));
  const ifd0Offset = readU16(tiffStart + 4);
  const ifd0 = tiffStart + ifd0Offset;
  if (ifd0 + 2 >= buffer.length) return null;
  const entries = readU16(ifd0);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > buffer.length) break;
    if (readU16(entry) === 0x0112) {
      const value = readU16(entry + 8);
      // EXIF orientation is 1-8; anything else means we misparsed the
      // container (seen with HEIC scans returning values like 35508) and
      // must not be used to rotate the image.
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

function readJpegExifOrientation(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null;
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    if (marker === 0xE1) {
      const segLen = buffer.readUInt16BE(offset + 2);
      const exifHeader = buffer.slice(offset + 4, offset + 10).toString('ascii');
      if (exifHeader === 'Exif\0\0' && offset + 10 + 8 < buffer.length) {
        const orientation = parseTiffExifOrientation(buffer, offset + 10);
        if (orientation) return orientation;
      }
      offset += 2 + segLen;
      continue;
    }
    if (marker >= 0xD0 && marker <= 0xD9) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buffer.length) break;
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function readExifOrientationFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const jpegOrientation = readJpegExifOrientation(buffer);
  if (jpegOrientation) return jpegOrientation;
  const exifMarker = Buffer.from('Exif\0\0');
  for (let i = 0; i <= buffer.length - exifMarker.length; i += 1) {
    if (buffer[i] === 0x45 && buffer.slice(i, i + exifMarker.length).equals(exifMarker)) {
      const orientation = parseTiffExifOrientation(buffer, i + exifMarker.length);
      if (orientation) return orientation;
    }
  }
  return null;
}

function applyExifOrientationToJpegBuffer(jpegBuffer, orientation) {
  if (!jpegBuffer || !orientation || orientation === 1) return jpegBuffer;
  let img = nativeImage.createFromBuffer(jpegBuffer);
  if (!img || img.isEmpty()) return jpegBuffer;
  switch (orientation) {
    case 3: img = img.rotate(180); break;
    case 6: img = img.rotate(90); break;
    case 8: img = img.rotate(270); break;
    default: break;
  }
  if (!img || img.isEmpty()) return jpegBuffer;
  return img.toJPEG(90);
}

async function heicBufferToOrientedJpeg(input, quality = 0.9) {
  // libheif (heic-convert) applies the HEIC display transforms (irot/imir)
  // during decode — verified against real iPhone captures — so the converted
  // JPEG is already upright. Rotating again based on the container's EXIF
  // orientation tag double-rotates portrait photos.
  const heicConvert = require('heic-convert');
  const output = await heicConvert({ buffer: input, format: 'JPEG', quality });
  const jpeg = Buffer.isBuffer(output) ? output : Buffer.from(output);
  return { jpeg, orientation: 1 };
}

async function normalizePhonePhotoFile(localPath) {
  const input = await fs.readFile(localPath);
  const format = sniffImageFormat(input);
  const orientation = readExifOrientationFromBuffer(input);

  if (format === 'heic') {
    const { jpeg } = await heicBufferToOrientedJpeg(input, 0.9);
    const baseName = path.basename(localPath, path.extname(localPath));
    const outPath = path.join(path.dirname(localPath), `${baseName}.jpg`);
    await fs.writeFile(outPath, jpeg);
    // iPhones serve HEIC content under .JPG names; outPath then differs from
    // localPath only by extension case, which is the SAME file on Windows —
    // unlinking it would delete the converted JPEG we just wrote.
    if (outPath.toLowerCase() !== localPath.toLowerCase()) {
      try { await fs.unlink(localPath); } catch { /* ignore */ }
    }
    return outPath;
  }

  if (format === 'jpeg' && orientation && orientation !== 1) {
    const rotated = applyExifOrientationToJpegBuffer(input, orientation);
    await fs.writeFile(localPath, rotated);
  }
  return localPath;
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
    // quality 1 is dramatically slower to encode and ~2-3x larger for no
    // visible gain in a photo-log context; 0.9 keeps conversion fast.
    const output = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }

  const format = sniffImageFormat(input);
  const sourceOrientation = readExifOrientationFromBuffer(input);

  if (format === 'heic') {
    try {
      // libheif already applied the display transforms during decode; do not
      // rotate again (double-rotates portraits).
      const jpegBuffer = await convertHeicBuffer();
      const img = nativeImage.createFromBuffer(jpegBuffer);
      return resizeNativeImage(img, maxDim);
    } catch {
      return null;
    }
  }

  if (format === 'jpeg') {
    let jpegInput = input;
    if (sourceOrientation && sourceOrientation !== 1) {
      jpegInput = applyExifOrientationToJpegBuffer(input, sourceOrientation);
    }
    const img = nativeImage.createFromBuffer(jpegInput);
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

async function importDevicePhotosToTemp(deviceName, photoPaths, deviceOptions) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) {
    return { byName: new Map(), errors: [] };
  }

  const tempDir = toWindowsPath(path.join(app.getPath('temp'), 'oversight-phone-thumbs', `${Date.now()}-import`));
  await fs.mkdir(tempDir, { recursive: true });

  const backend = normalizePhoneBackend(deviceOptions);
  if (backend.backend === 'libimobiledevice' && backend.udid) {
    const importResult = await phoneImobile.importPhotos(backend.udid, paths, tempDir);
    const byName = new Map();
    for (const item of importResult.imported || []) {
      if (item?.name && item?.localPath) {
        byName.set(item.name, item.localPath);
      }
    }
    return { byName, errors: importResult.errors || [], tempDir };
  }

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
    thumbBase64: photo.thumbBase64 || undefined,
    thumbMimeType: photo.thumbMimeType || undefined,
    index,
  }));
}

async function buildHighResPreviewsFromDevice(deviceName, photos, onProgress, deviceOptions) {
  if (!deviceName || !Array.isArray(photos) || photos.length === 0) return photos;

  const toProcess = photos.filter((photo) => photo?.path && !photo.thumbBase64);
  if (toProcess.length === 0) return photos;

  const backend = normalizePhoneBackend(deviceOptions);
  const report = (payload) => {
    if (typeof onProgress === 'function') onProgress(payload);
  };

  if (backend.backend !== 'libimobiledevice' || !backend.udid) {
    const paths = toProcess.map((photo) => photo.path);
    const photoByPath = new Map(toProcess.map((photo) => [photo.path, photo]));
    report({ phase: 'shell', completed: 0, total: paths.length });
    const thumbs = await fetchMtpShellThumbnails(deviceName, paths, (batchThumbs, completed, total) => {
      for (const thumb of batchThumbs) {
        if (!thumb?.success || !thumb.base64) continue;
        const photo = photoByPath.get(thumb.path);
        if (!photo) continue;
        report({
          phase: 'shell',
          completed,
          total,
          photo: { ...photo, thumbBase64: thumb.base64, thumbMimeType: thumb.mimeType || 'image/jpeg' },
        });
      }
      report({ phase: 'shell', completed, total });
    });
    const thumbByPath = new Map();
    for (const thumb of thumbs) {
      if (thumb?.path && thumb.success && thumb.base64) {
        thumbByPath.set(thumb.path, thumb);
      }
    }
    return photos.map((photo) => {
      const thumb = thumbByPath.get(photo.path);
      if (!thumb) return photo;
      return {
        ...photo,
        thumbBase64: thumb.base64,
        thumbMimeType: thumb.mimeType || 'image/jpeg',
      };
    });
  }

  const paths = toProcess.map((photo) => photo.path).filter(Boolean);
  const total = paths.length;
  const jobStartMs = Date.now();
  const copyBudgetSec = estimatePreviewSeconds(total, 'copying');
  const previewBudgetSec = estimatePreviewSeconds(total, 'previews');

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
    ({ byName } = await importDevicePhotosToTemp(deviceName, paths, deviceOptions));
    for (const photo of photos) {
      const localPath = findImportedLocalPath(byName, photo.path);
      if (localPath) {
        phoneFullCopyCache.set(`${deviceName}|${photo.path}`, localPath);
      }
    }
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

  for (let index = 0; index < toProcess.length; index += 1) {
    const photo = toProcess[index];
    if (!photo?.path) {
      continue;
    }
    const localPath = findImportedLocalPath(byName, photo.path);
    let updated = photo;
    if (localPath) {
      try {
        let thumbSourcePath = localPath;
        try {
          thumbSourcePath = await normalizePhonePhotoFile(localPath);
          // Normalizing may convert HEIC to a .jpg alongside (removing the
          // original); repoint the full-copy cache so a later import reuses
          // the converted file instead of re-copying from the device.
          phoneFullCopyCache.set(`${deviceName}|${photo.path}`, thumbSourcePath);
        } catch {
          /* use original path */
        }
        const jpeg = await buildThumbnailJpeg(thumbSourcePath);
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

  const updatedByPath = new Map(results.map((photo) => [photo.path, photo]));
  return photos.map((photo) => updatedByPath.get(photo.path) || photo);
}

function toWindowsPath(filePath) {
  return String(filePath).replace(/\//g, '\\');
}

async function fetchMtpShellThumbnails(deviceName, photoPaths, onBatch) {
  const paths = Array.isArray(photoPaths) ? photoPaths.filter((p) => typeof p === 'string' && p) : [];
  if (paths.length === 0) return [];

  // Fetch in batches so each PowerShell invocation gets its own timeout —
  // one global capped timeout meant a large photo set timed out as a whole
  // and the UI got zero thumbnails. Batches also let the renderer paint
  // tiles progressively via onBatch.
  const BATCH_SIZE = 24;
  const fetched = [];
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    const batch = paths.slice(start, start + BATCH_SIZE);
    const normalizedBatch = batch.map((p) => toWindowsPath(p));
    const timeoutMs = 30000 + normalizedBatch.length * 2500;
    let result;
    try {
      result = await runPhotoBridge(
        ['-Action', 'thumbnails', '-DeviceName', deviceName, '-Files', JSON.stringify(normalizedBatch)],
        timeoutMs
      );
    } catch (error) {
      console.warn(`Thumbnail batch ${start}-${start + batch.length} failed:`, error.message);
      continue;
    }
    if (!result.success) {
      console.warn(`Thumbnail batch ${start}-${start + batch.length} failed:`, result.error);
      continue;
    }

    const byNormalized = new Map();
    for (let i = 0; i < batch.length; i += 1) {
      byNormalized.set(normalizedBatch[i], batch[i]);
    }

    const batchFetched = [];
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
      batchFetched.push(response);
    }
    fetched.push(...batchFetched);
    if (typeof onBatch === 'function') {
      onBatch(batchFetched, Math.min(start + batch.length, paths.length), paths.length);
    }
  }

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

async function runPhotoBridge(args, timeoutMs, options = {}) {
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
    let stderrLineBuf = '';

    // When the bridge streams progress, treat timeoutMs as an INACTIVITY
    // window (reset on any output) instead of an absolute cap — a multi-photo
    // import legitimately outlives any fixed total budget, but a healthy one
    // never goes silent for long.
    const inactivityMode = typeof options.onProgress === 'function';
    let timer = null;
    const armTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Phone import operation timed out'));
      }, timeoutMs);
    };
    armTimer();

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      if (inactivityMode) armTimer();
    });
    proc.stderr.on('data', (d) => {
      const text = d.toString();
      if (inactivityMode) armTimer();
      stderrLineBuf += text;
      let nl;
      while ((nl = stderrLineBuf.indexOf('\n')) !== -1) {
        const line = stderrLineBuf.slice(0, nl).trim();
        stderrLineBuf = stderrLineBuf.slice(nl + 1);
        if (line.startsWith('PROGRESS ')) {
          if (typeof options.onProgress === 'function') {
            try { options.onProgress(JSON.parse(line.slice(9))); } catch { /* ignore malformed */ }
          }
        } else if (line) {
          stderr += `${line}\n`;
        }
      }
    });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
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
      if (timer) clearTimeout(timer);
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

ipcMain.handle('load-phone-photo-previews', async (event, deviceName, photos, deviceOptions) => {
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
    const upgraded = await buildHighResPreviewsFromDevice(deviceName, list, sendProgress, deviceOptions);
    cachePhotosFromListResult(deviceName, upgraded);
    return { success: true, photos: serializePhonePreviewPhotos(upgraded) };
  } catch (error) {
    console.error('load-phone-photo-previews error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('upgrade-phone-photo-previews', async (_event, deviceName, photos, deviceOptions) => {
  try {
    if (!deviceName || typeof deviceName !== 'string') {
      return { success: false, error: 'Device name is required' };
    }
    const upgraded = await buildHighResPreviewsFromDevice(
      deviceName,
      Array.isArray(photos) ? photos : [],
      undefined,
      deviceOptions
    );
    cachePhotosFromListResult(deviceName, upgraded);
    return { success: true, photos: serializePhonePreviewPhotos(upgraded) };
  } catch (error) {
    console.error('upgrade-phone-photo-previews error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-apple-drivers', () => {
  return { status: appleDrivers.checkDriverStatus() };
});

ipcMain.handle('ensure-apple-drivers', async (event) => {
  try {
    return await appleDrivers.ensureAppleDrivers({
      onProgress: (msg) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('apple-drivers-progress', { message: msg });
        }
      },
    });
  } catch (error) {
    console.error('ensure-apple-drivers error:', error);
    return { status: 'failed', error: error.message };
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

    const backend = normalizePhoneBackend(deviceOptions);

    const args = ['-Action', 'list', '-DeviceName', deviceName];
    if (dateFilter && typeof dateFilter === 'string') {
      args.push('-DateFilter', dateFilter);
    }
    const listTimeout = dateFilter ? 120000 : 240000;
    try {
      const result = await runPhotoBridge(args, listTimeout);
      if (result.success && Array.isArray(result.photos)) {
        result.photos = dedupeIosMtpPhotos(result.photos);
        cachePhotosFromListResult(deviceName, result.photos);
        return { ...result, backend: 'mtp' };
      }
    } catch (error) {
      console.warn('MTP list failed; trying libimobiledevice:', error.message);
    }

    if (backend.backend === 'libimobiledevice' && backend.udid) {
      try {
        const result = await phoneImobile.list(backend.udid, dateFilter || '');
        if (result.success && Array.isArray(result.photos)) {
          result.photos = dedupeIosMtpPhotos(result.photos);
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

async function importPhonePhotosFromDevice(deviceName, filePaths, tempDir, backend, onCopyProgress) {
  const imported = [];
  const errors = [];
  const uncachedPaths = [];

  for (const filePath of filePaths) {
    const cacheKey = `${deviceName}|${filePath}`;
    const cachedPath = phoneFullCopyCache.get(cacheKey);
    const fileName = path.basename(filePath);
    const destPath = path.join(tempDir, fileName);
    if (cachedPath && cachedPath !== destPath) {
      try {
        await fs.access(cachedPath);
        await fs.copyFile(cachedPath, destPath);
        imported.push({ name: fileName, localPath: destPath, fromCache: true });
        continue;
      } catch {
        phoneFullCopyCache.delete(cacheKey);
      }
    }
    uncachedPaths.push(filePath);
  }

  if (uncachedPaths.length > 0) {
    const onProgress = typeof onCopyProgress === 'function' ? onCopyProgress : null;
    let remoteResult;
    if (backend.backend === 'libimobiledevice' && backend.udid) {
      try {
        remoteResult = await phoneImobile.importPhotos(backend.udid, uncachedPaths, tempDir, onProgress);
        if ((remoteResult.imported || []).length === 0) {
          remoteResult = null;
        }
      } catch {
        remoteResult = null;
      }
    }
    if (!remoteResult) {
      const filesJson = JSON.stringify(uncachedPaths);
      // 120s of SILENCE (not total runtime) — the bridge streams per-attempt
      // progress, so a healthy import of any size never trips this.
      remoteResult = await runPhotoBridge(
        ['-Action', 'import', '-DeviceName', deviceName, '-Files', filesJson, '-DestDir', tempDir],
        120000,
        onProgress ? { onProgress } : {}
      );
    }
    for (const item of remoteResult.imported || []) {
      imported.push({ ...item, fromCache: false });
    }
    errors.push(...(remoteResult.errors || []));
  }

  return { success: true, imported, errors };
}

ipcMain.handle('import-phone-photos', async (event, deviceName, filePaths, deviceOptions) => {
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

    const sendProgress = (payload) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('phone-import-progress', payload);
      }
    };

    // Convert each photo (HEIC decode etc.) as soon as its copy lands instead
    // of waiting for the whole batch — total time becomes copy-time + one
    // conversion instead of copies + all conversions back to back.
    const pipelinedNormalize = new Map();
    const startNormalize = (name, localPath) => {
      const key = String(name || '').toLowerCase();
      if (!key || pipelinedNormalize.has(key)) return;
      pipelinedNormalize.set(key, normalizePhonePhotoFile(localPath).catch((err) => ({ __error: err })));
    };

    const onCopyProgress = (payload) => {
      if (!payload || payload.phase !== 'copying') return;
      sendProgress({
        phase: 'copying',
        completed: Number(payload.completed) || 0,
        total: Number(payload.total) || filePaths.length,
        name: payload.name || '',
        attempt: payload.attempt,
      });
      if (payload.ok && payload.localPath) {
        startNormalize(payload.name, payload.localPath);
      }
    };

    const copyResult = await importPhonePhotosFromDevice(deviceName, filePaths, tempDir, backend, onCopyProgress);
    const normalizedImported = [];
    const normalizeErrors = [];
    const requestedByName = new Map(
      filePaths.map((p) => [path.basename(String(p)).toLowerCase(), String(p)])
    );

    const items = copyResult.imported || [];
    let processed = 0;
    for (const item of items) {
      if (!item?.localPath) continue;
      try {
        const itemKey = String(item.name || path.basename(item.localPath)).toLowerCase();
        let normalizedPath;
        const pipelined = pipelinedNormalize.get(itemKey);
        if (pipelined) {
          const result = await pipelined;
          if (result && result.__error) throw result.__error;
          normalizedPath = result;
        } else {
          normalizedPath = await normalizePhonePhotoFile(item.localPath);
        }
        // Cache the converted copy so re-importing the same photo (e.g. into
        // another daily log) skips the slow device copy entirely.
        const requestedPath = requestedByName.get(itemKey);
        if (requestedPath) {
          phoneFullCopyCache.set(`${deviceName}|${requestedPath}`, normalizedPath);
        }
        normalizedImported.push({
          name: path.basename(normalizedPath),
          localPath: normalizedPath,
          fromCache: !!item.fromCache,
        });
      } catch (err) {
        normalizeErrors.push(`Could not process '${item.name || path.basename(item.localPath)}': ${err.message}`);
        normalizedImported.push(item);
      }
      processed += 1;
      sendProgress({ phase: 'processing', completed: processed, total: items.length, name: item.name || '' });
    }

    return {
      success: true,
      imported: normalizedImported,
      errors: [...(copyResult.errors || []), ...normalizeErrors],
      backend: backend.backend === 'libimobiledevice' && backend.udid ? 'libimobiledevice' : 'mtp',
    };
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
    let thumbSourcePath = match.localPath;
    try {
      thumbSourcePath = await normalizePhonePhotoFile(match.localPath);
    } catch {
      /* use original */
    }
    const jpeg = await buildThumbnailJpeg(thumbSourcePath);
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
    const backend = normalizePhoneBackend(deviceOptions);
    if (backend.backend === 'libimobiledevice' && backend.udid) {
      const batch = await fetchImobilePhotoThumbnails(backend.udid, deviceName, uncached);
      for (const thumb of batch.thumbnails || []) {
        if (thumb?.path && thumb.success && thumb.base64) {
          resolved.push({
            path: thumb.path,
            success: true,
            base64: thumb.base64,
            mimeType: thumb.mimeType || 'image/jpeg',
          });
        }
      }
    } else {
      const withPreviews = await buildHighResPreviewsFromDevice(
        deviceName,
        uncached.map((photoPath) => ({ path: photoPath })),
        undefined,
        deviceOptions
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
      path.join(tempRoot, 'oversight-wireless-import'),
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
      path.join(tempRoot, 'oversight-wireless-import'),
    ];
    if (!allowedRoots.some((root) => isPathUnderDir(resolved, root))) {
      return { success: false, error: 'Access denied: file outside temp import directory' };
    }
    const buffer = await fs.readFile(resolved);
    return {
      success: true,
      data: buffer,
      base64: buffer.toString('base64'),
      mimeType: sniffImageFormat(buffer) === 'jpeg' ? 'image/jpeg' : 'application/octet-stream',
      name: path.basename(resolved),
    };
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
    const input = Buffer.from(byteArray);
    const sniffedFormat = sniffImageFormat(input);
    const isHeic = ext === 'heic' || ext === 'heif' || sniffedFormat === 'heic';
    if (!isHeic) {
      return { success: false, error: 'Not a HEIC/HEIF file' };
    }
    const { jpeg } = await heicBufferToOrientedJpeg(input, 0.9);
    return {
      success: true,
      base64: jpeg.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.error('HEIC convert error:', error);
    return { success: false, error: error.message || 'HEIC could not be converted' };
  }
});

// ---------- Wireless Photo Import (Wi-Fi Direct Legacy AP + HTTP upload) ----------

ipcMain.handle('start-wireless-import', async (event) => {
  try {
    // Tear down any pre-existing session
    if (wirelessImportServer) {
      try { wirelessImportServer.close(); } catch { /* ignore */ }
      wirelessImportServer = null;
    }
    if (wirelessImportBridgeProc) {
      try { wirelessImportBridgeProc.kill(); } catch { /* ignore */ }
      wirelessImportBridgeProc = null;
    }

    // If the pre-start is still in flight, wait for it rather than spawning a
    // second conflicting bridge process (two publishers fight over the adapter).
    if (wifiDirectPrestartPromise) {
      await wifiDirectPrestartPromise;
    }

    // Discard a parked prestart whose process has already exited — the publisher
    // stopped internally and the AP is no longer broadcasting.
    if (wifiDirectPrestart && wifiDirectPrestart.proc.exitCode !== null) {
      console.log('[wifi-direct-prestart] process exited (publisher stopped), will restart');
      wifiDirectPrestart = null;
    }

    // Use the pre-started bridge if it's already up, otherwise start one now.
    let bridgeProc, bridgeSsid, bridgePassword, bridgeGatewayIp;
    if (wifiDirectPrestart) {
      ({ proc: bridgeProc, ssid: bridgeSsid, password: bridgePassword, gatewayIp: bridgeGatewayIp } = wifiDirectPrestart);
      wifiDirectPrestart = null;
    } else {
      // Kill any orphaned bridge processes left over from a previous app restart.
      await new Promise((resolve) => {
        require('child_process').exec(
          'powershell -NoProfile -NonInteractive -Command "' +
          'Get-WmiObject Win32_Process | ' +
          'Where-Object { $_.Name -eq \'powershell.exe\' -and $_.CommandLine -like \'*wifi-direct-bridge*\' } | ' +
          'ForEach-Object { $_.Terminate() }"',
          { windowsHide: true, timeout: 8000 },
          () => resolve()
        );
      });

      const { createHash } = require('crypto');
      const machineKey = createHash('sha256').update(require('os').hostname()).digest('hex');
      const stableSsid = 'Oversight-' + machineKey.slice(0, 6).toUpperCase();
      const stablePass = machineKey.slice(6, 18);
      const { result, proc } = await startWifiDirectBridge(stableSsid, stablePass);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to start Wi-Fi Direct AP' };
      }
      bridgeProc = proc;
      bridgeSsid = result.ssid;
      bridgePassword = result.password;
      bridgeGatewayIp = result.gatewayIp;
    }
    wirelessImportBridgeProc = bridgeProc;
    wirelessImportBridgeInfo = { ssid: bridgeSsid, password: bridgePassword, gatewayIp: bridgeGatewayIp };

    // Create a fresh temp directory for this session
    const tempDir = toWindowsPath(
      path.join(app.getPath('temp'), 'oversight-wireless-import', Date.now().toString())
    );
    await fs.mkdir(tempDir, { recursive: true });
    wirelessImportTempDir = tempDir;
    wirelessImportSender = event.sender;
    wirelessImportPhotoCount = 0;

    const port = await findFreePort();
    const sessionToken = require('crypto').randomBytes(16).toString('hex');
    const uploadUrl = `http://${bridgeGatewayIp}:${port}/upload?token=${sessionToken}`;

    // Ensure the Windows Firewall has an inbound rule for this app so the
    // phone can reach the HTTP server. Awaited so the dialog (if needed for
    // first-time setup) appears BEFORE the QR codes — preventing it from
    // obscuring the modal.
    await ensureWirelessFirewallRule().catch(() => {});

    // Generate QR codes (PNG data URLs)
    const QRCode = require('qrcode');
    const wifiQrString = `WIFI:T:WPA;S:${bridgeSsid};P:${bridgePassword};;`;
    const [wifiQr, urlQr] = await Promise.all([
      QRCode.toDataURL(wifiQrString, { width: 256, margin: 2 }),
      QRCode.toDataURL(uploadUrl, { width: 256, margin: 2 }),
    ]);

    wirelessImportPort = port;

    // Start the HTTP upload server; push events to the renderer as files arrive
    wirelessImportServer = startUploadServer(tempDir, sessionToken, port, ({ localPath, name }) => {
      wirelessImportPhotoCount += 1;
      if (wirelessImportSender && !wirelessImportSender.isDestroyed()) {
        wirelessImportSender.send('wireless-photo-received', {
          localPath,
          name,
          index: wirelessImportPhotoCount - 1,
        });
      }
    });

    return {
      success: true,
      ssid: bridgeSsid,
      password: bridgePassword,
      uploadUrl,
      wifiQr,
      urlQr,
    };
  } catch (err) {
    console.error('[start-wireless-import] error:', err);
    // Clean up partial state on error
    if (wirelessImportBridgeProc) {
      try { wirelessImportBridgeProc.kill(); } catch { /* ignore */ }
      wirelessImportBridgeProc = null;
    }
    return { success: false, error: err.message };
  }
});

let wirelessImportPort = null;

ipcMain.handle('stop-wireless-import', async () => {
  try {
    if (wirelessImportServer) {
      try { wirelessImportServer.close(); } catch { /* ignore */ }
      wirelessImportServer = null;
    }
    // Keep the bridge process alive — move it back to wifiDirectPrestart so
    // the next modal open is instant without restarting the adapter.
    if (wirelessImportBridgeProc && wirelessImportBridgeInfo) {
      wifiDirectPrestart = { proc: wirelessImportBridgeProc, ...wirelessImportBridgeInfo };
    } else if (wirelessImportBridgeProc) {
      try { wirelessImportBridgeProc.kill(); } catch { /* ignore */ }
    }
    wirelessImportBridgeProc = null;
    wirelessImportBridgeInfo = null;
    wirelessImportPort = null;
    wirelessImportSender = null;
    return { success: true };
  } catch (err) {
    console.error('[stop-wireless-import] error:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Project JSON Disk Backup (resilient against localStorage wipes) ----------

function getProjectJsonPath(projectId) {
  const safeId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(app.getPath('userData'), 'projects', safeId, 'project.json');
}

ipcMain.handle('save-project-json', async (_event, projectId, jsonString) => {
  try {
    const filePath = getProjectJsonPath(projectId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, jsonString, 'utf8');
    return { success: true };
  } catch (err) {
    console.error('[save-project-json] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-project-json', async (_event, projectId) => {
  try {
    const filePath = getProjectJsonPath(projectId);
    const data = await fs.readFile(filePath, 'utf8');
    return { success: true, data };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: false, notFound: true };
    console.error('[load-project-json] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-all-project-ids', async () => {
  try {
    const projectsDir = path.join(app.getPath('userData'), 'projects');
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const ids = entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
    return { success: true, ids };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: true, ids: [] };
    console.error('[list-all-project-ids] error:', err);
    return { success: false, ids: [], error: err.message };
  }
});

ipcMain.handle('delete-project-json', async (_event, projectId) => {
  try {
    const filePath = getProjectJsonPath(projectId);
    await fs.unlink(filePath);
    return { success: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: true };
    console.error('[delete-project-json] error:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Project File Storage (photos, documents) ----------

function getProjectFilePath(projectId, category, fileId) {
  const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCategory  = String(category).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFileId    = String(fileId).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(app.getPath('userData'), 'projects', safeProjectId, safeCategory, safeFileId);
}

ipcMain.handle('save-project-file', async (_event, projectId, category, fileId, buffer) => {
  try {
    const filePath = getProjectFilePath(projectId, category, fileId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(buffer));
    return { success: true };
  } catch (err) {
    console.error('[save-project-file] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-project-file', async (_event, projectId, category, fileId) => {
  try {
    const filePath = getProjectFilePath(projectId, category, fileId);
    const data = await fs.readFile(filePath);
    return { success: true, data };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: false, error: 'File not found', notFound: true };
    console.error('[read-project-file] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-project-file', async (_event, projectId, category, fileId) => {
  try {
    const filePath = getProjectFilePath(projectId, category, fileId);
    await fs.unlink(filePath);
    return { success: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: true };
    console.error('[delete-project-file] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-project-files', async (_event, projectId, category) => {
  try {
    const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeCategory  = String(category).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dirPath = path.join(app.getPath('userData'), 'projects', safeProjectId, safeCategory);
    const files = await fs.readdir(dirPath);
    return { success: true, files };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: true, files: [] };
    console.error('[list-project-files] error:', err);
    return { success: false, error: err.message, files: [] };
  }
});

ipcMain.handle('delete-project-folder', async (_event, projectId) => {
  try {
    const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dirPath = path.join(app.getPath('userData'), 'projects', safeProjectId);
    await fs.rm(dirPath, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    console.error('[delete-project-folder] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-file-to-project', async (_event, projectId, category, fileId, srcPath) => {
  try {
    if (!srcPath || typeof srcPath !== 'string' || srcPath.includes('\0')) {
      return { success: false, error: 'Invalid source path' };
    }
    const resolved = path.resolve(srcPath);
    const tempRoot = app.getPath('temp');
    if (!isPathUnderDir(resolved, tempRoot)) {
      return { success: false, error: 'Access denied: source outside temp directory' };
    }
    const destPath = getProjectFilePath(projectId, category, fileId);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(resolved, destPath);
    const stat = await fs.stat(destPath);
    return { success: true, sizeBytes: stat.size };
  } catch (err) {
    console.error('[copy-file-to-project] error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-file-dialog', async (_event, options) => {
  try {
    const filters = options?.filters || [
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg'] },
      { name: 'All Files', extensions: ['*'] },
    ];
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: options?.title || 'Open File',
      filters,
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    const filePath = filePaths[0];
    const stat = await fs.stat(filePath);
    const data = await fs.readFile(filePath);
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      ext: path.extname(filePath).toLowerCase().slice(1),
      sizeBytes: stat.size,
      data,
    };
  } catch (err) {
    console.error('[open-file-dialog] error:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Document Upload Server & Mobile Page ----------

function getMobileDocumentUploadHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Oversight — Upload Document</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;min-height:100vh;display:flex;flex-direction:column}
.hdr{background:#1e3a5f;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.hdr svg{width:28px;height:28px;flex-shrink:0}
.hdr h1{font-size:1.05rem;font-weight:700;letter-spacing:.01em}
.hdr .sub{font-size:.72rem;opacity:.75}
.main{flex:1;padding:16px;display:flex;flex-direction:column;gap:16px;max-width:480px;width:100%;margin:0 auto}
.mode-tabs{display:flex;gap:0;border-radius:8px;overflow:hidden;border:1.5px solid #d1d5db;background:#fff}
.mode-tab{flex:1;padding:9px 4px;text-align:center;font-size:.78rem;font-weight:600;color:#6b7280;cursor:pointer;border:none;background:transparent;transition:.15s}
.mode-tab.active{background:#1e3a5f;color:#fff}
.mode-panel{display:none}
.mode-panel.active{display:flex;flex-direction:column;gap:12px}
.card{background:#fff;border-radius:12px;border:1.5px solid #e5e7eb;padding:16px;display:flex;flex-direction:column;gap:12px}
.lbl{font-size:.8rem;font-weight:600;color:#374151}
.hint{font-size:.75rem;color:#6b7280}
.pick-area{border:2px dashed #d1d5db;border-radius:10px;padding:28px 16px;text-align:center;cursor:pointer;transition:.15s;background:#fafafa}
.pick-area:hover,.pick-area.drag{border-color:#1e3a5f;background:#eff6ff}
.pick-area input{display:none}
.pick-ico{font-size:2rem;margin-bottom:8px}
.pick-area p{font-size:.82rem;color:#6b7280}
.previews{display:flex;flex-wrap:wrap;gap:8px}
.thumb-wrap{position:relative;width:80px;height:80px;border-radius:6px;overflow:hidden;border:1.5px solid #e5e7eb;flex-shrink:0}
.thumb-wrap img{width:100%;height:100%;object-fit:cover}
.thumb-del{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.crop-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}
.crop-overlay canvas{max-width:100%;max-height:60vh;touch-action:none;border-radius:4px;cursor:crosshair}
.crop-overlay .crop-btns{display:flex;gap:10px}
.cam-wrap{position:relative;width:100%;background:#000;border-radius:10px;overflow:hidden;aspect-ratio:3/4;max-height:55vh}
.cam-wrap video{width:100%;height:100%;object-fit:cover}
.cam-wrap canvas.overlay{position:absolute;inset:0;pointer-events:none}
.cam-btns{display:flex;gap:10px;justify-content:center}
.cam-handle{position:absolute;width:44px;height:44px;border-radius:50%;background:#4A90D9;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);transform:translate(-50%,-50%);touch-action:none;cursor:grab;-webkit-tap-highlight-color:transparent}
.btn{padding:11px 22px;border-radius:8px;font-size:.9rem;font-weight:600;border:none;cursor:pointer;transition:.15s}
.btn-primary{background:#1e3a5f;color:#fff}
.btn-primary:hover:not(:disabled){background:#152c49}
.btn-secondary{background:#f3f4f6;color:#374151;border:1.5px solid #d1d5db}
.btn-danger{background:#ef4444;color:#fff}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-sm{padding:7px 14px;font-size:.8rem}
.prog-bar{height:5px;background:#e5e7eb;border-radius:4px;overflow:hidden}
.prog-fill{height:100%;background:#1e3a5f;width:0;transition:.3s}
.status-msg{font-size:.82rem;text-align:center;color:#374151;min-height:1.2em}
.err-msg{color:#dc2626;font-size:.82rem;text-align:center}
.succ-card{background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:20px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
.succ-card h2{color:#166534;font-size:1rem}
.name-inp{width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:9px 12px;font-size:.9rem;background:#fff}
.name-inp:focus{outline:none;border-color:#1e3a5f}
</style>
</head>
<body>
<header class="hdr">
  <svg viewBox="0 0 36 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 2L4 8v10c0 9.5 5.9 18.4 14 21.4C26.1 36.4 32 27.5 32 18V8L18 2z" fill="#4A90D9" stroke="#2E6DA4" stroke-width="1.5"/>
    <path d="M13 20l3.5 3.5L23 16" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <div>
    <div class="hdr h1">Oversight</div>
    <div class="sub">Upload Document</div>
  </div>
</header>

<div class="main">
  <!-- Mode selector -->
  <div class="mode-tabs">
    <button class="mode-tab active" id="tab-library">Photo Library</button>
    <button class="mode-tab" id="tab-camera">Camera Scan</button>
    <button class="mode-tab" id="tab-files">Files App</button>
  </div>

  <!-- Photo Library mode -->
  <div class="mode-panel active" id="panel-library">
    <div class="card">
      <div class="lbl">Select Photos to Scan</div>
      <div class="hint">Select one or more photos. Each photo will go through a scan/crop step before being saved as a PDF.</div>
      <label class="pick-area" id="lib-pick">
        <input type="file" id="lib-input" accept="image/*" multiple>
        <div class="pick-ico">&#128444;</div>
        <p>Tap to select photos from your library</p>
      </label>
      <div class="previews" id="lib-previews"></div>
      <div class="prog-bar" id="lib-prog-bar" style="display:none"><div class="prog-fill" id="lib-prog-fill"></div></div>
      <div class="status-msg" id="lib-status"></div>
      <button class="btn btn-primary" id="lib-upload-btn" disabled>Scan &amp; Upload as PDF</button>
    </div>
  </div>

  <!-- Camera Scan mode -->
  <div class="mode-panel" id="panel-camera">
    <div class="card">
      <div class="lbl">Scan Document with Camera</div>
      <div class="hint">Scan one page at a time &mdash; add all pages, then tap Upload.</div>
      <div class="previews" id="cam-pages-list" style="display:none;"></div>
      <div id="cam-take-wrap">
        <label class="pick-area">
          <input type="file" id="cam-fallback-input" accept="image/*" capture="environment">
          <div class="pick-ico">&#128247;</div>
          <p id="cam-take-label">Tap to scan first page</p>
        </label>
      </div>

      <div class="prog-bar" id="cam-prog-bar" style="display:none"><div class="prog-fill" id="cam-prog-fill"></div></div>
      <div class="status-msg" id="cam-status"></div>
      <button class="btn btn-primary" id="cam-upload-btn" disabled style="display:none;">Upload Document</button>
    </div>
  </div>

  <!-- Files App mode -->
  <div class="mode-panel" id="panel-files">
    <div class="card">
      <div class="lbl">Upload from Files App</div>
      <div class="hint">Select a PDF, Word document, or image file directly from your phone's Files app.</div>
      <label class="pick-area" id="files-pick">
        <input type="file" id="files-input" accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple>
        <div class="pick-ico">&#128196;</div>
        <p>Tap to select one or more files</p>
      </label>
      <div id="files-list" style="display:none;flex-direction:column;gap:4px;"></div>
      <div class="prog-bar" id="files-prog-bar" style="display:none"><div class="prog-fill" id="files-prog-fill"></div></div>
      <div class="status-msg" id="files-status"></div>
      <button class="btn btn-primary" id="files-upload-btn" disabled>Upload File</button>
    </div>
  </div>

  <div id="global-succ" class="succ-card" style="display:none">
    <div style="font-size:2rem">&#10003;</div>
    <h2>Document uploaded!</h2>
    <p class="hint">Return to Oversight on the PC to name and save it.</p>
    <button class="btn btn-secondary btn-sm" id="upload-another-btn">Upload Another</button>
  </div>
</div>

<div class="crop-overlay" id="crop-overlay" style="display:none">
  <div style="color:#fff;font-size:.9rem;text-align:center">Drag the corners to align with the document edges</div>
  <canvas id="crop-canvas" width="400" height="530"></canvas>
  <div class="crop-btns">
    <button class="btn btn-secondary btn-sm" id="crop-skip-btn">Skip Crop</button>
    <button class="btn btn-primary btn-sm" id="crop-confirm-btn">Crop &amp; Add</button>
  </div>
</div>

<script>
(function(){
'use strict';
var tk=new URLSearchParams(location.search).get('token')||'';

// #region agent log
var _dbgBase=location.origin;
function _dbgLog(payload){fetch(_dbgBase+'/dbg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(function(){});}
_dbgLog({sessionId:'32be09',location:'mobile-upload.html:load',message:'page loaded - context info',data:{protocol:location.protocol,host:location.host,isSecureContext:window.isSecureContext,mediaDevicesType:typeof navigator.mediaDevices,hasGetUserMedia:!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia),userAgent:navigator.userAgent.substring(0,120)},timestamp:Date.now(),hypothesisId:'A'});
// #endregion

// ---- Tab switching ----
['library','camera','files'].forEach(function(name){
  document.getElementById('tab-'+name).addEventListener('click',function(){
    document.querySelectorAll('.mode-tab').forEach(function(t){t.classList.remove('active');});
    document.querySelectorAll('.mode-panel').forEach(function(p){p.classList.remove('active');});
    this.classList.add('active');
    document.getElementById('panel-'+name).classList.add('active');
  }.bind(document.getElementById('tab-'+name)));
});

// ---- Minimal PDF builder (no library) ----
// Packs one or more JPEG ArrayBuffers into a valid multi-page PDF byte stream.
function buildPdf(jpegPages){
  // jpegPages: Array of {data: Uint8Array, w: number, h: number}
  var objs=[]; // [{offset,content}]
  var offsets=[];
  var body='';
  function ao(s){ var o=body.length; body+=s; return o; }

  // obj 1: catalog
  offsets.push(body.length);
  body+='1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n';
  // obj 2: pages (placeholder, patched below)
  var pagesObjOffset=body.length;
  offsets.push(body.length);
  var kidsPlaceholder=''; // filled later
  // We'll build page objects first, then patch obj 2

  var pageObjNums=[];
  var imgObjNums=[];
  var nextObj=3;
  var pageData=[];
  for(var pi=0;pi<jpegPages.length;pi++){
    var pg=jpegPages[pi];
    var wPt=Math.round(pg.w*0.75); // px -> pt at 96dpi (96/72=4/3, so pt=px*0.75)
    var hPt=Math.round(pg.h*0.75);
    var imgNum=nextObj++;
    var pageNum=nextObj++;
    pageObjNums.push(pageNum);
    imgObjNums.push(imgNum);
    pageData.push({wPt:wPt,hPt:hPt,imgNum:imgNum,pageNum:pageNum,jpeg:pg.data});
  }

  // Rebuild from scratch using a byte array approach for binary safety
  var parts=[]; // Array of Uint8Array or string
  function enc(s){ return new TextEncoder().encode(s); }

  var xrefOffsets=[];
  var rawParts=[];
  var byteOffset=0;

  function addPart(s){
    var bytes=typeof s==='string'?enc(s):s;
    rawParts.push(bytes);
    byteOffset+=bytes.byteLength;
    return byteOffset-bytes.byteLength;
  }

  // Header
  addPart('%PDF-1.4\\n%\\xE2\\xE3\\xCF\\xD3\\n');

  // obj 1 catalog
  xrefOffsets[1]=byteOffset;
  addPart('1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n');

  // obj 2 pages (written after page objs; placeholder now)
  var pages2Placeholder=byteOffset;
  xrefOffsets[2]=byteOffset;
  var kidsStr=pageObjNums.map(function(n){return n+' 0 R';}).join(' ');
  addPart('2 0 obj\\n<< /Type /Pages /Count '+jpegPages.length+' /Kids ['+kidsStr+'] >>\\nendobj\\n');

  for(var pi2=0;pi2<pageData.length;pi2++){
    var pd=pageData[pi2];
    // image XObject
    xrefOffsets[pd.imgNum]=byteOffset;
    var jpegLen=pd.jpeg.byteLength;
    addPart(pd.imgNum+' 0 obj\\n<< /Type /XObject /Subtype /Image /Width '+pd.wPt+
      ' /Height '+pd.hPt+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpegLen+' >>\\nstream\\n');
    addPart(pd.jpeg);
    addPart('\\nendstream\\nendobj\\n');
    // page
    xrefOffsets[pd.pageNum]=byteOffset;
    var cStream='q '+pd.wPt+' 0 0 '+pd.hPt+' 0 0 cm /Im'+pi2+' Do Q';
    addPart(pd.pageNum+' 0 obj\\n<< /Type /Page /Parent 2 0 R'+
      ' /MediaBox [0 0 '+pd.wPt+' '+pd.hPt+']'+
      ' /Resources << /XObject << /Im'+pi2+' '+pd.imgNum+' 0 R >> >>'+
      ' /Contents '+(nextObj+pi2)+' 0 R >>\\nendobj\\n');
    var cObjNum=nextObj+pi2;
    xrefOffsets[cObjNum]=byteOffset;
    addPart(cObjNum+' 0 obj\\n<< /Length '+cStream.length+' >>\\nstream\\n'+cStream+'\\nendstream\\nendobj\\n');
  }
  // content stream obj numbers start at nextObj
  // We already wrote them above; increment nextObj
  var totalObjs=nextObj+pageData.length-1;

  // xref
  var xrefOffset=byteOffset;
  var xrefStr='xref\\n0 '+(totalObjs+1)+'\\n0000000000 65535 f \\n';
  for(var i=1;i<=totalObjs;i++){
    var off=xrefOffsets[i]||0;
    xrefStr+=off.toString().padStart(10,'0')+' 00000 n \\n';
  }
  addPart(xrefStr);
  addPart('trailer\\n<< /Size '+(totalObjs+1)+' /Root 1 0 R >>\\n');
  addPart('startxref\\n'+xrefOffset+'\\nendobj\\n%%EOF\\n');

  // Concat all parts
  var total=rawParts.reduce(function(s,p){return s+p.byteLength;},0);
  var out=new Uint8Array(total);
  var pos=0;
  rawParts.forEach(function(p){out.set(p,pos);pos+=p.byteLength;});
  return out;
}

// ---- Perspective warp ----
// Given src canvas/image and 4 corner points [{x,y}] in src space (TL,TR,BR,BL),
// draw the perspective-corrected image onto dst canvas.
function perspectiveWarp(srcCanvas,corners,dstCanvas){
  var W=dstCanvas.width,H=dstCanvas.height;
  var ctx=dstCanvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  // Sample each destination pixel from source using bilinear perspective mapping
  var idata=ctx.createImageData(W,H);
  var src2d=srcCanvas.getContext('2d');
  var srcData=src2d.getImageData(0,0,srcCanvas.width,srcCanvas.height);
  var sw=srcCanvas.width,sh=srcCanvas.height;
  var tl=corners[0],tr=corners[1],br=corners[2],bl=corners[3];
  for(var dy=0;dy<H;dy++){
    var v=dy/H;
    for(var dx=0;dx<W;dx++){
      var u=dx/W;
      // Bilinear interpolation in source space
      var topX=tl.x+(tr.x-tl.x)*u;
      var topY=tl.y+(tr.y-tl.y)*u;
      var botX=bl.x+(br.x-bl.x)*u;
      var botY=bl.y+(br.y-bl.y)*u;
      var sx=topX+(botX-topX)*v;
      var sy=topY+(botY-topY)*v;
      var six=Math.round(sx),siy=Math.round(sy);
      if(six<0||six>=sw||siy<0||siy>=sh) continue;
      var si=(siy*sw+six)*4;
      var di=(dy*W+dx)*4;
      idata.data[di]=srcData.data[si];
      idata.data[di+1]=srcData.data[si+1];
      idata.data[di+2]=srcData.data[si+2];
      idata.data[di+3]=srcData.data[si+3];
    }
  }
  ctx.putImageData(idata,0,0);
}

// ---- Sobel edge detector ----
function sobelEdges(canvas){
  var ctx=canvas.getContext('2d');
  var w=canvas.width,h=canvas.height;
  var id=ctx.getImageData(0,0,w,h);
  var gray=new Float32Array(w*h);
  for(var i=0;i<w*h;i++) gray[i]=0.299*id.data[i*4]+0.587*id.data[i*4+1]+0.114*id.data[i*4+2];
  var mag=new Float32Array(w*h);
  var maxMag=0;
  for(var y=1;y<h-1;y++) for(var x=1;x<w-1;x++){
    var gx=-gray[(y-1)*w+(x-1)]+gray[(y-1)*w+(x+1)]-2*gray[y*w+(x-1)]+2*gray[y*w+(x+1)]-gray[(y+1)*w+(x-1)]+gray[(y+1)*w+(x+1)];
    var gy=-gray[(y-1)*w+(x-1)]-2*gray[(y-1)*w+x]-gray[(y-1)*w+(x+1)]+gray[(y+1)*w+(x-1)]+2*gray[(y+1)*w+x]+gray[(y+1)*w+(x+1)];
    var m=Math.sqrt(gx*gx+gy*gy);
    mag[y*w+x]=m;
    if(m>maxMag) maxMag=m;
  }
  return {mag:mag,max:maxMag,w:w,h:h};
}

// ---- Auto-detect document quad from edge map ----
function detectDocQuad(canvas){
  var s=sobelEdges(canvas);
  var thresh=s.max*0.25;
  var w=s.w,h=s.h;
  // Find bounding box of strong edges
  var minX=w,maxX=0,minY=h,maxY=0;
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    if(s.mag[y*w+x]>thresh){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  }
  // Pad a little
  var pad=8;
  minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad);
  maxX=Math.min(w-1,maxX+pad); maxY=Math.min(h-1,maxY+pad);
  if(maxX<=minX||maxY<=minY) return [{x:10,y:10},{x:w-10,y:10},{x:w-10,y:h-10},{x:10,y:h-10}];
  return [{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
}

// ---- Corner dragging ----
function makeCornerDragger(canvas,corners,onDraw){
  var dragging=-1,scale=1;
  function getScale(){return canvas.getBoundingClientRect().width/(canvas.width||1);}
  function getPos(e){
    var r=canvas.getBoundingClientRect();
    var sc=getScale();
    var cl=e.touches?e.touches[0]:e;
    return {x:(cl.clientX-r.left)/sc,y:(cl.clientY-r.top)/sc};
  }
  function hit(p){
    var r=Math.max(22,40/getScale());
    for(var i=0;i<corners.length;i++){
      var dx=p.x-corners[i].x,dy=p.y-corners[i].y;
      if(Math.sqrt(dx*dx+dy*dy)<r) return i;
    }
    return -1;
  }
  canvas.addEventListener('mousedown',function(e){dragging=hit(getPos(e));});
  canvas.addEventListener('touchstart',function(e){e.preventDefault();dragging=hit(getPos(e));},{passive:false});
  canvas.addEventListener('mousemove',function(e){if(dragging<0)return;var p=getPos(e);corners[dragging].x=p.x;corners[dragging].y=p.y;onDraw();});
  canvas.addEventListener('touchmove',function(e){e.preventDefault();if(dragging<0)return;var p=getPos(e);corners[dragging].x=p.x;corners[dragging].y=p.y;onDraw();},{passive:false});
  canvas.addEventListener('mouseup',function(){dragging=-1;});
  canvas.addEventListener('touchend',function(){dragging=-1;});
}

// ---- Draw corners overlay ----
function drawCornersOverlay(canvas,img,corners){
  var ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(img) ctx.drawImage(img,0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(74,144,217,0.85)';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(corners[0].x,corners[0].y);
  for(var i=1;i<corners.length;i++) ctx.lineTo(corners[i].x,corners[i].y);
  ctx.closePath();
  ctx.stroke();
  // Fill overlay
  ctx.fillStyle='rgba(74,144,217,0.12)';
  ctx.beginPath();
  ctx.moveTo(corners[0].x,corners[0].y);
  for(var j=1;j<corners.length;j++) ctx.lineTo(corners[j].x,corners[j].y);
  ctx.closePath();
  ctx.fill();
  corners.forEach(function(c){
    ctx.beginPath();
    ctx.arc(c.x,c.y,10,0,Math.PI*2);
    ctx.fillStyle='#4A90D9';
    ctx.fill();
    ctx.strokeStyle='#fff';
    ctx.lineWidth=2;
    ctx.stroke();
  });
}

// ---- Crop overlay (shared for library photos) ----
var cropQueue=[];
var cropCurrentImg=null;
var cropCorners=null;
var cropResolve=null;
var cropCanvas=document.getElementById('crop-canvas');
var cropOverlay=document.getElementById('crop-overlay');

function showCropOverlay(imgEl){
  return new Promise(function(resolve){
    cropResolve=resolve;
    cropCurrentImg=imgEl;
    cropCanvas.width=imgEl.naturalWidth||imgEl.width;
    cropCanvas.height=imgEl.naturalHeight||imgEl.height;
    var w=cropCanvas.width,h=cropCanvas.height;
    var pad=Math.min(w,h)*0.05;
    cropCorners=[{x:pad,y:pad},{x:w-pad,y:pad},{x:w-pad,y:h-pad},{x:pad,y:h-pad}];
    // Try auto-detect
    var tmpCanvas=document.createElement('canvas');
    tmpCanvas.width=w; tmpCanvas.height=h;
    tmpCanvas.getContext('2d').drawImage(imgEl,0,0,w,h);
    var detected=detectDocQuad(tmpCanvas);
    cropCorners=detected;
    drawCornersOverlay(cropCanvas,imgEl,cropCorners);
    makeCornerDragger(cropCanvas,cropCorners,function(){drawCornersOverlay(cropCanvas,imgEl,cropCorners);});
    cropOverlay.style.display='flex';
  });
}

document.getElementById('crop-skip-btn').addEventListener('click',function(){
  cropOverlay.style.display='none';
  if(cropResolve) cropResolve(null);
});
document.getElementById('crop-confirm-btn').addEventListener('click',function(){
  cropOverlay.style.display='none';
  if(!cropResolve||!cropCurrentImg) return;
  // Produce warp: output is A4 ratio
  var imgW=cropCurrentImg.naturalWidth||cropCurrentImg.width;
  var imgH=cropCurrentImg.naturalHeight||cropCurrentImg.height;
  var outW=794,outH=1123; // A4 at 96dpi
  var out=document.createElement('canvas');
  out.width=outW; out.height=outH;
  perspectiveWarp(cropCanvas,cropCorners,out); // cropCanvas already has imgEl drawn
  cropResolve(out);
});

// ---- Library mode ----
var libFiles=[];
var libInput=document.getElementById('lib-input');
var libPreviews=document.getElementById('lib-previews');
var libUploadBtn=document.getElementById('lib-upload-btn');
var libStatus=document.getElementById('lib-status');
var libProgBar=document.getElementById('lib-prog-bar');
var libProgFill=document.getElementById('lib-prog-fill');

libInput.addEventListener('change',function(){
  Array.from(libInput.files).forEach(function(f){ libFiles.push(f); });
  libInput.value='';
  renderLibPreviews();
});

function renderLibPreviews(){
  libPreviews.innerHTML='';
  libFiles.forEach(function(f,i){
    var w=document.createElement('div');
    w.className='thumb-wrap';
    var img=document.createElement('img');
    img.src=URL.createObjectURL(f);
    var del=document.createElement('button');
    del.className='thumb-del'; del.textContent='\u00d7';
    del.addEventListener('click',function(){libFiles.splice(i,1);renderLibPreviews();});
    w.appendChild(img); w.appendChild(del);
    libPreviews.appendChild(w);
  });
  libUploadBtn.disabled=libFiles.length===0;
}

libUploadBtn.addEventListener('click',async function(){
  if(!libFiles.length) return;
  libUploadBtn.disabled=true;
  libProgBar.style.display='';
  libStatus.textContent='Scanning photos\u2026';

  var pages=[];
  for(var i=0;i<libFiles.length;i++){
    libProgFill.style.width=Math.round((i/libFiles.length)*50)+'%';
    var img=new Image();
    await new Promise(function(res){
      img.onload=res; img.onerror=res;
      img.src=URL.createObjectURL(libFiles[i]);
    });
    // Show crop overlay
    var croppedCanvas=await showCropOverlay(img);
    var srcCanvas;
    if(croppedCanvas){
      srcCanvas=croppedCanvas;
    } else {
      srcCanvas=document.createElement('canvas');
      srcCanvas.width=img.naturalWidth; srcCanvas.height=img.naturalHeight;
      srcCanvas.getContext('2d').drawImage(img,0,0);
    }
    var jpegBlob=await new Promise(function(res){srcCanvas.toBlob(res,'image/jpeg',0.88);});
    var buf=await jpegBlob.arrayBuffer();
    pages.push({data:new Uint8Array(buf),w:srcCanvas.width,h:srcCanvas.height});
  }

  libProgFill.style.width='70%';
  libStatus.textContent='Building PDF\u2026';
  var pdfBytes=buildPdf(pages);

  libProgFill.style.width='85%';
  libStatus.textContent='Uploading\u2026';
  var fd=new FormData();
  fd.append('document',new Blob([pdfBytes],{type:'application/pdf'}),'scan_'+Date.now()+'.pdf');
  try{
    var r=await fetch(location.href.replace(location.search,'')+'?token='+encodeURIComponent(tk),{method:'POST',body:fd});
    libProgFill.style.width='100%';
    if(r.ok){
      libStatus.textContent='';
      showSuccess();
    } else {
      var j=await r.json().catch(function(){return {};});
      libStatus.textContent=j.error||('Upload failed ('+r.status+')');
      libUploadBtn.disabled=false;
    }
  } catch(e){
    libStatus.textContent='Upload error: '+e.message;
    libUploadBtn.disabled=false;
  }
});

// ---- Camera mode ----
// Uses the same corner-drag perspective-warp scanner as Library mode (showCropOverlay).
// Cropper.js has been removed \u2014 it used Cropper.default which doesn't exist in the
// UMD build and silently crashed the crop UI.
var camFallbackInput=document.getElementById('cam-fallback-input');
var camTakeWrap=document.getElementById('cam-take-wrap');
var camTakeLabel=document.getElementById('cam-take-label');
var camStatus=document.getElementById('cam-status');
var camProgBar=document.getElementById('cam-prog-bar');
var camProgFill=document.getElementById('cam-prog-fill');
var camUploadBtn=document.getElementById('cam-upload-btn');
var camPages=[];

function renderCamPages(){
  var list=document.getElementById('cam-pages-list');
  list.innerHTML='';
  if(camPages.length===0){list.style.display='none';return;}
  list.style.display='';
  camPages.forEach(function(pg,i){
    var w=document.createElement('div');
    w.className='thumb-wrap';
    var img=document.createElement('img');
    img.src=pg.objectUrl;
    var del=document.createElement('button');
    del.className='thumb-del'; del.textContent='\u00d7';
    del.addEventListener('click',function(){
      URL.revokeObjectURL(pg.objectUrl);
      camPages.splice(i,1);
      renderCamPages();
      updateCamUploadBtn();
      camTakeLabel.textContent='Tap to scan page '+(camPages.length+1);
      camStatus.textContent=camPages.length>0?camPages.length+' page'+(camPages.length!==1?'s':'')+' ready.':'';
    });
    var lbl=document.createElement('div');
    lbl.style.cssText='position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.5);color:#fff;font-size:.6rem;text-align:center;padding:2px;pointer-events:none;';
    lbl.textContent='p.'+(i+1);
    w.appendChild(img); w.appendChild(del); w.appendChild(lbl);
    list.appendChild(w);
  });
}

function updateCamUploadBtn(){
  if(camPages.length===0){camUploadBtn.style.display='none';camUploadBtn.disabled=true;}
  else{camUploadBtn.style.display='';camUploadBtn.disabled=false;camUploadBtn.textContent='Upload Document ('+camPages.length+' page'+(camPages.length!==1?'s':'')+')';}
}

// Photo taken \u2192 show the shared corner-drag overlay \u2192 add to pages list.
camFallbackInput.addEventListener('change',async function(){
  var file=this.files[0];
  this.value='';
  if(!file) return;
  camStatus.textContent='Loading\u2026';
  var img=new Image();
  var objUrl=URL.createObjectURL(file);
  try{
    await new Promise(function(res,rej){img.onload=res;img.onerror=rej;img.src=objUrl;});
  }catch(e){
    camStatus.textContent='Failed to load photo. Please try again.';
    URL.revokeObjectURL(objUrl);
    return;
  }
  URL.revokeObjectURL(objUrl);
  camStatus.textContent='';

  // showCropOverlay: auto-detects document quad, lets user drag corners, returns
  // a perspective-corrected canvas \u2014 or null if the user taps Skip.
  var croppedCanvas=await showCropOverlay(img);

  var srcCanvas;
  if(croppedCanvas){
    srcCanvas=croppedCanvas;
  } else {
    srcCanvas=document.createElement('canvas');
    srcCanvas.width=img.naturalWidth||img.width;
    srcCanvas.height=img.naturalHeight||img.height;
    srcCanvas.getContext('2d').drawImage(img,0,0);
  }

  var jpegBlob=await new Promise(function(res){srcCanvas.toBlob(res,'image/jpeg',0.88);});
  var buf=await jpegBlob.arrayBuffer();
  camPages.push({data:new Uint8Array(buf),w:srcCanvas.width,h:srcCanvas.height,objectUrl:URL.createObjectURL(new Blob([jpegBlob],{type:'image/jpeg'}))});
  renderCamPages();
  updateCamUploadBtn();
  camStatus.textContent='Page '+camPages.length+' added \u2014 scan another or tap Upload.';
  camTakeLabel.textContent='Tap to scan page '+(camPages.length+1);
});

// Combine all scanned pages into one PDF and upload.
camUploadBtn.addEventListener('click',async function(){
  if(!camPages.length) return;
  camUploadBtn.disabled=true;
  camTakeWrap.style.display='none';
  camProgBar.style.display='';
  camProgFill.style.width='50%';
  camStatus.textContent='Building PDF\u2026';
  var pdfBytes=buildPdf(camPages);
  camProgFill.style.width='80%';
  camStatus.textContent='Uploading\u2026';
  var fd=new FormData();
  fd.append('document',new Blob([pdfBytes],{type:'application/pdf'}),'scan_'+Date.now()+'.pdf');
  try{
    var r=await fetch(location.href.replace(location.search,'')+'?token='+encodeURIComponent(tk),{method:'POST',body:fd});
    camProgFill.style.width='100%';
    if(r.ok){
      camPages.forEach(function(pg){URL.revokeObjectURL(pg.objectUrl);}); camPages=[];
      camStatus.textContent='';
      showSuccess();
    }else{
      var j=await r.json().catch(function(){return{};});
      camStatus.textContent=j.error||('Upload failed ('+r.status+')');
      camUploadBtn.disabled=false;
      camTakeWrap.style.display='';
    }
  }catch(e){
    camStatus.textContent='Upload error: '+e.message;
    camUploadBtn.disabled=false;
    camTakeWrap.style.display='';
  }
});

// ---- Files mode ----
var filesInput=document.getElementById('files-input');
var filesUploadBtn=document.getElementById('files-upload-btn');
var filesStatus=document.getElementById('files-status');
var filesProgBar=document.getElementById('files-prog-bar');
var filesProgFill=document.getElementById('files-prog-fill');
var filesListEl=document.getElementById('files-list');
var selectedFiles=[];

filesInput.addEventListener('change',function(){
  Array.from(filesInput.files).forEach(function(f){selectedFiles.push(f);});
  filesInput.value='';
  renderFilesList();
});

function renderFilesList(){
  filesListEl.innerHTML='';
  if(selectedFiles.length===0){filesListEl.style.display='none';filesUploadBtn.disabled=true;return;}
  filesListEl.style.display='flex';
  selectedFiles.forEach(function(f,i){
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:.8rem;';
    var name=document.createElement('span');
    name.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    name.textContent=f.name;
    var size=document.createElement('span');
    size.style.cssText='color:#9ca3af;flex-shrink:0;';
    size.textContent=formatSize(f.size);
    var del=document.createElement('button');
    del.style.cssText='background:none;border:none;color:#9ca3af;font-size:1.1rem;cursor:pointer;flex-shrink:0;padding:0 4px;line-height:1;';
    del.textContent='\u00d7';
    del.addEventListener('click',function(){selectedFiles.splice(i,1);renderFilesList();});
    row.appendChild(name); row.appendChild(size); row.appendChild(del);
    filesListEl.appendChild(row);
  });
  filesUploadBtn.disabled=false;
  filesUploadBtn.textContent='Upload '+selectedFiles.length+' File'+(selectedFiles.length!==1?'s':'');
}

function formatSize(n){
  if(n<1024) return n+' B';
  if(n<1048576) return (n/1024).toFixed(1)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}

// Upload each selected file as its own document (sequential POSTs).
filesUploadBtn.addEventListener('click',async function(){
  if(!selectedFiles.length) return;
  filesUploadBtn.disabled=true;
  filesProgBar.style.display='';
  var total=selectedFiles.length;
  for(var i=0;i<total;i++){
    filesProgFill.style.width=Math.round((i/total)*90)+'%';
    filesStatus.textContent='Uploading '+(i+1)+' of '+total+'\u2026';
    var fd=new FormData();
    fd.append('document',selectedFiles[i],selectedFiles[i].name);
    try{
      var r=await fetch(location.href.replace(location.search,'')+'?token='+encodeURIComponent(tk),{method:'POST',body:fd});
      if(!r.ok){
        var j=await r.json().catch(function(){return{};});
        filesStatus.textContent=j.error||('Upload failed on file '+(i+1)+' ('+r.status+')');
        filesUploadBtn.disabled=false;
        return;
      }
    }catch(e){
      filesStatus.textContent='Upload error: '+e.message;
      filesUploadBtn.disabled=false;
      return;
    }
  }
  filesProgFill.style.width='100%';
  filesStatus.textContent='';
  showSuccess();
});

// ---- Success screen ----
function showSuccess(){
  document.getElementById('global-succ').style.display='flex';
}
document.getElementById('upload-another-btn').addEventListener('click',function(){
  document.getElementById('global-succ').style.display='none';
  libFiles=[]; renderLibPreviews();
  camPages.forEach(function(pg){URL.revokeObjectURL(pg.objectUrl);}); camPages=[];
  renderCamPages(); updateCamUploadBtn();
  camStatus.textContent=''; camTakeLabel.textContent='Tap to scan first page';
  camTakeWrap.style.display='';
  selectedFiles=[]; renderFilesList();
  filesProgBar.style.display='none'; filesProgFill.style.width='0';
  libProgBar.style.display='none'; libProgFill.style.width='0';
  camProgBar.style.display='none'; camProgFill.style.width='0';
});

})();
</script>
</body>
</html>`;
}

function startDocumentUploadServer(tempDir, sessionToken, port, onDocument) {
  const http = require('http');
  const Busboy = require('busboy');
  const fsSync = require('fs');

  const html = getMobileDocumentUploadHtml();
  const ALLOWED_MIME = new Set([
    'application/pdf','image/jpeg','image/png','image/gif','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]);

  const server = http.createServer((req, res) => {
    let urlObj;
    try { urlObj = new URL(req.url, `http://localhost:${port}`); } catch (e) {
      res.writeHead(400); res.end('Bad request'); return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    if (req.method === 'GET' && urlObj.pathname === '/upload') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && urlObj.pathname === '/cropperjs.js') {
      try {
        const cropperPath = require('path').join(__dirname, 'node_modules', 'cropperjs', 'dist', 'cropper.min.js');
        const content = fsSync.readFileSync(cropperPath);
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'max-age=3600' });
        res.end(content);
      } catch (e) { res.writeHead(404); res.end('Not found'); }
      return;
    }

    // #region agent log
    if (req.method === 'POST' && urlObj.pathname === '/dbg') {
      let dbgBody = '';
      req.on('data', function(d){ dbgBody += d; });
      req.on('end', function(){
        try { fsSync.appendFileSync('debug-32be09.log', dbgBody + '\n'); } catch(e){}
        res.writeHead(200); res.end('ok');
      });
      return;
    }
    // #endregion

    if (req.method === 'POST' && urlObj.pathname === '/upload') {
      const token = urlObj.searchParams.get('token');
      if (token !== sessionToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session — please reopen the upload page.' }));
        return;
      }

      let bb;
      try {
        bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid multipart request' }));
        return;
      }

      const pending = [];

      bb.on('file', (_fieldname, file, info) => {
        const rawName = String((info && info.filename) || 'document.pdf');
        const ext = path.extname(rawName).toLowerCase() || '.pdf';
        const safeName = `wdoc_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
        const destPath = path.join(tempDir, safeName);
        const ws = fsSync.createWriteStream(destPath);
        file.pipe(ws);

        file.on('limit', () => { file.resume(); });

        const p = new Promise((resolve) => {
          ws.on('finish', async () => {
            try {
              const stat = fsSync.statSync(destPath);
              const mimeType = info.mimeType || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');
              onDocument({ localPath: destPath, name: rawName, mimeType, sizeBytes: stat.size });
              resolve(true);
            } catch (err) {
              console.error('[doc-upload] process error:', err.message);
              resolve(false);
            }
          });
          ws.on('error', () => resolve(false));
        });
        pending.push(p);
      });

      bb.on('finish', async () => {
        await Promise.all(pending);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });

      bb.on('error', (err) => {
        console.error('[doc-upload] busboy error:', err.message);
        if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Upload failed' })); }
      });

      req.pipe(bb);
      return;
    }

    res.writeHead(404); res.end('Not found');
  });

  server.on('error', (err) => console.error('[doc-upload] server error:', err.message));
  server.listen(port, '0.0.0.0');
  return server;
}

// ---------- Wireless Document Upload ----------

let wirelessDocServer = null;
let wirelessDocBridgeProc = null;
let wirelessDocSender = null;
let wirelessDocTempDir = null;

ipcMain.handle('start-wireless-document-import', async (event) => {
  try {
    if (wirelessDocServer) { try { wirelessDocServer.close(); } catch { /* ignore */ } wirelessDocServer = null; }
    if (wirelessDocBridgeProc) { try { wirelessDocBridgeProc.kill(); } catch { /* ignore */ } wirelessDocBridgeProc = null; }

    await new Promise((resolve) => {
      require('child_process').exec(
        'powershell -NoProfile -NonInteractive -Command "' +
        'Get-WmiObject Win32_Process | ' +
        'Where-Object { $_.Name -eq \'powershell.exe\' -and $_.CommandLine -like \'*wifi-direct-bridge*\' } | ' +
        'ForEach-Object { $_.Terminate() }"',
        { windowsHide: true, timeout: 8000 },
        () => resolve()
      );
    });

    const { createHash } = require('crypto');
    const machineKey = createHash('sha256').update(require('os').hostname()).digest('hex');
    const stableSsid = 'Oversight-' + machineKey.slice(0, 6).toUpperCase();
    const stablePass = machineKey.slice(6, 18);

    const { result, proc } = await startWifiDirectBridge(stableSsid, stablePass);
    if (!result.success) return { success: false, error: result.error || 'Failed to start Wi-Fi Direct AP' };
    wirelessDocBridgeProc = proc;

    const tempDir = toWindowsPath(
      path.join(app.getPath('temp'), 'oversight-wireless-docs', Date.now().toString())
    );
    await fs.mkdir(tempDir, { recursive: true });
    wirelessDocTempDir = tempDir;
    wirelessDocSender = event.sender;

    const port = await findFreePort();
    const sessionToken = require('crypto').randomBytes(16).toString('hex');
    const uploadUrl = `http://${result.gatewayIp}:${port}/upload?token=${sessionToken}`;

    // #region agent log
    try { require('fs').appendFileSync('debug-32be09.log', JSON.stringify({sessionId:'32be09',location:'main.js:uploadUrl',message:'document-upload server URL generated',data:{protocol:uploadUrl.split(':')[0],host:`${result.gatewayIp}:${port}`,isHttps:uploadUrl.startsWith('https')},timestamp:Date.now(),hypothesisId:'A'}) + '\n'); } catch(e){}
    // #endregion

    await ensureWirelessFirewallRule().catch(() => {});

    const QRCode = require('qrcode');
    const wifiQrString = `WIFI:T:WPA;S:${result.ssid};P:${result.password};;`;
    const [wifiQr, urlQr] = await Promise.all([
      QRCode.toDataURL(wifiQrString, { width: 256, margin: 2 }),
      QRCode.toDataURL(uploadUrl, { width: 256, margin: 2 }),
    ]);

    wirelessDocServer = startDocumentUploadServer(tempDir, sessionToken, port, ({ localPath, name, mimeType, sizeBytes }) => {
      if (wirelessDocSender && !wirelessDocSender.isDestroyed()) {
        wirelessDocSender.send('wireless-document-received', { localPath, name, mimeType, sizeBytes });
      }
    });

    return { success: true, ssid: result.ssid, password: result.password, uploadUrl, wifiQr, urlQr };
  } catch (err) {
    console.error('[start-wireless-document-import] error:', err);
    if (wirelessDocBridgeProc) { try { wirelessDocBridgeProc.kill(); } catch { /* ignore */ } wirelessDocBridgeProc = null; }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-wireless-document-import', async () => {
  try {
    if (wirelessDocServer) { try { wirelessDocServer.close(); } catch { /* ignore */ } wirelessDocServer = null; }
    if (wirelessDocBridgeProc) { try { wirelessDocBridgeProc.kill(); } catch { /* ignore */ } wirelessDocBridgeProc = null; }
    wirelessDocSender = null;
    return { success: true };
  } catch (err) {
    console.error('[stop-wireless-document-import] error:', err);
    return { success: false, error: err.message };
  }
});
