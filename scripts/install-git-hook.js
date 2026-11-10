#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');

/** Install/update/remove this clone's managed block, preserving shared hooks and other clones. */
const legacyBegin = '# BEGIN workteam staged check';
const legacyEnd = '# END workteam staged check';
try {
  if (process.argv.slice(2).some(a => a !== '--remove') || process.argv.length > 3)
    throw Error('usage: install-git-hook.js [--remove]');
  const remove = process.argv.includes('--remove');
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const common = fs.realpathSync(path.resolve(git(['rev-parse', '--git-common-dir'])));
  const project = fs.realpathSync(git(['rev-parse', '--show-toplevel']));
  const hook = path.resolve(git(['rev-parse', '--git-path', 'hooks/pre-commit']));
  let existing;
  try { existing = fs.lstatSync(hook); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (existing && existing.isSymbolicLink())
    throw Error('existing hook is a symlink; integrate through its owner instead of overwriting the target');
  if (remove && !fs.existsSync(hook)) { console.log('no workteam staged check installed'); process.exit(0); }
  // Resolve existing parent links too before deciding whether an old unscoped block is local.
  let parent = path.dirname(hook), suffix = [];
  while (!fs.existsSync(parent)) { suffix.unshift(path.basename(parent)); parent = path.dirname(parent); }
  const actual = path.join(fs.realpathSync(parent), ...suffix, path.basename(hook));
  const inside = dir => { const rel = path.relative(dir, actual); return rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); };
  const local = inside(common) || inside(project);
  const id = createHash('sha256').update(common).digest('hex');
  const begin = legacyBegin + ' ' + id, end = legacyEnd + ' ' + id;
  let text = fs.existsSync(hook) ? fs.readFileSync(hook, 'utf8') : '#!/bin/sh\n';
  const original = text;
  if (!remove && existing && !(existing.mode & 0o111))
    throw Error('existing pre-commit hook is disabled; ask its owner to enable it or integrate manually');
  if (!/^#![^\n]*\b(sh|bash|dash|zsh)(?:\s[^\n]*)?\r?\n/.test(text))
    throw Error('existing pre-commit is not a supported shell script; integrate using its native language');
  function strip(first, last) {
    const lines = text.split(/\r?\n/), starts = [], ends = [];
    lines.forEach((line, i) => { if (line === first) starts.push(i); if (line === last) ends.push(i); });
    if (!starts.length && !ends.length) return;
    if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0])
      throw Error('malformed workteam block; existing hook left unchanged');
    lines.splice(starts[0], ends[0] - starts[0] + 1);
    text = lines.join('\n');
  }
  if (text.split(/\r?\n/).some(line => line === legacyBegin || line === legacyEnd)) {
    if (!local) throw Error('unscoped workteam block in a shared hook; its owner must migrate it before installation or removal');
    strip(legacyBegin, legacyEnd);
  }
  strip(begin, end);
  if (remove && text === original) { console.log('no workteam staged check for this clone'); process.exit(0); }
  if (!remove) {
    const script = path.join(__dirname, 'check-staged.js');
    const quote = s => "'" + s.replace(/'/g, "'\\''") + "'";
    const warning = `workteam staged check not found at ${script}; rerun install-git-hook.js from the current plugin`;
    const noNode = `workteam staged check skipped: node is not on PATH (script at ${script})`;
    const block = `${begin}
workteam_git_dir=$(git rev-parse --git-common-dir 2>/dev/null) || workteam_git_dir=
if [ -n "$workteam_git_dir" ] && [ "$(cd "$workteam_git_dir" 2>/dev/null && pwd -P)" = ${quote(common)} ]; then
  if [ ! -f ${quote(script)} ]; then
    echo ${quote(warning)} >&2
  elif ! command -v node >/dev/null 2>&1; then
    echo ${quote(noNode)} >&2
  else
    node ${quote(script)} || exit $?
  fi
fi
${end}
`;
    const newline = text.indexOf('\n') + 1;
    text = text.slice(0, newline) + block + text.slice(newline);
  }
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, text, { mode: 0o755 });
  if (!remove) fs.chmodSync(hook, 0o755);
  console.log((remove ? 'removed' : 'installed') + ' workteam staged check for this clone: ' + hook);
} catch (err) {
  console.error('workteam: ' + err.message); process.exitCode = 1;
}
