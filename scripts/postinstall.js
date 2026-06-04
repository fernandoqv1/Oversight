const fs = require('fs');
const path = require('path');
const { ensureElectron } = require('./ensure-electron');

const root = path.join(__dirname, '..');

/** copyFileSync can fail on Windows when dest exists or the volume hiccups */
function copyFileSafe(src, dest) {
  if (!fs.existsSync(src)) return;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dest)) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* try overwrite anyway */
    }
  }
  try {
    fs.copyFileSync(src, dest);
  } catch {
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
}
const libDir = path.join(root, 'lib');
const fontsDir = path.join(root, 'fonts', 'inter');

if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

// docxtemplater
const dt = path.join(root, 'node_modules/docxtemplater/build/docxtemplater.js');
if (fs.existsSync(dt)) copyFileSafe(dt, path.join(libDir, 'docxtemplater.js'));

// docxtemplater imagemodule
const im = path.join(root, 'node_modules/docxtemplater-image-module-free/build/imagemodule.js');
if (fs.existsSync(im)) {
  const dest = path.join(libDir, 'imagemodule.js');
  copyFileSafe(im, dest);
  let c = fs.readFileSync(dest, 'utf8');
  c = c.replace(/\s*newTag\.namespaceURI = null;\s*\n/g, '\n');
  fs.writeFileSync(dest, c);
}

// jszip
const jszip = path.join(root, 'node_modules/jszip/dist/jszip.min.js');
if (fs.existsSync(jszip)) copyFileSafe(jszip, path.join(libDir, 'jszip.min.js'));

// file-saver (try min first, then non-min)
const fileSaverMin = path.join(root, 'node_modules/file-saver/dist/FileSaver.min.js');
const fileSaver = path.join(root, 'node_modules/file-saver/dist/FileSaver.js');
if (fs.existsSync(fileSaverMin)) {
  copyFileSafe(fileSaverMin, path.join(libDir, 'file-saver.min.js'));
} else if (fs.existsSync(fileSaver)) {
  copyFileSafe(fileSaver, path.join(libDir, 'file-saver.min.js'));
}

// xlsx
const xlsx = path.join(root, 'node_modules/xlsx/dist/xlsx.full.min.js');
if (fs.existsSync(xlsx)) copyFileSafe(xlsx, path.join(libDir, 'xlsx.full.min.js'));

// Inter fonts (weights 400, 500, 600, 700 for latin subset)
const fontSourceDir = path.join(root, 'node_modules/@fontsource/inter/files');
const fontWeights = [400, 500, 600, 700];
if (fs.existsSync(fontSourceDir)) {
  fontWeights.forEach((w) => {
    const f = `inter-latin-${w}-normal.woff2`;
    const src = path.join(fontSourceDir, f);
    if (fs.existsSync(src)) copyFileSafe(src, path.join(fontsDir, f));
  });
}

ensureElectron(root);
