'use strict';
const fs = require('fs');
const path = require('path');
const guard = require('./git-guard');

const patterns = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ['sk-token', /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['stripe-live-key', /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['generic-assignment', /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["']([A-Za-z0-9\/+_=-]{16,})["']/i],
];
function secretName(file) {
  const base = path.basename(file);
  if (/^\.env\./.test(base)) return !/^\.env\.(example|sample|template)$/.test(base);
  return base === '.env' || /\.(pem|key|p12|pfx|keystore)$/.test(base) || /^id_(rsa|ed25519|ecdsa)$/.test(base);
}

/** First pattern hit on one line; never returns matched bytes. */
function scanRow(file, line, row) {
  for (const [name, re] of patterns) {
    const match = re.exec(row);
    if (!match) continue;
    if (name === 'generic-assignment' && /^(example|placeholder|changeme|your[-_]|x+$)/i.test(match[2])) continue;
    return `${file}:${line} matches ${name}`;
  }
  return null;
}

/** Return first named finding for a whole file; never return matched secret bytes. */
function inspect(file, text) {
  if (secretName(file)) return `${file} matches secret-file-name`;
  if (text.includes('\0')) return null; // binary content is outside this pattern scanner
  let line = 0;
  for (const row of text.split('\n')) { line++; const f = scanRow(file, line, row); if (f) return f; }
  return null;
}
const list = (args, cwd) => guard.git(args, cwd).stdout.split('\0').filter(Boolean);
const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-color', '--submodule=short', '-M', '--src-prefix=a/', '--dst-prefix=b/'];

/** Added lines of the staged diff (what the commit introduces), in one Git call, plus the
 * secret-file-name check. Existing matches on untouched lines never block an unrelated edit.
 * Gitlink pointer bumps are skipped. GIT_INDEX_FILE is honoured, so -a/path commits work.
 */
function stagedSecrets(cwd) {
  const root = guard.rootOf(cwd);
  const flags = ['--cached', '-U0', '--diff-filter=ACMR', ...diffFlags];
  for (const file of list(['diff', '--name-only', '-z', ...flags], root)) if (secretName(file)) return `${file} matches secret-file-name`;
  let file = null, line = 0, inHunk = false;
  for (const row of guard.git(['diff', ...flags], root).stdout.split('\n')) {
    if (row.startsWith('diff --git ')) { inHunk = false; file = null; continue; }
    if (!inHunk) {
      if (row.startsWith('+++ ')) { file = row.slice(4).replace(/\t$/, ''); file = file === '/dev/null' ? null : file.replace(/^b\//, ''); }
      else { const h = /^@@ -\S+ \+(\d+)/.exec(row); if (h) { inHunk = true; line = +h[1]; } }
      continue;
    }
    const h = /^@@ -\S+ \+(\d+)/.exec(row);
    if (h) { line = +h[1]; continue; }
    if (!row.startsWith('+')) continue;
    const text = row.slice(1);
    if (file && !/^Subproject commit [0-9a-f]+$/.test(text)) { const f = scanRow(file, line, text); if (f) return f; }
    line++;
  }
  return null;
}

/** Names are checked in the actual index; deleting tracked scratch is allowed. */
function stagedScratch(cwd) {
  const root = guard.rootOf(cwd);
  return list(['ls-files', '-z', '--', '.workteam'], root).length ? '.workteam/ is tracked in the index' : null;
}

/** Early guard for scratch that a future add could sweep up. Target tree only. */
function exposedScratch(cwd) {
  const root = guard.rootOf(cwd);
  return stagedScratch(root) || (guard.git(['status', '--porcelain', '-uall', '--', '.workteam'], root).stdout.trim()
    ? '.workteam/ is not ignored' : null);
}

/** Scan changed tracked files (and untracked ones when asked) under the given paths. This predicts
 * existing files only; commands creating content require the real Git hook.
 */
function pendingSecrets(scope) {
  const { cwd, paths, untracked } = scope;
  const names = new Set(list(['diff', '--relative', '--name-only', '-z', '--no-ext-diff', '--no-textconv', '--diff-filter=ACMR', '--', ...paths], cwd));
  if (untracked) for (const file of list(['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths], cwd)) names.add(file);
  for (const file of names) {
    const target = path.join(cwd, file), st = fs.lstatSync(target);
    if (st.isDirectory()) continue; // submodule worktree: the commit carries a pointer only
    if (!st.isFile() && !st.isSymbolicLink()) throw Error('unscannable pending file');
    // Git stores symlink text; never follow a link to a secret or FIFO. lean: content of a
    // file over 1 MiB is not pattern-scanned (the name check still runs); raise if needed.
    const content = st.isSymbolicLink() ? fs.readlinkSync(target) : st.size > 1024 * 1024 ? '' : fs.readFileSync(target, 'utf8');
    const finding = inspect(file, content);
    if (finding) return finding;
  }
  return null;
}
/** The early check's superset of what the commit may carry: the staged index, the files the
 * command names, tracked changes for -a, untracked files for `git add -A`. Scanning more than the
 * commit takes can block a commit over a secret staged for a later one; the deny names the file.
 */
function earlySecrets(target) {
  return stagedSecrets(target.root)
    || (target.paths.length ? pendingSecrets({ cwd: target.cwd, paths: target.paths, untracked: true }) : null)
    || (target.all ? pendingSecrets({ cwd: target.root, paths: [], untracked: false }) : null)
    || (target.untracked ? pendingSecrets({ cwd: target.root, paths: [], untracked: true }) : null);
}
module.exports = { stagedSecrets, stagedScratch, exposedScratch, earlySecrets };
