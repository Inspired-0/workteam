#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workteam-staged-'));
const checker = path.join(__dirname, 'check-staged.js');
const installer = path.join(__dirname, 'install-git-hook.js');
const secret = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const run = (bin, args, env = {}) => spawnSync(bin, args, { cwd: temp, encoding: 'utf8', env: { ...process.env, WORKTEAM_SKIP: '', ...env } });
const git = args => { const r = run('git', args); assert.strictEqual(r.status, 0, r.stderr); return r.stdout; };
const write = (name, text) => fs.writeFileSync(path.join(temp, name), text);
const check = () => run(process.execPath, [checker]);
const install = () => { const r = run(process.execPath, [installer]); assert.strictEqual(r.status, 0, r.stderr); };
try {
  git(['init', '-q']); git(['config', 'core.hooksPath', '.git/hooks']);
  git(['config', 'user.email', 'test@example.invalid']); git(['config', 'user.name', 'test']);
  write('config.txt', 'safe baseline\n'); write('other.txt', 'before\n');
  git(['add', '.']); git(['commit', '-qm', 'baseline']);
  const hook = path.join(temp, '.git/hooks/pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\n# BEGIN workteam staged check\necho legacy\n# END workteam staged check\nprintf existing > .git/existing-ran\n', { mode: 0o755 });
  install(); const once = fs.readFileSync(hook, 'utf8'); assert(!once.includes('echo legacy'), 'local legacy block migrated'); install();
  assert.strictEqual(fs.readFileSync(hook, 'utf8'), once, 'installation must be idempotent');
  write('config.txt', secret); git(['add', 'config.txt']); write('config.txt', 'safe working file');
  let r = check(); assert.strictEqual(r.status, 1); assert.ok(!r.stderr.includes(secret), 'secret leaked');
  r = run('git', ['commit', '-qm', 'reject staged secret']); assert.notStrictEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(temp, '.git/existing-ran')), 'old hook must not run after rejection');
  // Staged-safe/working-secret: plain commit is safe, while -a must be rejected.
  git(['add', 'config.txt']); write('config.txt', secret);
  assert.strictEqual(check().status, 0);
  r = run('git', ['commit', '-a', '-qm', 'reject temporary index']); assert.notStrictEqual(r.status, 0);
  // A partial commit excludes a secret staged in an unrelated file.
  git(['add', 'config.txt']); write('other.txt', 'after\n');
  git(['commit', '-qm', 'partial safe', '--', 'other.txt']);
  assert.ok(fs.existsSync(path.join(temp, '.git/existing-ran')));
  assert.strictEqual(check().status, 1, 'unrelated secret remains staged');
  write('config.txt', 'safe\n'); git(['add', 'config.txt']);
  fs.mkdirSync(path.join(temp, '.workteam')); write('.workteam/note', 'scratch'); git(['add', '.workteam/note']);
  assert.strictEqual(check().status, 1);
  r = run(process.execPath, [checker], { WORKTEAM_SKIP: 'workteam-ignored' }); assert.strictEqual(r.status, 0);
  git(['rm', '--cached', '.workteam/note']); assert.strictEqual(check().status, 0);
  // Only added lines count: an unrelated edit next to an already-committed match passes.
  write('fixture.txt', 'k = ' + secret + '\nline2\n'); git(['add', 'fixture.txt']);
  r = run('git', ['commit', '-qm', 'fixture'], { WORKTEAM_SKIP: 'secret-scan' }); assert.strictEqual(r.status, 0, r.stderr);
  write('fixture.txt', 'k = ' + secret + '\nline2 edited\n'); git(['add', 'fixture.txt']);
  assert.strictEqual(check().status, 0, 'existing match on an untouched line must not block');
  write('fixture.txt', 'k = ' + secret + '\nline2 edited\nn = ' + secret + '\n'); git(['add', 'fixture.txt']);
  r = check(); assert.strictEqual(r.status, 1); assert.ok(r.stderr.includes('fixture.txt:3'), r.stderr);
  git(['reset', '-q', '--hard']);
  // A staged submodule pointer bump is skipped, not an error.
  const sub = fs.mkdtempSync(path.join(os.tmpdir(), 'workteam-sub-'));
  const inSub = args => { const x = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd: sub, encoding: 'utf8' }); assert.strictEqual(x.status, 0, x.stderr); };
  inSub(['init', '-q']); inSub(['commit', '-q', '--allow-empty', '-m', 'one']);
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'vendor']); git(['commit', '-qm', 'add submodule']);
  const nested = path.join(temp, 'vendor');
  spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'two'], { cwd: nested });
  git(['add', 'vendor']); assert.ok(git(['diff', '--cached', '--raw']).includes('160000'));
  assert.strictEqual(check().status, 0, 'gitlink bump must pass');
  git(['reset', '-q']); fs.rmSync(sub, { recursive: true, force: true });
  // Respect custom hook directories and preserve unsupported hook languages.
  git(['config', 'core.hooksPath', 'custom-hooks']); install();
  assert.ok(fs.existsSync(path.join(temp, 'custom-hooks/pre-commit')));
  const custom = path.join(temp, 'custom-hooks/pre-commit');
  fs.writeFileSync(custom, '#!/usr/bin/env python3\nprint("existing")\n');
  r = run(process.execPath, [installer]); assert.notStrictEqual(r.status, 0);
  assert.strictEqual(fs.readFileSync(custom, 'utf8'), '#!/usr/bin/env python3\nprint("existing")\n');
  // Missing script or node warns and lets the commit proceed; findings above still block.
  fs.writeFileSync(custom, '#!/bin/sh\n'); install();
  const stale = fs.readFileSync(custom, 'utf8').replace(/check-staged\.js/g, 'gone-staged.js');
  assert.ok(stale.includes('gone-staged.js'));
  const fresh = fs.readFileSync(custom, 'utf8');
  const gitOnly = path.join(temp, 'git-only'); fs.mkdirSync(gitOnly);
  const gitBinary = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(gitBinary, path.join(gitOnly, 'git'));
  for (const [text, env, message] of [[stale, {}, 'workteam staged check not found at'], [fresh, { PATH: gitOnly }, 'node is not on PATH']]) {
    fs.writeFileSync(custom, text);
    r = spawnSync('/bin/sh', [custom], { cwd: temp, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.strictEqual(r.status, 0, r.stderr); assert.ok(r.stderr.includes(message), r.stderr);
  }
  console.log('staged check: actual commits, partial staging, -a, partial commits, scratch, bypass, hook composition and installation passed');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
