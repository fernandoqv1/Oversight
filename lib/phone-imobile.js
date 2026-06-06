const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { spawn } = require('child_process');
const { app } = require('electron');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.bmp', '.tiff', '.tif']);
const SKIP_EXTENSIONS = new Set(['.aae', '.mov', '.mp4', '.m4v']);

function getBinDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', 'libimobiledevice');
  }
  return path.join(__dirname, '..', 'bin', 'libimobiledevice');
}

function isAvailable() {
  return fs.existsSync(path.join(getBinDir(), 'idevice_id.exe'));
}

function runTool(exeName, args, timeoutMs = 60000) {
  const binDir = getBinDir();
  const exePath = path.join(binDir, exeName);
  if (!fs.existsSync(exePath)) {
    return Promise.reject(new Error('libimobiledevice tools not installed'));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(exePath, args, { cwd: binDir, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${exeName} timed out`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const out = stdout.trim();
      const err = stderr.trim();
      if (code !== 0 && !out) {
        reject(new Error(err || `${exeName} exited with code ${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err, code });
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function parseLsOutput(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '.' && line !== '..');
}

function toRemotePath(photoPath) {
  const normalized = String(photoPath).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${normalized}`;
}

function toRelPath(remotePath) {
  return String(remotePath).replace(/\\/g, '/').replace(/^\/+/, '');
}

function formatUnixDate(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatUnixDateLabel(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function parseAfcInfo(text) {
  const info = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    info[key] = value;
  }
  const mtime = parseInt(info.st_mtime, 10);
  const birth = parseInt(info.st_birthtime || info.st_ctime, 10);
  const ts = Number.isFinite(mtime) ? mtime : birth;
  return {
    size: info.st_size || '',
    mtime: ts,
    isoDate: formatUnixDate(ts),
    label: formatUnixDateLabel(ts),
  };
}

function folderDateHint(folderName, dateFilter) {
  if (!dateFilter || !folderName) return false;
  const digits = dateFilter.replace(/-/g, '');
  if (digits.length < 6) return false;
  return folderName.includes(digits.slice(0, 6));
}

async function afcLs(udid, remotePath) {
  const { stdout } = await runTool('afcclient.exe', ['-u', udid, 'ls', remotePath], 45000);
  return parseLsOutput(stdout);
}

async function afcInfo(udid, remotePath) {
  try {
    const { stdout } = await runTool('afcclient.exe', ['-u', udid, 'info', remotePath], 20000);
    return parseAfcInfo(stdout);
  } catch {
    return { size: '', mtime: 0, isoDate: '', label: '' };
  }
}

async function walkPhotos(udid, remoteDir, relDir, dateFilter, photos) {
  let entries = [];
  try {
    entries = await afcLs(udid, remoteDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    const remotePath = remoteDir.endsWith('/') ? `${remoteDir}${entry}` : `${remoteDir}/${entry}`;
    const relPath = relDir ? `${relDir}/${entry}` : entry;

    if (IMAGE_EXTENSIONS.has(ext)) {
      if (dateFilter && folderDateHint(relDir, dateFilter)) {
        photos.push({
          path: relPath,
          name: entry,
          date: dateFilter,
          dateTaken: '',
          dateSource: 'folder',
          size: '',
          folder: relDir ? relDir.split('/').pop() : '',
          relPath: relDir,
        });
        continue;
      }
      const info = await afcInfo(udid, remotePath);
      const isoDate = info.isoDate || '';
      if (dateFilter && isoDate && isoDate !== dateFilter && !folderDateHint(relDir, dateFilter)) {
        continue;
      }
      if (dateFilter && !isoDate && !folderDateHint(relDir, dateFilter)) {
        continue;
      }
      photos.push({
        path: relPath,
        name: entry,
        date: isoDate,
        dateTaken: info.label,
        dateSource: 'mtime',
        size: info.size,
        folder: relDir ? relDir.split('/').pop() : '',
        relPath: relDir,
      });
      continue;
    }

    if (SKIP_EXTENSIONS.has(ext)) continue;

    if (!ext) {
      await walkPhotos(udid, remotePath, relPath, dateFilter, photos);
    }
  }
}

async function detect() {
  if (!isAvailable()) {
    return { success: false, available: false, error: 'libimobiledevice tools not installed', devices: [] };
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await runTool('idevice_id.exe', ['-l'], 15000);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    return {
      success: true,
      available: true,
      connected: false,
      error: error.message,
      devices: [],
    };
  }

  const udids = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (udids.length === 0) {
    return {
      success: true,
      available: true,
      connected: false,
      error: stderr || 'No trusted device found (tap Trust This Computer on iPhone)',
      devices: [],
    };
  }

  const devices = [];

  for (const udid of udids) {
    let name = 'iPhone';
    try {
      const info = await runTool('ideviceinfo.exe', ['-u', udid, '-k', 'DeviceName'], 15000);
      if (info.stdout) name = info.stdout.split(/\r?\n/)[0].trim() || name;
    } catch { /* keep default */ }
    devices.push({ name, udid, backend: 'libimobiledevice' });
  }

  return { success: true, available: true, connected: true, devices };
}

async function list(udid, dateFilter) {
  if (!udid) {
    return { success: false, error: 'Device UDID is required' };
  }

  const photos = [];
  const roots = ['/DCIM', '/PhotoData/CPLAssets'];
  for (const rootPath of roots) {
    try {
      await walkPhotos(udid, rootPath, rootPath.replace(/^\//, ''), dateFilter || '', photos);
    } catch { /* try next root */ }
  }

  if (photos.length === 0) {
    try {
      const top = await afcLs(udid, '/');
      for (const entry of top) {
        if (entry.toLowerCase().includes('dcim') || entry.toLowerCase().includes('photo')) {
          const remote = `/${entry}`;
          await walkPhotos(udid, remote, entry, dateFilter || '', photos);
        }
      }
    } catch { /* ignore */ }
  }

  return { success: true, photos, totalOnDevice: photos.length };
}

async function importPhotos(udid, filePaths, destDir) {
  if (!udid) {
    return { success: false, error: 'Device UDID is required' };
  }
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { success: false, error: 'No files selected' };
  }

  await fsPromises.mkdir(destDir, { recursive: true });
  const imported = [];
  const errors = [];

  for (const filePath of filePaths) {
    const rel = toRelPath(filePath);
    const remote = toRemotePath(rel);
    const fileName = path.basename(rel);
    const localPath = path.join(destDir, fileName);

    try {
      await runTool('afcclient.exe', ['-u', udid, 'get', remote, localPath], 120000);
      if (fs.existsSync(localPath)) {
        imported.push({ name: fileName, localPath });
      } else {
        errors.push(`Timed out copying '${fileName}'`);
      }
    } catch (err) {
      errors.push(`Error copying '${rel}': ${err.message}`);
    }
  }

  return { success: true, imported, errors };
}

module.exports = {
  isAvailable,
  getBinDir,
  detect,
  list,
  importPhotos,
};
