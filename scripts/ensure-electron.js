const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function electronExeName() {
  return process.platform === 'win32' ? 'electron.exe' : 'electron';
}

function electronDir(root) {
  return path.join(root, 'node_modules', 'electron');
}

function localExe(root) {
  return path.join(electronDir(root), 'dist', electronExeName());
}

function cacheDistDir(root) {
  const electronDirPath = electronDir(root);
  if (!fs.existsSync(path.join(electronDirPath, 'package.json'))) {
    return null;
  }
  const { version } = require(path.join(electronDirPath, 'package.json'));
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'oversight-desktop', `electron-v${version}-win32-x64`);
}

function cacheExe(root) {
  const dir = cacheDistDir(root);
  return dir ? path.join(dir, electronExeName()) : null;
}

function isPartialDist(root) {
  const exe = localExe(root);
  if (fs.existsSync(exe)) return false;
  const dist = path.join(electronDir(root), 'dist');
  if (!fs.existsSync(dist)) return false;
  try {
    return fs.readdirSync(dist).length > 0;
  } catch {
    return false;
  }
}

function removeLocalDist(root) {
  const distDir = path.join(electronDir(root), 'dist');
  if (fs.existsSync(distDir)) {
    console.log('Removing incomplete Electron download…');
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  try {
    fs.unlinkSync(path.join(electronDir(root), 'path.txt'));
  } catch {
    /* ignore */
  }
}

/**
 * @returns {Record<string, string>}
 */
function getElectronDistEnv(root) {
  const dir = cacheDistDir(root);
  const exe = cacheExe(root);
  if (dir && exe && fs.existsSync(exe) && !fs.existsSync(localExe(root))) {
    return { ELECTRON_OVERRIDE_DIST_PATH: dir };
  }
  return {};
}

function ensureElectron(rootDir) {
  const root = rootDir || path.join(__dirname, '..');
  const installJs = path.join(electronDir(root), 'install.js');

  if (!fs.existsSync(installJs)) {
    console.warn('ensure-electron: electron package not installed — run npm install first.');
    return;
  }

  if (fs.existsSync(localExe(root))) {
    return;
  }

  const cached = cacheExe(root);
  if (cached && fs.existsSync(cached)) {
    return;
  }

  if (isPartialDist(root)) {
    removeLocalDist(root);
  }

  const script = path.join(__dirname, 'install-electron-binary.js');
  const result = spawnSync(process.execPath, [script, root], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, force_no_cache: 'true' },
  });

  if (result.status !== 0) {
    console.error(
      'Electron install failed. Run:\n  node scripts/install-electron-binary.js'
    );
    process.exit(result.status || 1);
  }

  if (!fs.existsSync(localExe(root)) && !(cacheExe(root) && fs.existsSync(cacheExe(root)))) {
    console.error('Electron binary still missing after install.');
    process.exit(1);
  }
}

if (require.main === module) {
  ensureElectron();
}

module.exports = { ensureElectron, getElectronDistEnv };
