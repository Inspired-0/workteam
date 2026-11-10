'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** A product file: inside the project, and not docs/, .workteam/, a host folder, *.md or .gitignore. */
function isProduct(cwd, file) {
  const rel = path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/');
  return !/^(\.\.\/|(docs|\.workteam|\.agents|\.claude|\.codex)\/)|\.md$|^\.gitignore$/.test(rel);
}

/** The project is under a workteam contract: the AGENTS.md block, or an eval run that prints it. */
function underContract(cwd) {
  try { if (/<!-- workteam:contract v/.test(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'))) return true; } catch { /* no AGENTS.md */ }
  return process.env.EVAL_WORKTEAM_CONTRACT === '1';
}

/** Where the lead records the session's interview decision for its own edits. */
const sessionFile = (sessionId) => `.workteam/interview/${sessionId || 'session'}.md`;

/** The last «Interview:» decision in a text, or ''. */
const decisionIn = (text) => [...String(text || '').matchAll(/^[\s>*_-]*(?:Interview|Интервью)[*_]*\s*:\s*(.+)$/gim)].map((m) => m[1].trim()).pop() || '';

/**
 * When the session began, in ms: the transcript's birth time, or on a filesystem without one the
 * first timestamp the transcript records. null when there is no transcript.
 */
function sessionStart(file) {
  try {
    const st = fs.statSync(file);
    if (st.birthtimeMs > 0) return st.birthtimeMs;
    const m = /"timestamp":\s*"([^"]+)"/.exec(fs.readFileSync(file, 'utf8').slice(0, 20000));
    return m ? Date.parse(m[1]) : null;
  } catch { return null; }
}

/** Committed: tracked, unchanged against HEAD (staged or not) and not ignored — status prints nothing. */
function committed(cwd, doc) {
  try { return execFileSync('git', ['status', '--porcelain', '--ignored', '--', doc], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) === ''; } catch { return false; }
}

/**
 * Product files the session changed, by any tool: modified or new since the session began, deleted
 * (the nearest surviving folder changed when they went) or committed from the second after its start
 * (git dates are whole seconds; a commit just before the session can share that second), read
 * NUL-separated so that non-ASCII names are not quoted. null when git cannot say.
 */
function sessionChanges(cwd, start) {
  const git = (...args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const status = git('status', '--porcelain', '-z', '--untracked-files=all');
  if (status === null) return null;
  const since = (rel) => { try { return fs.statSync(path.resolve(cwd, rel)).mtimeMs >= start; } catch { return false; } };
  const ancestor = (rel) => { let d = path.dirname(rel); while (d !== '.' && !fs.existsSync(path.resolve(cwd, d))) d = path.dirname(d); return d; };
  const touched = status.split('\0').filter((l) => /^[ MADRCTU?]{2} /.test(l))
    .filter((l) => since(/D/.test(l.slice(0, 2)) ? ancestor(l.slice(3)) : l.slice(3))).map((l) => l.slice(3));
  const committedSince = (git('log', '-z', `--since=@${Math.floor(start / 1000) + 1}`, '--format=', '--name-only') || '').split('\0').map((f) => f.replace(/^\n+/, ''));
  return [...new Set([...touched, ...committedSince])].filter((f) => f && isProduct(cwd, f));
}

module.exports = { isProduct, underContract, sessionFile, decisionIn, sessionStart, committed, sessionChanges };
