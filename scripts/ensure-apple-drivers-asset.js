const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const destDir = path.join(root, 'bin', 'apple-drivers');
const destMsi = path.join(destDir, 'AppleMobileDeviceSupport64.msi');

const MSI_URL = 'https://github.com/koush/AppleMobileDeviceSupport/releases/download/v14.5.0.7/AppleMobileDeviceSupport64.msi';

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

async function ensureAppleDriversAsset() {
  if (fs.existsSync(destMsi)) {
    const size = fs.statSync(destMsi).size;
    if (size > 1000000) {
      console.log('Apple Mobile Device Support MSI already present');
      return;
    }
    fs.unlinkSync(destMsi);
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const tmpMsi = path.join(destDir, 'AppleMobileDeviceSupport64.download.msi');
  try {
    console.log('Downloading Apple Mobile Device Support MSI from koush/AppleMobileDeviceSupport...');
    await downloadFile(MSI_URL, tmpMsi);
    fs.renameSync(tmpMsi, destMsi);
    console.log('Apple Mobile Device Support MSI saved to bin/apple-drivers/');
  } finally {
    try {
      if (fs.existsSync(tmpMsi)) fs.unlinkSync(tmpMsi);
    } catch { /* ignore */ }
  }
}

if (require.main === module) {
  ensureAppleDriversAsset().catch((err) => {
    console.error('Apple driver asset download failed:', err.message);
    process.exit(1);
  });
}

module.exports = { ensureAppleDriversAsset, MSI_URL, destMsi };
