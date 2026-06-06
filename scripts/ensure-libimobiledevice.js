const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const root = path.join(__dirname, '..');
const binDir = path.join(root, 'bin', 'libimobiledevice');
const marker = path.join(binDir, 'idevice_id.exe');
const zipUrl = 'https://github.com/jrjr/libimobiledevice-windows/releases/download/v20260531-74585f8/libimobile-suite-latest_w64.zip';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      }).on('error', reject);
    };
    request(url);
  });
}

async function ensureLibimobiledevice() {
  if (fs.existsSync(marker)) {
    console.log('libimobiledevice binaries already installed');
    return;
  }

  const tmpZip = path.join(root, 'bin', 'libimobiledevice-suite.zip');
  const tmpExtract = path.join(root, 'bin', 'libimobiledevice-download');

  try {
    if (!fs.existsSync(path.join(root, 'bin'))) {
      fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    }

    console.log('Downloading libimobiledevice Windows binaries...');
    await downloadFile(zipUrl, tmpZip);

    if (fs.existsSync(tmpExtract)) {
      fs.rmSync(tmpExtract, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpExtract, { recursive: true });

    const zip = new AdmZip(tmpZip);
    zip.extractAllTo(tmpExtract, true);

    if (fs.existsSync(binDir)) {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
    fs.mkdirSync(binDir, { recursive: true });

    const entries = fs.readdirSync(tmpExtract, { withFileTypes: true });
    const flat = entries.every((e) => e.isFile());
    const sourceDir = flat ? tmpExtract : tmpExtract;
    for (const entry of fs.readdirSync(sourceDir)) {
      const src = path.join(sourceDir, entry);
      const dest = path.join(binDir, entry);
      fs.copyFileSync(src, dest);
    }

    console.log('libimobiledevice binaries installed to bin/libimobiledevice');
  } finally {
    try { if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip); } catch { /* ignore */ }
    try { if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { /* ignore */ }
    try {
      const legacyTmp = path.join(root, 'bin', 'libimobiledevice-tmp');
      if (fs.existsSync(legacyTmp)) fs.rmSync(legacyTmp, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

module.exports = { ensureLibimobiledevice };

if (require.main === module) {
  ensureLibimobiledevice().catch((err) => {
    console.warn('libimobiledevice install skipped:', err.message);
    process.exit(0);
  });
}
