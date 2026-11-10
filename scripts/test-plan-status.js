#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const script = path.join(__dirname, 'plan-status.js');
const repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-plan-'));
const git = (args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
const file = path.join(repo, 'docs', 'plans', 'active', 'feature.tasks.json');
const run = (...args) => spawnSync(process.execPath, [script, file, ...args], { cwd: repo, encoding: 'utf8' });
try {
  git(['init', '-q']); git(['config', 'user.email', 't@example.invalid']); git(['config', 'user.name', 't']);
  git(['commit', '-q', '--allow-empty', '-m', 'init']);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (tasks) => fs.writeFileSync(file, JSON.stringify({ tasks }));
  write([
    { id: 'T1', title: 'passes', verify: 'test -d docs', status: 'pending' },
    { id: 'T2', title: 'fails', verify: 'exit 3', status: 'pending' },
  ]);
  let r = run();
  assert.strictEqual(r.status, 0); assert.ok(r.stdout.includes('0/2 tasks passing; next T1: passes'), r.stdout);
  r = run('verify', 'all');
  assert.strictEqual(r.status, 1, 'a failing check fails the command');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(doc.tasks.map((t) => [t.status, t.exit]), [['passing', 0], ['failing', 3]]);
  assert.ok(/^[0-9a-f]+$/.test(doc.tasks[0].revision), 'the plan file itself does not make the revision dirty');
  assert.ok(r.stdout.includes('1/2 tasks passing; next T2: fails'), r.stdout);
  doc.tasks[0].verify = 'exit 4';
  fs.writeFileSync(file, JSON.stringify(doc));
  assert.ok(run().stdout.includes('0/2 tasks passing; 1 marked passing without a recorded run; next T1: passes'), 'a changed verify command voids the old pass');
  write([{ id: 'T1', title: 'hand-edited', verify: 'true', status: 'passing' }]);
  r = run();
  assert.ok(r.stdout.includes('0/1 tasks passing; 1 marked passing without a recorded run'), r.stdout);
  // Overlap: T1's check itself verifies T2 (which fails) while T1 is running; T1 finishing last
  // must not restore the T2 state it loaded before.
  write([
    { id: 'T1', title: 'outer', verify: `"${process.execPath}" "${script}" "${file}" verify T2; true`, status: 'pending' },
    { id: 'T2', title: 'inner', verify: 'exit 5', status: 'pending' },
  ]);
  run('verify', 'T1');
  const overlap = JSON.parse(fs.readFileSync(file, 'utf8')).tasks.map((t) => [t.id, t.status, t.exit]);
  assert.deepStrictEqual(overlap, [['T1', 'passing', 0], ['T2', 'failing', 5]], 'an overlapping verification keeps its result');
  assert.ok(!fs.existsSync(file + '.lock'), 'the lock is released');
  write([{ id: 'T1', title: 'x', verify: 'true', status: 'done' }]);
  assert.strictEqual(run().status, 2, 'an unknown status is rejected');
  console.log('plan status: summary, recorded runs, failing exit, changed command, hand-edited claims, overlapping runs, validation passed');
} finally { fs.rmSync(repo, { recursive: true, force: true }); }
