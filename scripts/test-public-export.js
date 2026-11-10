#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { exportPublic } = require('./export-public');
const { checkPublic } = require('./check-public');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workteam-export-test-'));
try {
  const clean = path.join(temp, 'clean');
  exportPublic(clean, 'example/workteam');
  assert(!fs.existsSync(path.join(clean, '.git')), 'export has no Git history');
  assert(!fs.existsSync(path.join(clean, 'docs/CURRENT_STATE.md')), 'no development state');
  assert(!fs.existsSync(path.join(clean, 'evals-real')), 'no real cases');
  assert.throws(() => exportPublic(clean, 'example/workteam'), /destination must not exist/);
  assert.throws(() => checkPublic(clean, ['workflow']), /private identity pattern/);
  const extra = path.join(clean, 'private-note.txt'); fs.writeFileSync(extra, 'private');
  assert.throws(() => checkPublic(clean), /file list mismatch/); fs.unlinkSync(extra);

  // Unlisted source files never enter an export, including hidden local credentials.
  fs.writeFileSync(path.join(clean, '.env'), 'DO_NOT_EXPORT=sentinel\n');
  const run = output => spawnSync(process.execPath, [path.join(clean, 'scripts/export-public.js'), output, '--repository', 'example/workteam'], { encoding: 'utf8' });
  const second = path.join(temp, 'second');
  assert.strictEqual(run(second).status, 0);
  assert(!fs.existsSync(path.join(second, '.env')));

  // A reviewed path replaced with a link must fail closed, including links to sibling files.
  fs.unlinkSync(path.join(clean, 'README.md'));
  fs.symlinkSync('.env', path.join(clean, 'README.md'));
  const rejected = path.join(temp, 'rejected');
  assert.notStrictEqual(run(rejected).status, 0);
  assert(!fs.existsSync(rejected));
  fs.unlinkSync(path.join(clean, 'README.md'));
  fs.copyFileSync(path.join(second, 'README.md'), path.join(clean, 'README.md'));

  const outside = path.join(temp, 'overlay'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'README.md'), 'EXTERNAL_PRIVATE_SENTINEL');
  fs.mkdirSync(path.join(clean, 'distribution'));
  fs.symlinkSync(outside, path.join(clean, 'distribution/public'));
  assert.notStrictEqual(run(rejected).status, 0, 'overlay ancestry must not be a link');
  assert(!fs.existsSync(rejected));
  fs.unlinkSync(path.join(clean, 'distribution/public'));
  fs.rmdirSync(path.join(clean, 'distribution'));
  fs.symlinkSync(temp, path.join(clean, 'distribution'));
  fs.renameSync(outside, path.join(temp, 'public'));
  assert.notStrictEqual(run(rejected).status, 0, 'distribution ancestry must not be a link');
  fs.unlinkSync(path.join(clean, 'distribution'));

  const icon = path.join(second, 'assets/icon.png'), bytes = fs.readFileSync(icon);
  fs.writeFileSync(icon, bytes.subarray(0, 8));
  assert.throws(() => checkPublic(second), /unreviewed PNG/);
  fs.writeFileSync(icon, Buffer.concat([bytes, Buffer.from('private trailing payload')]));
  assert.throws(() => checkPublic(second), /unreviewed PNG/);
  fs.writeFileSync(icon, bytes);

  const list = JSON.parse(fs.readFileSync(path.join(clean, '.public-files.json'), 'utf8'));
  list.push('../outside.txt');
  fs.writeFileSync(path.join(clean, '.public-files.json'), JSON.stringify(list));
  assert.notStrictEqual(run(rejected).status, 0, 'path traversal rejected');
  assert(!fs.existsSync(rejected));
  console.log('public export: exact paths, no history/private files, identity checks, no overwrites, symlinks or traversal');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
