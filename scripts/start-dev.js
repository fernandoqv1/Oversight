const path = require('path');
const { spawn } = require('child_process');
const { ensureElectron, getElectronDistEnv } = require('./ensure-electron');

const root = path.join(__dirname, '..');

ensureElectron(root);

Object.assign(process.env, getElectronDistEnv(root));

const electronPath = require(path.join(root, 'node_modules', 'electron'));
const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
