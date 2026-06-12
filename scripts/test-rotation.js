// Diagnose the 90-degree rotation bug: for real iPhone files copied during
// earlier testing, check (a) actual content format, (b) EXIF orientation tag,
// (c) whether heic-convert's output is already upright (libheif applies the
// irot transform) — if so, the manual post-rotation double-rotates portraits.
const fs = require('fs');
const path = require('path');
const os = require('os');

function sniffImageFormat(buffer) {
  if (!buffer || buffer.length < 12) return 'unknown';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';
  const box = buffer.slice(4, 8).toString('ascii');
  if (box === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('hei') || brand === 'mif1' || brand === 'hevc' || brand === 'avif') return 'heic';
  }
  return 'unknown';
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
    if (readU16(entry) === 0x0112) return readU16(entry + 8);
  }
  return null;
}

function readExifOrientationFromBuffer(buffer) {
  const exifMarker = Buffer.from('Exif\0\0');
  for (let i = 0; i <= buffer.length - exifMarker.length; i += 1) {
    if (buffer[i] === 0x45 && buffer.slice(i, i + exifMarker.length).equals(exifMarker)) {
      const orientation = parseTiffExifOrientation(buffer, i + exifMarker.length);
      if (orientation) return orientation;
    }
  }
  return null;
}

function jpegDimensions(buf) {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xFF) { offset += 1; continue; }
    const marker = buf[offset + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

(async () => {
  const tmp = os.tmpdir();
  const candidates = [];
  for (const dir of fs.readdirSync(tmp)) {
    if (!/^oversight-(import|dedupe|copy-diag|raw)/.test(dir)) continue;
    const full = path.join(tmp, dir);
    try {
      for (const f of fs.readdirSync(full)) {
        if (/\.(jpe?g|heic)$/i.test(f)) candidates.push(path.join(full, f));
      }
    } catch { /* not a dir */ }
  }
  // Also the app's own import temp
  const appImport = path.join(tmp, 'oversight-phone-import');
  try {
    for (const sub of fs.readdirSync(appImport)) {
      const full = path.join(appImport, sub);
      try {
        for (const f of fs.readdirSync(full)) {
          if (/\.(jpe?g|heic)$/i.test(f)) candidates.push(path.join(full, f));
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  console.log('Found', candidates.length, 'leftover phone files\n');
  const heicConvert = require('heic-convert');

  for (const file of candidates.slice(0, 12)) {
    const buf = fs.readFileSync(file);
    const format = sniffImageFormat(buf);
    const orientation = readExifOrientationFromBuffer(buf);
    let line = `${path.basename(path.dirname(file))}\\${path.basename(file)}  fmt=${format} exifOrient=${orientation}`;

    if (format === 'jpeg') {
      const dims = jpegDimensions(buf);
      if (dims) line += ` dims=${dims.w}x${dims.h} (${dims.w >= dims.h ? 'landscape-stored' : 'portrait-stored'})`;
    }

    if (format === 'heic') {
      try {
        const out = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.5 });
        const jpeg = Buffer.isBuffer(out) ? out : Buffer.from(out);
        const dims = jpegDimensions(jpeg);
        const outOrient = readExifOrientationFromBuffer(jpeg);
        if (dims) {
          line += ` | converted dims=${dims.w}x${dims.h} (${dims.w >= dims.h ? 'LANDSCAPE' : 'PORTRAIT'}) convertedExif=${outOrient}`;
          if (orientation && orientation !== 1) {
            const decoderApplied = (orientation === 6 || orientation === 8) ? dims.w < dims.h : true;
            line += decoderApplied
              ? '  => libheif ALREADY ROTATED — manual rotation would DOUBLE-ROTATE'
              : '  => raw/unrotated output — manual rotation is correct';
          }
        }
      } catch (e) {
        line += ` | heic-convert failed: ${e.message}`;
      }
    }
    console.log(line);
  }
})();
