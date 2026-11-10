#!/usr/bin/env node
/**
 * SubagentStart: give each workteam role that reads skills the plugin root, so it finds the
 * skills of its table without the lead copying a `Plugin root:` line into every brief. Both
 * hosts accept hookSpecificOutput.additionalContext for this event. The auditor reads no skills
 * and gets nothing; other agents get nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
if (!/^(?:workteam:)?(developer|tester|critic|researcher|debugger)$/.test(input.agent_type || '')) process.exit(0);
const root = path.resolve(__dirname, '..');
process.stdout.write(JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'SubagentStart',
  additionalContext: `Plugin root: ${root} — the skills of your table are \`${root}/skills/<name>/SKILL.md\`.`,
} }));
