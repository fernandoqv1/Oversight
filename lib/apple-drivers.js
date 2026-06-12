const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const APPLE_REGISTRY_PATHS = [
  'HKLM\\SOFTWARE\\Apple Inc.\\Apple Mobile Device Support',
  'HKLM\\SOFTWARE\\WOW6432Node\\Apple Inc.\\Apple Mobile Device Support',
];

const APPLE_SERVICE_NAME = 'Apple Mobile Device Service';
const MSI_FILE_NAME = 'AppleMobileDeviceSupport64.msi';
const WINGET_PACKAGE_ID = 'Apple.AppleMobileDeviceSupport';

let cachedStatus = null;
let installInFlight = null;

function getMsiPath() {
  let electronApp = null;
  try {
    ({ app: electronApp } = require('electron'));
  } catch {
    electronApp = null;
  }

  if (electronApp?.isPackaged) {
    return path.join(process.resourcesPath, 'apple-drivers', MSI_FILE_NAME);
  }
  return path.join(__dirname, '..', 'bin', 'apple-drivers', MSI_FILE_NAME);
}

function isDriverInstalledSync() {
  for (const regPath of APPLE_REGISTRY_PATHS) {
    const result = spawnSync('reg', ['query', regPath], {
      windowsHide: true,
      timeout: 3000,
    });
    if (result.status === 0) return true;
  }
  return false;
}

function isAppleServicePresent() {
  const result = spawnSync('sc', ['query', APPLE_SERVICE_NAME], {
    windowsHide: true,
    timeout: 3000,
  });
  return result.status === 0;
}

function checkDriverStatus() {
  if (cachedStatus === 'installed') return cachedStatus;
  const installed = isDriverInstalledSync() && isAppleServicePresent();
  cachedStatus = installed ? 'installed' : 'missing';
  return cachedStatus;
}

function installDriverViaMsi(msiPath, { onProgress } = {}) {
  return new Promise((resolve) => {
    if (!msiPath || !fs.existsSync(msiPath)) {
      resolve({
        success: false,
        code: -1,
        stderr: `MSI not found at ${msiPath || '(empty path)'}`,
      });
      return;
    }

    if (onProgress) onProgress('installing-msi');

    const escaped = msiPath.replace(/'/g, "''");
    const psScript = [
      `$msi = '${escaped}'`,
      '$p = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $msi, "/quiet", "/norestart") -Verb RunAs -Wait -PassThru',
      'if ($null -eq $p) { exit 1223 }',
      'exit $p.ExitCode',
    ].join('; ');

    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript,
    ], { windowsHide: true });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      resolve({ success: false, code: -1, stderr: err.message });
    });

    proc.on('close', (code) => {
      cachedStatus = null;
      const nowInstalled = checkDriverStatus() === 'installed';
      const cancelled = code === 1223;
      resolve({
        success: nowInstalled,
        code,
        stderr: cancelled ? 'Installation cancelled (UAC denied)' : stderr,
        cancelled,
      });
    });
  });
}

function installDriverViaWinget({ onProgress } = {}) {
  return new Promise((resolve) => {
    const wingetCheck = spawnSync('where', ['winget'], { windowsHide: true });
    if (wingetCheck.status !== 0) {
      resolve({
        success: false,
        code: -1,
        stderr: 'winget not available on this system',
      });
      return;
    }

    if (onProgress) onProgress('installing-winget');

    const args = [
      'install',
      '--id', WINGET_PACKAGE_ID,
      '--exact',
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ];

    const proc = spawn('winget', args, { windowsHide: true });

    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      if (onProgress) onProgress(chunk.toString());
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      resolve({ success: false, code: -1, stderr: err.message });
    });

    proc.on('close', (code) => {
      cachedStatus = null;
      const nowInstalled = checkDriverStatus() === 'installed';
      resolve({
        success: nowInstalled,
        code,
        stderr,
      });
    });
  });
}

async function ensureAppleDrivers({ onProgress } = {}) {
  if (process.platform !== 'win32') {
    return { status: 'skipped', reason: 'not-windows' };
  }

  if (checkDriverStatus() === 'installed') {
    return { status: 'already-installed' };
  }

  if (installInFlight) {
    return installInFlight;
  }

  installInFlight = (async () => {
    if (onProgress) onProgress('installing');

    const msiPath = getMsiPath();
    if (fs.existsSync(msiPath)) {
      const msiResult = await installDriverViaMsi(msiPath, { onProgress });
      if (checkDriverStatus() === 'installed') {
        return { status: 'installed', method: 'msi' };
      }
      if (!msiResult.cancelled) {
        console.warn('Apple driver MSI install did not register:', msiResult.stderr || msiResult.code);
      }
    } else {
      console.warn('Bundled Apple driver MSI missing:', msiPath);
    }

    const wingetResult = await installDriverViaWinget({ onProgress });
    if (checkDriverStatus() === 'installed') {
      return { status: 'installed', method: 'winget' };
    }

    return {
      status: 'failed',
      error: wingetResult.stderr || 'Apple Mobile Device Support could not be installed',
      code: wingetResult.code,
    };
  })();

  try {
    return await installInFlight;
  } finally {
    installInFlight = null;
  }
}

module.exports = {
  checkDriverStatus,
  ensureAppleDrivers,
  isDriverInstalledSync,
  isAppleServicePresent,
  getMsiPath,
  MSI_FILE_NAME,
};
