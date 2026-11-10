'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const started = Date.now();
// PreToolUse hooks must answer inside the host timeout; the Git-hook entry point lifts it.
const limits = { budget: 16000, call: 4000, buffer: 64 * 1024 * 1024 };
const unbounded = () => { limits.budget = Infinity; limits.call = 300000; limits.buffer = 1024 * 1024 * 1024; };

/** Both host envelopes, with no command evaluation. Unknown envelopes stay silent. */
async function readInput() {
  if (process.stdin.isTTY) return null;
  try {
    let raw = ''; for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw), data = input.tool_input || {};
    const command = data.command ?? data.cmd;
    if (typeof command !== 'string') return null;
    return { command, cwd: data.workdir || input.cwd || process.cwd() };
  } catch { return null; }
}

/** Only leading assignments count; text inside an argument never skips a hook. */
function skipRequested(command, name) {
  const m = /^\s*WORKTEAM_SKIP=([\w,-]+)\s/.exec(command);
  return Boolean(m && m[1].split(',').some(x => x === name || x === 'all'));
}

/** Bounded raw Git calls. Errors fail the relevant check, never a sibling tree. */
function git(args, cwd) {
  const remaining = limits.budget - (Date.now() - started);
  if (remaining <= 0) throw Error('check budget exhausted');
  try {
    return { stdout: execFileSync('git', args, {
      cwd, encoding: 'utf8', maxBuffer: limits.buffer,
      timeout: Math.min(limits.call, remaining), stdio: ['ignore', 'pipe', 'pipe'],
    }), status: 0 };
  } catch { throw Error('Git check failed; verify repository access and run scripts/check-staged.js'); }
}

function rootOf(cwd) { return git(['rev-parse', '--show-toplevel'], cwd).stdout.trim(); }

/** Hook protocol for both hosts; no secret value or raw command in diagnostics. */
function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason,
  } }));
  process.stderr.write(reason + '\n'); process.exit(2);
}

/** What a commit command may commit, without shell semantics. Quoted text is never a command,
 * so `grep "git commit"` stays silent; an unquoted git … commit scans the target repository's
 * index, the existing files the command names (pending adds), tracked changes for -a and untracked
 * files for `git add -A` or `.`. The target is the cwd repository, or the directory after -C or
 * cd. A commit inside a quoted `bash -c '…'` is not seen here: the Git pre-commit hook covers it.
 */
const warning = 'workteam: early check cannot resolve this command; scanning the staged index only; the Git pre-commit check scripts/check-staged.js is authoritative.\n';
function commitTargets(input) {
  const words = [...input.command.matchAll(/'([^']*)'|"((?:\\.|[^"\\])*)"|([^\s'";&|()<>{}!]+)/g)]
    .map(m => (m[3] !== undefined ? { w: m[3], quoted: false } : { w: m[1] ?? m[2], quoted: true }));
  const bare = words.filter(x => !x.quoted).map(x => x.w);
  const at = bare.findIndex(w => /(^|\/)git$/.test(w));
  if (at < 0 || !bare.slice(at + 1).includes('commit')) return [];
  if (/[$`]|(^|\s)GIT_\w+=/.test(input.command)) process.stderr.write(warning);
  let cwd = input.cwd;
  words.forEach((x, i) => { if (!x.quoted && (x.w === '-C' || x.w === 'cd') && words[i + 1]) cwd = path.resolve(cwd, words[i + 1].w); });
  let root;
  try { root = rootOf(cwd); } catch { return []; }
  const isFile = w => { try { return fs.statSync(path.resolve(cwd, w)).isFile(); } catch { return false; } };
  return [{
    cwd, root,
    paths: [...new Set(words.map(x => x.w).filter(w => !w.startsWith('-') && isFile(w)))],
    all: bare.some(w => w === '--all' || /^-[b-zB-Z]*a[a-zA-Z]*$/.test(w)),
    untracked: bare.includes('add') && bare.some(w => ['-A', '--all', '.', ':/'].includes(w)),
  }];
}
module.exports = { readInput, skipRequested, git, rootOf, deny, commitTargets, unbounded };
