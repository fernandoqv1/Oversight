#!/usr/bin/env node
/**
 * Ad-hoc check for inspector profile multipart QR packing.
 * Mirrors ios/INSPECTOR_PROFILE_TRANSFER.md (v2).
 */
'use strict';

const assert = require('assert');
const QRCode = require('qrcode');

const PROFILE_TYPE = 'oversight.inspectorProfile';
const PART_TYPE = 'oversight.inspectorProfilePart';
const VERSION = 2;
const MAX_BYTES = 2953;
const CHUNK_BYTES = 2200;

function chunkUtf8String(str, maxBytes) {
  const bytes = Buffer.from(str, 'utf8');
  if (bytes.length <= maxBytes) return [str];
  const chunks = [];
  let offset = 0;
  while (offset < bytes.length) {
    let end = Math.min(offset + maxBytes, bytes.length);
    if (end < bytes.length) {
      while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
      if (end === offset) end = Math.min(offset + maxBytes, bytes.length);
    }
    chunks.push(bytes.subarray(offset, end).toString('utf8'));
    offset = end;
  }
  return chunks;
}

function buildParts(profile, signatureBase64 = '') {
  const payload = {
    v: VERSION,
    type: PROFILE_TYPE,
    name: String(profile.name || '').trim(),
    initials: String(profile.initials || '').trim().slice(0, 4),
    company: String(profile.company || '').trim(),
    phone: String(profile.phone || '').trim(),
    email: String(profile.email || '').trim(),
    certificationNumber: String(profile.certificationNumber || '').trim(),
    license: String(profile.license || '').trim(),
    signatureMime: 'image/png',
    signatureBase64: signatureBase64 || '',
    exportedAt: new Date().toISOString(),
  };
  if (!payload.name) throw new Error('name required');
  const profileJson = JSON.stringify(payload);
  const transferId = 'testhash';
  const chunks = chunkUtf8String(profileJson, CHUNK_BYTES);
  const parts = chunks.map((c, i) => JSON.stringify({
    v: VERSION,
    type: PART_TYPE,
    id: transferId,
    i,
    n: chunks.length,
    c,
  }));
  return { payload, profileJson, parts };
}

async function main() {
  // ~3KB of signature-like base64 so multipart is forced
  const bigSig = Buffer.alloc(2400, 1).toString('base64');
  const { payload, profileJson, parts } = buildParts(
    {
      name: 'Jordan Lee',
      initials: 'JL',
      company: 'Acme Environmental',
      phone: '(555) 123-4567',
      email: 'jordan@acme.example',
      certificationNumber: 'AI-12345',
      license: 'NJ DEP Licensed',
    },
    bigSig
  );

  assert.strictEqual(payload.type, PROFILE_TYPE);
  assert.strictEqual(payload.v, VERSION);
  assert.ok(parts.length >= 2, 'expected multiple QR parts for large signature');

  const rebuilt = parts
    .map((p) => JSON.parse(p))
    .sort((a, b) => a.i - b.i)
    .map((p) => p.c)
    .join('');
  assert.strictEqual(rebuilt, profileJson);
  const parsed = JSON.parse(rebuilt);
  assert.strictEqual(parsed.signatureBase64, bigSig);

  for (const part of parts) {
    const byteLength = Buffer.byteLength(part, 'utf8');
    assert.ok(byteLength <= MAX_BYTES, `part ${byteLength} exceeds ${MAX_BYTES}`);
    const dataUrl = await QRCode.toDataURL(part, {
      errorCorrectionLevel: 'L',
      width: 720,
      margin: 4,
    });
    assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  }

  console.log('ok — multipart inspector profile share');
  console.log(`  profile bytes: ${Buffer.byteLength(profileJson, 'utf8')}`);
  console.log(`  QR parts: ${parts.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
