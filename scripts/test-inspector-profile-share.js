#!/usr/bin/env node
/**
 * Ad-hoc check for inspector profile QR payload + QR encoding.
 * Mirrors the contract in ios/INSPECTOR_PROFILE_TRANSFER.md.
 */
'use strict';

const assert = require('assert');
const QRCode = require('qrcode');

const TYPE = 'oversight.inspectorProfile';
const VERSION = 1;
const MAX_BYTES = 2953;

function buildPayload(profile, signatureBase64 = '') {
  const name = String(profile.name || '').trim();
  if (!name) throw new Error('name required');
  const payload = {
    v: VERSION,
    type: TYPE,
    name,
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
  const json = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(json, 'utf8');
  return { payload, json, byteLength };
}

async function main() {
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const { payload, json, byteLength } = buildPayload(
    {
      name: 'Jordan Lee',
      initials: 'JL',
      company: 'Acme Environmental',
      phone: '(555) 123-4567',
      email: 'jordan@acme.example',
      certificationNumber: 'AI-12345',
      license: 'NJ DEP Licensed',
    },
    tinyPng
  );

  assert.strictEqual(payload.type, TYPE);
  assert.strictEqual(payload.v, VERSION);
  assert.ok(payload.signatureBase64.length > 0);
  assert.ok(byteLength <= MAX_BYTES, `payload ${byteLength} exceeds ${MAX_BYTES}`);

  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.name, 'Jordan Lee');
  assert.strictEqual(parsed.certificationNumber, 'AI-12345');

  const dataUrl = await QRCode.toDataURL(json, {
    errorCorrectionLevel: 'L',
    width: 280,
    margin: 2,
  });
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));

  // Oversized signature must be detectable before encode
  const huge = 'A'.repeat(4000);
  const oversized = buildPayload({ name: 'Too Big' }, huge);
  assert.ok(oversized.byteLength > MAX_BYTES);

  console.log('ok — inspector profile share payload + QR encode');
  console.log(`  sample payload: ${byteLength} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
