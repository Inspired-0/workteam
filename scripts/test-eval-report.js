#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workteam-eval-report-'));
try {
  const caseDir = path.join(dir, 'seeded');
  fs.mkdirSync(caseDir);
  fs.writeFileSync(path.join(caseDir, 'prompt.md'), '---\ntags: [audit, seeded-defect]\n---\nReview it.\n');
  const run = (score, extra = {}) => ({ score, costUsd: 0.1, error: null, graders: [], ...extra });
  const result = (cases, claudeVersion = 'test') => ({ schemaVersion: 1, claudeVersion, costUsd: 1, partial: false, suite: { plugins: [{ name: 'workteam', version: '9.9.9' }] }, cases });
  const fired = { graders: [{ name: 'auditor-fired', withOnly: true, passed: true }] };
  const one = path.join(dir, 'a', 'aggregate-result.json'), two = path.join(dir, 'b', 'aggregate-result.json');
  for (const f of [one, two]) fs.mkdirSync(path.dirname(f));
  fs.writeFileSync(one, JSON.stringify(result([{ name: 'seeded', dir: caseDir, arms: { with: [run(1, fired)], without: [run(0)] } }])));
  fs.writeFileSync(two, JSON.stringify(result([{ name: 'seeded', dir: caseDir, arms: { with: [run(0, { error: 'timed out after 1200s' })], without: [run(0)] } }])));
  const r = spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one, two], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(/seeded\s+0\.50\s+0\.00\s+\+0\.50\s+2\/2\s+unstable/.test(r.stdout), r.stdout);
  assert.ok(r.stdout.includes('seeded-defect    0.50 / 0.00  +0.50  — defect found'), r.stdout);
  assert.ok(r.stdout.includes('seeded/auditor-fired: 1/1'), 'indicators count graded with-plugin runs only');
  assert.ok(r.stdout.includes('run errors (1):') && r.stdout.includes('timed out'));
  assert.ok(r.stdout.includes('cost with $0.20, without $0.20 (+0%)'));
  const three = path.join(dir, 'c', 'aggregate-result.json'); fs.mkdirSync(path.dirname(three));
  fs.writeFileSync(three, JSON.stringify(result([{ name: 'lonely', dir: caseDir, arms: { with: [], without: [run(1)] } }])));
  const missing = spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), three], { encoding: 'utf8' });
  assert.ok(/lonely\s+—\s+1\.00\s+—\s+0\/1\s+missing arm: no comparison/.test(missing.stdout), missing.stdout);
  assert.ok(missing.stdout.includes('suite: mean Δ   —  '), 'a missing arm never becomes a delta');
  assert.notStrictEqual(spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one, one], { encoding: 'utf8' }).status, 0, 'the same file twice is rejected');
  fs.writeFileSync(three, JSON.stringify(result([{ name: 'seeded', dir: caseDir, arms: { with: [run(1)], without: [run(0)] } }], 'other')));
  const mixed = spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one, three], { encoding: 'utf8' });
  assert.notStrictEqual(mixed.status, 0); assert.ok(mixed.stderr.includes('different setups'), 'different host versions do not merge');
  const edited = result([{ name: 'seeded', dir: caseDir, promptMarkdown: 'changed prompt', arms: { with: [run(1)], without: [run(0)] } }]);
  fs.writeFileSync(three, JSON.stringify(edited));
  const changed = spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one, three], { encoding: 'utf8' });
  assert.ok(changed.stderr.includes('different prompt or graders'), 'an edited case does not merge with its old results');
  const otherModel = { ...result([{ name: 'seeded', dir: caseDir, arms: { with: [run(1)], without: [run(0)] } }]) };
  otherModel.suite = { ...otherModel.suite, model: 'sonnet' };
  fs.writeFileSync(three, JSON.stringify(otherModel));
  assert.ok(spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one, three], { encoding: 'utf8' }).stderr.includes('different setups'), 'a different model does not merge');
  fs.writeFileSync(one, '{"cases":[]}');
  assert.notStrictEqual(spawnSync(process.execPath, [path.join(__dirname, 'eval-report.js'), one], { encoding: 'utf8' }).status, 0, 'a foreign file is rejected');
  console.log('eval report: merge by case, tags, gate indicators, unstable runs, missing arms, duplicate and mixed inputs, errors, cost, foreign files passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
