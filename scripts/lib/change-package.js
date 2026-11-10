'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

/** Explicit process paths, never filename keywords: report-service.ts is product code. */
const defaults = ['.workteam', 'docs/plans', 'docs/CURRENT_STATE.md', 'docs/INDEX.md'];
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function excluded(file, paths) { return paths.some(p => file === p || file.startsWith(p + '/')); }
/** Test files by the common conventions: an edited expectation is how a change most often fakes a pass. */
const isTest = f => /(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[^/]+$/.test(f) || /(^|\/)test[-_][^/]+$|_test\.(go|py|rb)$/.test(f);

/** Produce a diff-only audit snapshot from raw Git data; all paths are root-relative.
 * Hash covers the emitted changes/new files, allowing evidence to name its exact input.
 * Existing evidence may still cover subsets; the reviewer checks applicability per criterion.
 */
function main(args) {
  const positional = [], exclusions = [...defaults];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--exclude') {
      const value = (args[++i] || '').replace(/\/$/, '');
      if (!value || path.isAbsolute(value) || value.split('/').some(x => x === '..' || x === '.'))
        throw Error('exclude must be a nonempty repository-relative path');
      exclusions.push(value);
    } else positional.push(args[i]);
  }
  if (positional.length > 2) throw Error('usage: audit-package [BASE|empty] [OUTFILE] [--exclude path]');
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  // `empty`: the empty tree, for a session whose work includes the repository's first commit.
  const base = positional[0] === 'empty'
    ? execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd: root, input: '', encoding: 'utf8' }).trim()
    : git(['rev-parse', '--verify', (positional[0] || 'HEAD') + '^{commit}'], root).trim();
  const out = path.resolve(positional[1] || path.join(root, '.workteam/audit', base.slice(0, 7) + '..worktree.change.md'));
  const relativeOut = path.relative(root, out).split(path.sep).join('/');
  if (!relativeOut.startsWith('../') && relativeOut !== '..') exclusions.push(relativeOut);
  const pathspec = exclusions.map(p => ':(top,literal,exclude)' + p);
  const diffArgs = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames'];
  const files = git([...diffArgs, '--name-only', '-z', base, '--', ...pathspec], root).split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0').filter(f => f && !excluded(f, exclusions));
  let changes = git([...diffArgs, '-U10', base, '--', ...pathspec], root);
  for (const file of untracked) {
    const res = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '-U10', '--', '/dev/null', file],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.error || ![0, 1].includes(res.status)) throw Error('cannot read untracked diff: ' + file);
    changes += '\n' + res.stdout;
  }
  const digest = crypto.createHash('sha256').update(changes).digest('hex');
  let head = '(none: no commit yet)'; // an unborn branch: the first commit is still to come
  try { head = git(['rev-parse', 'HEAD'], root).trim(); } catch { /* keep the marker */ }
  const tests = [...files, ...untracked].filter(isTest);
  const document = [
    '# Change under audit', '', `Base: ${base}`, `HEAD: ${head}`, `Change SHA256: ${digest}`, '',
    'Includes committed, staged, unstaged and untracked changes; no commit history.', '',
    '## Excluded process paths', ...exclusions.map(p => '- ' + p), '',
    'Excluded artifacts are not covered by this audit; review them separately if deliverables.', '',
    '## Files changed', ...files.map(f => '- ' + JSON.stringify(f)), ...untracked.map(f => '- new: ' + JSON.stringify(f)), '',
    '## Test files changed', ...(tests.length ? tests.map(f => '- ' + JSON.stringify(f)) : ['- none']), '',
    '## Diff', changes,
  ].join('\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, document);
  console.log(`wrote ${out}: ${files.length} changed + ${untracked.length} new file(s), change SHA256 ${digest}`);
  if (!files.length && !untracked.length) console.error('audit-package: WARNING — no product changes; verify BASE and exclusions');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (err) { console.error('audit-package: ' + err.message); process.exitCode = 2; }
}
module.exports = { defaults, excluded, isTest };
