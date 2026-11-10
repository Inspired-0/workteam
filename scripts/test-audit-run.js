#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { sterileCopy, parseArgs } = require('./audit-run');

const repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-audit-src-'));
const write = (f, text) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), text); };
let copy, collisionCopy;
try {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  for (const f of ['src/a.js', 'docs/specs/s.md', 'test/a.test.js']) write(f, 'product\n');
  for (const f of ['docs/plans/active/p.md', 'docs/CURRENT_STATE.md', 'docs/INDEX.md', 'AGENTS.md', 'CLAUDE.md', 'src/CLAUDE.md',
    '.workteam/sdd/p/journal.md', '.claude/settings.json', '.codex/config.toml']) write(f, 'SENTINEL\n');
  write('.gitignore', 'ignored/\n'); write('ignored/big.bin', 'x'); write('docs/custom-process.md', 'SENTINEL\n');
  write('.workteam/audit/pkg.md', '# Change under audit\n\n## Excluded process paths\n- .workteam\n- docs/plans\n- docs/custom-process.md\n\nbody\n');
  for (const f of ['contract.md', 'evidence.md']) write(path.join('.workteam/audit', f), f);
  const inputs = { package: path.join(repo, '.workteam/audit/pkg.md'), contract: path.join(repo, '.workteam/audit/contract.md'), evidence: path.join(repo, '.workteam/audit/evidence.md') };
  const sterile = sterileCopy(repo, inputs);
  copy = sterile.dest;
  const collisionInputs = {};
  for (const key of ['package', 'contract', 'evidence']) {
    const relative = '.workteam/audit/' + key + '/input.md';
    write(relative, 'unique ' + key + ' body');
    collisionInputs[key] = path.join(repo, relative);
  }
  const collision = sterileCopy(repo, collisionInputs); collisionCopy = collision.dest;
  assert.strictEqual(new Set(Object.values(collision.copied)).size, 3, 'same basenames must not collide');
  for (const key of Object.keys(collisionInputs))
    assert.strictEqual(fs.readFileSync(collision.copied[key], 'utf8'), 'unique ' + key + ' body');

  const files = execFileSync('find', ['.', '-type', 'f'], { cwd: copy, encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  assert.deepStrictEqual(files, ['./inputs/contract.md', './inputs/evidence.md', './inputs/package.md',
    './repo/.gitignore', './repo/docs/specs/s.md', './repo/src/a.js', './repo/test/a.test.js'], files.join(' '));
  assert.ok(!fs.existsSync(path.join(sterile.repo, '.git')), 'no git history in the copy');
  assert.ok(fs.readFileSync(sterile.copied.package, 'utf8').includes('docs/custom-process.md'), 'the package exclusion is honoured, not copied');
  assert.throws(() => parseArgs(['--package', inputs.package]), /--contract/, 'every input is required');
  // Without --package the runner builds the default package, HEAD to the working tree.
  execFileSync('git', ['add', 'src/a.js'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', 'commit', '-q', '-m', 'base'], { cwd: repo });
  write('src/a.js', 'product v2\n'); write('src/new.js', 'fresh\n');
  const here = process.cwd(); process.chdir(repo);
  let built;
  try { built = parseArgs(['--contract', inputs.contract, '--evidence', inputs.evidence]); } finally { process.chdir(here); }
  const pkg = fs.readFileSync(built.package, 'utf8');
  assert.ok(built.package.endsWith('..worktree.change.md') && pkg.includes('+product v2') && pkg.includes('src/new.js'), 'the default package holds tracked and untracked changes');
  console.log('audit run: sterile copy keeps product files, puts the inputs beside it, drops history, process files, package exclusions and instructions');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
  if (copy) fs.rmSync(copy, { recursive: true, force: true });
  if (collisionCopy) fs.rmSync(collisionCopy, { recursive: true, force: true });
}
