#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

/** Task status of an implementation plan, kept as JSON next to it and changed only here.
 * docs/plans/active/<feature>.tasks.json = { "tasks": [{ "id", "title", "verify", "status" }] };
 * `verify` is the command whose exit 0 means the task is done. A status counts as passing only
 * with the exit code, revision and command this script recorded, so a hand-edited "passing" — or
 * a pass recorded for a verify command that has since changed — shows as unverified.
 * Usage: plan-status.js FILE [verify ID|all] [--timeout SECONDS]
 */
const STATUSES = ['pending', 'passing', 'failing'];
function load(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(doc.tasks) || !doc.tasks.length) throw Error('tasks must be a non-empty array');
  const ids = new Set();
  for (const t of doc.tasks) {
    for (const k of ['id', 'title', 'verify']) if (typeof t[k] !== 'string' || !t[k].trim()) throw Error(`task ${t.id || '?'}: ${k} must be a non-empty string`);
    if (!STATUSES.includes(t.status)) throw Error(`task ${t.id}: status must be ${STATUSES.join(' | ')}`);
    if (ids.has(t.id)) throw Error(`duplicate task id ${t.id}`); ids.add(t.id);
  }
  return doc;
}
const verified = (t) => t.status === 'passing' && t.exit === 0 && typeof t.revision === 'string' && t.verified_command === t.verify;

/** One line for SessionStart and the lead: count, unverified claims, the next task to work on. */
function summary(doc) {
  const done = doc.tasks.filter(verified).length;
  const claimed = doc.tasks.filter((t) => t.status === 'passing' && !verified(t)).length;
  const next = doc.tasks.find((t) => !verified(t));
  return `${done}/${doc.tasks.length} tasks passing` + (claimed ? `; ${claimed} marked passing without a recorded run` : '') +
    (next ? `; next ${next.id}: ${next.title} (verify: \`${next.verify}\`)` : '; all verified');
}

function revision(cwd) {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // The plan and its task file change with every run; only product changes make a revision dirty.
    const dirty = execFileSync('git', ['status', '--porcelain', '--', ':(top,exclude)docs/plans', ':(top,exclude).workteam'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return dirty ? `${head}+dirty` : head;
  } catch { return 'no-git'; }
}

function verify(file, doc, id, timeout) {
  let root;
  try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: path.dirname(file), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { root = path.resolve(path.dirname(file), '..', '..', '..'); } // docs/plans/active/ → repo root
  const tasks = id === 'all' ? doc.tasks : doc.tasks.filter((t) => t.id === id);
  if (!tasks.length) throw Error(`no task ${id}`);
  let failed = 0;
  const results = {};
  for (const t of tasks) {
    const run = spawnSync('sh', ['-c', t.verify], { cwd: root, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 64 * 1024 * 1024 });
    const exit = run.status === null ? -1 : run.status;
    const r = results[t.id] = { status: exit === 0 ? 'passing' : 'failing', exit, checked_at: new Date().toISOString(), verified_command: t.verify, revision: revision(root) };
    if (exit !== 0) failed++;
    const tail = `${run.stdout || ''}${run.stderr || ''}`.trimEnd().split('\n').slice(-15).join('\n');
    console.log(`${t.id} ${r.status} (exit ${exit}${run.error ? `, ${run.error.code}` : ''}) at ${r.revision}: ${t.verify}\n${tail}\n`);
  }
  save(file, results);
  return failed;
}

/** Apply results to the file as it is NOW, under a lock, replaced atomically: a verification that
 * ran in parallel keeps its own result instead of being overwritten by a stale copy. */
function save(file, results) {
  const lock = file + '.lock', deadline = Date.now() + 30000;
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (err) {
      if (err.code !== 'EEXIST' || Date.now() > deadline) throw Error(`cannot lock ${lock}; remove it if no plan-status run is active`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const doc = load(file);
    for (const t of doc.tasks) if (results[t.id]) Object.assign(t, results[t.id]);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } finally { fs.rmSync(lock, { force: true }); }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const t = args.indexOf('--timeout'), timeout = t < 0 ? 600 : Number(args.splice(t, 2)[1]);
    const [file, cmd, id] = args;
    if (!file || (cmd && (cmd !== 'verify' || !id)) || !(timeout > 0)) throw Error('usage: plan-status.js FILE [verify ID|all] [--timeout SECONDS]');
    const failed = cmd ? verify(path.resolve(file), load(file), id, timeout) : 0;
    console.log(summary(load(file)));
    if (failed) process.exitCode = 1;
  } catch (err) { console.error('plan-status: ' + err.message); process.exitCode = 2; }
}
module.exports = { load, summary };
