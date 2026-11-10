#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { check, render, schema } = require('./findings');

/** Blind audit as a separate process in a sterile copy of the repository: tracked and untracked
 * files without git history, plans, journals, state, the package's own exclusions or project
 * instructions, with the three inputs in a directory beside it — a search of the whole copy finds
 * nothing of the process, and no AGENTS.md or CLAUDE.md loads. Claude: `claude -p` with the auditor's instructions, Read/Grep/Glob only, auto memory
 * off (`--agent` is not used: a role's tool list drops the structured-output channel).
 * Codex: `codex exec --sandbox read-only --ephemeral` with the same instructions.
 * Run the other vendor's model than the one that wrote the change for a cross-vendor audit.
 * Output: <out>/<slug>.findings.json (schemas/findings.schema.json) and <slug>.audit.md.
 * Usage: audit-run.js [--package P] --contract C --evidence E [--host claude|codex] [--out DIR] [--model MODEL] [--effort EFFORT]; without
 * --package it builds the default one, HEAD to the working tree, as `audit-package` does.
 */
const root = path.resolve(__dirname, '..');
function parseArgs(argv) {
  const a = { host: 'claude' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = { '--package': 'package', '--contract': 'contract', '--evidence': 'evidence', '--host': 'host', '--out': 'out', '--model': 'model', '--effort': 'effort' }[argv[i]];
    if (!key || argv[i + 1] === undefined) throw Error('usage: audit-run.js [--package P] --contract C --evidence E [--host claude|codex] [--out DIR] [--model MODEL] [--effort EFFORT]');
    a[key] = argv[i + 1];
  }
  for (const k of ['contract', 'evidence', 'package']) {
    if (k === 'package' && !a.package) { a.package = buildPackage(); continue; }
    if (!a[k] || !fs.statSync(path.resolve(a[k])).isFile()) throw Error(`--${k}: no such file`);
    a[k] = path.resolve(a[k]);
  }
  if (!['claude', 'codex'].includes(a.host)) throw Error('--host is claude or codex');
  if (a.effort && a.host !== 'codex') throw Error('--effort is supported only for Codex');
  if (a.effort && !/^[a-z][a-z0-9_-]*$/.test(a.effort)) throw Error('unsupported effort value');
  a.out = path.resolve(a.out || path.dirname(a.package));
  return a;
}

/** Without --package: the package `audit-package` builds by default, HEAD to the working tree. */
function buildPackage() {
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const out = path.join(repo, '.workteam', 'audit', head.slice(0, 7) + '..worktree.change.md');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'lib', 'change-package.js'), head, out], { cwd: repo, stdio: 'inherit' });
  return out;
}

/** Paths a blind auditor never sees; CLAUDE.md and AGENTS.md anywhere would load as instructions. */
const closed = /^(\.git\/|\.workteam\/|\.claude\/|\.codex\/|docs\/plans\/|docs\/CURRENT_STATE\.md$|docs\/INDEX\.md$)|(^|\/)(AGENTS|CLAUDE|CLAUDE\.local)\.md$/;
/** The «Excluded process paths» the package was built with (custom --exclude paths included). */
function packageExclusions(pkg) {
  const section = (/^## Excluded process paths\n([\s\S]*?)\n\n/m.exec(fs.readFileSync(pkg, 'utf8')) || [])[1] || '';
  return section.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
}
/** <tmp>/repo: tracked and untracked files minus process paths; <tmp>/inputs: the three inputs. */
function sterileCopy(repo, inputs) {
  const dest = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-audit-'));
  const extra = packageExclusions(inputs.package);
  const skip = (f) => closed.test(f) || extra.some((p) => f === p || f.startsWith(p + '/'));
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0');
  for (const f of files.filter((f) => f && !skip(f))) {
    const src = path.join(repo, f), to = path.join(dest, 'repo', f);
    if (!fs.existsSync(src) || !fs.lstatSync(src).isFile()) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
  }
  fs.mkdirSync(path.join(dest, 'repo'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'inputs'));
  const copied = {};
  for (const [k, file] of Object.entries(inputs)) { copied[k] = path.join(dest, 'inputs', k + '.md'); fs.copyFileSync(file, copied[k]); }
  return { dest, repo: path.join(dest, 'repo'), copied };
}

function run(a) {
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const copy = sterileCopy(repo, { package: a.package, contract: a.contract, evidence: a.evidence });
  try { audit(a, copy.repo, copy.copied, copy.dest); } finally { fs.rmSync(copy.dest, { recursive: true, force: true }); }
}

function audit(a, repo, inputs, scratch) {
  const task = `Blind audit. Read exactly these inputs: the change package ${inputs.package}, the contract ${inputs.contract}, ` +
    `the evidence ${inputs.evidence}. Repository root: ${repo} (a copy without git history). Product source may be read for a named risk. ` +
    'Write no files: return the findings as the JSON object the output schema describes (reviewer "auditor", subject = the package path).';
  const body = fs.readFileSync(path.join(root, 'agents', 'auditor.md'), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  const opts = { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, WORKTEAM_AUDITOR: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } };
  fs.mkdirSync(a.out, { recursive: true });
  let res, raw;
  if (a.host === 'claude') {
    const system = path.join(scratch, 'auditor-instructions.md');
    fs.writeFileSync(system, body);
    res = spawnSync('claude', ['-p', '--plugin-dir', root, '--add-dir', path.dirname(inputs.package), '--append-system-prompt-file', system, '--tools', 'Read,Grep,Glob',
      ...(a.model ? ['--model', a.model] : []), '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--no-session-persistence', task], opts);
    if (res.status === 0) raw = JSON.parse(res.stdout).structured_output;
  } else {
    const last = path.join(scratch, 'codex-last-message.json'); // per run: parallel audits never share it
    res = spawnSync('codex', ['exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '-C', repo,
      ...(a.model ? ['-m', a.model] : []), ...(a.effort ? ['-c', `model_reasoning_effort=${JSON.stringify(a.effort)}`] : []), '--output-schema', path.join(root, 'schemas', 'findings.schema.json'),
      '-o', last, `${body}\n\n---\n\n${task}`], opts);
    if (res.status === 0) raw = JSON.parse(fs.readFileSync(last, 'utf8'));
  }
  if (!raw) throw Error(`${a.host} audit did not return findings (exit ${res.status}): ${(res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' ')}`);
  check(raw, schema, 'findings');
  raw.subject = a.package; // the copy the auditor read is gone; name the package the lead has
  const slug = path.basename(a.package).replace(/(\.change)?\.md$/, '');
  fs.writeFileSync(path.join(a.out, `${slug}.findings.json`), JSON.stringify(raw, null, 2) + '\n');
  fs.writeFileSync(path.join(a.out, `${slug}.audit.md`), render(raw, 80));
  console.log(`audit-run: ${raw.findings.length} finding(s) → ${path.join(a.out, `${slug}.audit.md`)}`);
}

if (require.main === module) {
  try { run(parseArgs(process.argv.slice(2))); } catch (err) { console.error('audit-run: ' + err.message); process.exitCode = 1; }
}
module.exports = { parseArgs, sterileCopy };
