#!/usr/bin/env node
/**
 * SessionStart hook for eval runs only. `claude plugin eval` loads no project files, so a
 * workspace's AGENTS.md never reaches the agent; with EVAL_WORKTEAM_CONTRACT=1 (set in a
 * case's `env`) this prints the contract block of templates/AGENTS.md instead, as onboarding
 * would write it. Silent otherwise. A separate hook keeps the block out of session-start's
 * 9,000-character budget: each hook's additionalContext is limited on its own.
 */
'use strict';
const fs = require('fs');
const path = require('path');

if (process.env.EVAL_WORKTEAM_CONTRACT === '1') {
  try {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'AGENTS.md'), 'utf8');
    const block = template.match(/<!-- workteam:contract v[\s\S]*?<!-- \/workteam:contract -->/)[0];
    const text = `The project's AGENTS.md (eval run: onboarding wrote it; the host does not load it here):\n\n${block.replace('{{PROJECT_NAME}}', 'This project')}`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  } catch { /* no template: stay silent */ }
}
