#!/usr/bin/env node
/**
 * Blind-audit guard (Claude Code). Inside the auditor subagent, or a separate audit session that
 * scripts/audit-run.js marks with WORKTEAM_AUDITOR=1, Read, Grep and Glob may not open git
 * history, scratch, plans or the state files — the paths the change package excludes — and in
 * .workteam/audit/ only the audit inputs (*.change.md, *.contract.md, *.evidence.md), not earlier
 * reviews. A Grep or Glob whose search root holds any of them is refused too: search a product
 * directory instead. Codex PreToolUse carries no agent_type; there only the separate process of
 * audit-run.js is blind. Override: WORKTEAM_SKIP=auditor-blind.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
const auditor = /^(?:workteam:)?auditor$/.test(input.agent_type || '') || process.env.WORKTEAM_AUDITOR === '1';
if (!auditor || skip.includes('auditor-blind') || skip.includes('all')) process.exit(0);

const t = input.tool_input || {};
const cwd = input.cwd || process.cwd();
const norm = (p) => path.resolve(cwd, p).split(path.sep).join('/');
const closed = /(^|\/)(\.git|docs\/plans)(\/|$)|(^|\/)docs\/(CURRENT_STATE|INDEX)\.md$|(^|\/)\.workteam(\/(?!audit(\/|$))|$)|(^|\/)\.workteam\/audit\/(?![^/]+\.(change|contract|evidence)\.md$)[^/]/;
const targets = [t.file_path, t.path, t.glob, input.tool_name === 'Glob' ? t.pattern : null].filter((p) => typeof p === 'string' && p);
let hit = targets.find((p) => closed.test(norm(p)));
if (!hit && ['Grep', 'Glob'].includes(input.tool_name)) {
  const root = norm(t.path || '.');
  if (/(^|\/)\.workteam(\/|$)/.test(root)) hit = `a search of ${root}`; // earlier reviews sit beside the inputs
  const inside = ['.git', '.workteam', 'docs/plans', 'docs/CURRENT_STATE.md', 'docs/INDEX.md',
    ...(path.basename(root) === 'docs' ? ['plans', 'CURRENT_STATE.md', 'INDEX.md'] : [])];
  if (!hit && inside.some((p) => fs.existsSync(path.join(root, p)))) hit = `a search of ${root}`;
}
if (!hit) process.exit(0);
process.stdout.write(JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'PreToolUse', permissionDecision: 'deny',
  permissionDecisionReason: `workteam auditor-blind: ${hit} reaches process history (git, scratch, plans, state, earlier reviews), outside a blind audit; read the change package, the contract and the evidence, and search product directories only.`,
} }));
