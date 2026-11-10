#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const { spawnSync } = require('child_process');
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-shared-hooks-'));
const installer = path.join(__dirname, 'install-git-hook.js');
const shared = path.join(root, 'shared'), a = path.join(root, 'a'), b = path.join(root, 'b');
const secret = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const run = (cwd, bin, args) => spawnSync(bin, args, { cwd, encoding: 'utf8', env: { ...process.env, WORKTEAM_SKIP: '' } });
const ok = r => { assert.strictEqual(r.status, 0, r.stderr); return r.stdout; };
const git = (cwd, ...args) => ok(run(cwd, 'git', args));
const install = (cwd, ...args) => ok(run(cwd, process.execPath, [installer, ...args]));
const stage = (cwd, value) => { fs.writeFileSync(path.join(cwd, 'config.txt'), value); git(cwd, 'add', 'config.txt'); };
try {
  fs.mkdirSync(shared);
  const hook = path.join(shared, 'pre-commit'), original = '#!/bin/sh\necho original > .git/original-ran\n';
  fs.writeFileSync(hook, original, { mode: 0o755 });
  for (const repo of [a,b]) {
    fs.mkdirSync(repo); git(repo, '-c', 'init.templateDir=', 'init', '-q');
    for (const [key,value] of [['user.name','Test'],['user.email','test@example.invalid'],['commit.gpgsign','false'],['core.hooksPath',shared]]) git(repo,'config',key,value);
  }
  install(a); const one = fs.readFileSync(hook,'utf8');
  stage(b, secret); git(b,'commit','-qm','unenrolled clone unaffected');
  stage(a, secret); assert.notStrictEqual(run(a,'git',['commit','-qm','blocked']).status,0);
  install(b);
  const two = fs.readFileSync(hook,'utf8');
  assert.strictEqual((two.match(/^# BEGIN workteam staged check /gm)||[]).length,2);
  install(a);
  const updated = fs.readFileSync(hook,'utf8');
  const bBlock = two.slice(two.indexOf('# BEGIN'),two.indexOf('# END') + '# END workteam staged check '.length + 64);
  assert(updated.includes(bBlock),'updating A must preserve B registration');
  stage(b, secret+'\n'+secret); assert.notStrictEqual(run(b,'git',['commit','-qm','blocked']).status,0);
  install(a,'--remove');
  assert(fs.readFileSync(hook,'utf8').includes(bBlock),'removing A must preserve B');
  git(a,'commit','-qm','removed clone unaffected');
  assert.notStrictEqual(run(b,'git',['commit','-qm','still blocked']).status,0);
  install(a);
  const linked = path.join(root, 'linked');
  git(a, 'worktree', 'add', '-q', '-b', 'linked-test', linked);
  stage(linked, secret+'\n'+secret);
  assert.notStrictEqual(run(linked,'git',['commit','-qm','linked clone blocked']).status,0);
  install(a,'--remove');
  install(b,'--remove'); assert.strictEqual(fs.readFileSync(hook,'utf8'),original);
  // An older unscoped shared block has no provable owner: leave it untouched.
  const legacy=original+'# BEGIN workteam staged check\necho legacy\n# END workteam staged check\n';
  fs.writeFileSync(hook,legacy);
  for (const args of [[],['--remove']]) {
    assert.notStrictEqual(run(a,process.execPath,[installer,...args]).status,0);
    assert.strictEqual(fs.readFileSync(hook,'utf8'),legacy);
  }
  fs.unlinkSync(hook);
  const absentTarget = path.join(root, 'absent-target');
  fs.symlinkSync(absentTarget, hook);
  assert.notStrictEqual(run(a,process.execPath,[installer]).status,0);
  assert(fs.lstatSync(hook).isSymbolicLink());
  assert(!fs.existsSync(absentTarget),'dangling hook link must not create its target');
  fs.unlinkSync(hook);
  fs.writeFileSync(hook,original,{mode:0o644});
  for (const repo of [a,b]) {
    install(repo,'--remove');
    assert.strictEqual(fs.statSync(hook).mode & 0o777,0o644,'removal must not enable an unowned hook');
    assert.strictEqual(fs.readFileSync(hook,'utf8'),original);
  }
  assert.notStrictEqual(run(a,process.execPath,[installer]).status,0,'disabled existing hook needs owner action');
  assert.strictEqual(fs.statSync(hook).mode & 0o777,0o644);
  assert.strictEqual(fs.readFileSync(hook,'utf8'),original);
  fs.chmodSync(hook,0o755); install(a); fs.chmodSync(hook,0o644);
  install(a,'--remove');
  assert.strictEqual(fs.statSync(hook).mode & 0o777,0o644,'removal preserves disabled mode of an owned block');
  assert.strictEqual(fs.readFileSync(hook,'utf8'),original);
  console.log('shared hooks: clone scoping, independent updates/removal, original code and legacy-owner protection');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
