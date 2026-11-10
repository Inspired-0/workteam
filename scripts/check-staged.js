#!/usr/bin/env node
'use strict';
const guard = require('../hooks/lib/git-guard');
const scanner = require('../hooks/lib/staged-check');
guard.unbounded(); // no PreToolUse timeout here: a large commit must still be scanned

/** Git pre-commit entry point. GIT_INDEX_FILE is intentionally inherited: Git
 * supplies a temporary index for -a/path commits. Never stage or modify files here.
 * Also runnable manually as an index check, but only a Git hook sees the final index.
 */
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
try {
  for (const [name, check] of [['secret-scan', scanner.stagedSecrets], ['workteam-ignored', scanner.stagedScratch]]) {
    if (skip.includes(name) || skip.includes('all')) continue;
    const finding = check(process.cwd());
    if (finding) { console.error(`workteam ${name}: ${finding}`); process.exit(1); }
  }
} catch {
  console.error('workteam: staged check could not complete; inspect repository access and the check budget');
  process.exit(1);
}
