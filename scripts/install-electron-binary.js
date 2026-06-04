#!/usr/bin/env node
/**
 * Downloads and extracts Electron using adm-zip (reliable on Windows).
 * electron/install.js uses extract-zip, which can leave a partial dist/ on some systems.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.argv[2] || path.join(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const { version } = require(path.join(electronDir, 'package.json'));

const { downloadArtifact } = require(
  require.resolve('@electron/get', { paths: [electronDir] })
);
const AdmZip = require('adm-zip');

function exeName() {
  return process.platform === 'win32' ? 'electron.exe' : 'electron';
}

function distDir() {
  return path.join(electronDir, 'dist');
}

function cacheDistDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'oversight-desktop', `electron-v${version}-win32-x64`);
}

function extractZip(zipPath, destDir) {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

function writeMarkers() {
  fs.mkdirSync(distDir(), { recursive: true });
  fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName());
  fs.writeFileSync(path.join(distDir(), 'version'), version);
}

async function main() {
  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;
  const arch = process.env.ELECTRON_INSTALL_ARCH || process.arch;
  const targets = [
    { dir: distDir(), label: 'project folder' },
  ];
  if (process.platform === 'win32') {
    targets.push({ dir: cacheDistDir(), label: 'AppData cache' });
  }

  console.log('Downloading Electron…');
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform,
    arch,
    force: process.env.force_no_cache === 'true',
    checksums: require(path.join(electronDir, 'checksums.json')),
  });

  for (const { dir, label } of targets) {
    console.log(`Extracting Electron to ${label}…`);
    extractZip(zipPath, dir);
    const exe = path.join(dir, exeName());
    if (fs.existsSync(exe)) {
      writeMarkers();
      console.log('Electron ready:', exe);
      return;
    }
    console.warn(`Extract to ${label} did not produce ${exeName()}, trying next location…`);
  }

  throw new Error('Electron executable missing after extract. Check antivirus or disk space.');
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
