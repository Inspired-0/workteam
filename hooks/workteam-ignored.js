#!/usr/bin/env node
'use strict';
const guard = require('./lib/git-guard');
const scanner = require('./lib/staged-check');

/** Scratch is checked in the target tree, never an unrelated sibling worktree. */
async function main() {
  const input = await guard.readInput();
  if (!input || guard.skipRequested(input.command, 'workteam-ignored')) return;
  for (const target of guard.commitTargets(input)) {
    try {
      const finding = scanner.exposedScratch(target.root);
      if (finding) guard.deny(`workteam: ${finding}; ignore scratch and untrack it if needed; explicit override WORKTEAM_SKIP=workteam-ignored`);
    } catch {
      guard.deny('workteam workteam-ignored could not inspect this commit; run scripts/check-staged.js or explicitly authorize WORKTEAM_SKIP=workteam-ignored');
    }
  }
}
main();
