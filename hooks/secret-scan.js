#!/usr/bin/env node
'use strict';
const guard = require('./lib/git-guard');
const scanner = require('./lib/staged-check');

/** Early check of literal commit commands. Actual index enforcement is check-staged.js. */
async function main() {
  const input = await guard.readInput();
  if (!input || guard.skipRequested(input.command, 'secret-scan')) return;
  for (const target of guard.commitTargets(input)) {
    try {
      const finding = scanner.earlySecrets(target);
      if (finding) guard.deny(`workteam secret-scan: ${finding}; remove the credential or explicitly authorize WORKTEAM_SKIP=secret-scan`);
    } catch {
      guard.deny('workteam secret-scan could not inspect this commit; run scripts/check-staged.js or explicitly authorize WORKTEAM_SKIP=secret-scan');
    }
  }
}
main();
