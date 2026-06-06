#!/usr/bin/env node
/**
 * Verify dist/latest.yml sha512 + size match the installer in the same folder.
 * Run immediately after build:win — upload only if this passes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const latestYmlPath = path.join(distDir, 'latest.yml');

function fail(message) {
  console.error(`\nRelease verify FAILED: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(latestYmlPath)) {
  fail(`Missing ${latestYmlPath}. Run npm run build:win first.`);
}

const yml = fs.readFileSync(latestYmlPath, 'utf8');
const pathMatch = yml.match(/^path:\s*(.+)$/m);
const shaMatch = yml.match(/^sha512:\s*(.+)$/m);
const sizeMatch = yml.match(/^size:\s*(\d+)/m);
const fileShaMatch = yml.match(/^\s+sha512:\s*(.+)$/m);

if (!pathMatch || !shaMatch || !sizeMatch) {
  fail('latest.yml is missing path, sha512, or size fields.');
}

const installerName = pathMatch[1].trim();
const expectedSha512 = shaMatch[1].trim();
const expectedSize = Number(sizeMatch[1]);
const filesSha512 = fileShaMatch ? fileShaMatch[1].trim() : null;
const installerPath = path.join(distDir, installerName);

if (!fs.existsSync(installerPath)) {
  fail(`Installer not found: ${installerPath}`);
}

const buffer = fs.readFileSync(installerPath);
const actualSha512 = crypto.createHash('sha512').update(buffer).digest('base64');
const actualSize = buffer.length;

const mismatches = [];
if (actualSha512 !== expectedSha512) {
  mismatches.push(`top-level sha512 mismatch\n  expected: ${expectedSha512}\n  actual:   ${actualSha512}`);
}
if (filesSha512 && filesSha512 !== actualSha512) {
  mismatches.push(`files[].sha512 mismatch\n  expected: ${filesSha512}\n  actual:   ${actualSha512}`);
}
if (actualSize !== expectedSize) {
  mismatches.push(`size mismatch\n  expected: ${expectedSize}\n  actual:   ${actualSize}`);
}

if (mismatches.length > 0) {
  console.error('latest.yml does not match the installer in dist/.');
  mismatches.forEach((m) => console.error(`\n${m}`));
  console.error('\nDo not upload these files. Re-run a single clean build:\n  npm run build:win\n');
  process.exit(1);
}

console.log('Release verify OK');
console.log(`  ${installerName}`);
console.log(`  size: ${actualSize}`);
console.log(`  sha512: ${actualSha512}`);
console.log('\nUpload BOTH of these together from dist/:');
console.log(`  - ${installerName}`);
console.log('  - latest.yml');
