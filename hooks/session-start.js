#!/usr/bin/env node
/**
 * SessionStart: orient the session in the project. Prints the plugin root, the contract status
 * (AGENTS.md block present, current, visible to Claude Code), docs/CURRENT_STATE.md, active
 * plans with their task status and git status, read at the git root. Same output in Claude
 * Code and Codex; capped here because hooks.json lifts Codex's limit. A blind-audit session
 * (WORKTEAM_AUDITOR=1 or the auditor agent) gets nothing: state and plans are process history.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { claudeImportWarning, planLine, cap, skillCopiesWarning, runsLine } = require('./lib/session-state');
const { sessionFile } = require('./lib/scope');

const pluginRoot = path.resolve(__dirname, '..');
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
if (process.env.WORKTEAM_AUDITOR === '1' || /^(?:workteam:)?auditor$/.test(input.agent_type || '')) process.exit(0);
const git = (cwd, ...args) => { try { return execFileSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd(); } catch { return null; } };
const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = git(start, 'rev-parse', '--show-toplevel') || start;
const read = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; } };
let version = '?';
try { version = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { /* keep '?' */ }

const out = ['## Workteam session start', '',
  `Plugin root: ${pluginRoot} — skills are \`<root>/skills/<name>/SKILL.md\`; workteam subagents get this line from the SubagentStart hook.`, ''];
const marker = (read('AGENTS.md') || '').match(/<!-- workteam:contract v([\d.]+)[\s\S]*<!-- \/workteam:contract -->/);
if (!marker) out.push(process.env.EVAL_WORKTEAM_CONTRACT === '1' ? 'Rules: the contract block from the eval-contract hook (eval run).' : 'No workteam contract in AGENTS.md: run `project-onboarding` to write it.');
else if (marker[1] !== version) out.push(`AGENTS.md contract is v${marker[1]}, plugin is v${version}: run \`project-onboarding\` to refresh the block.`);
else out.push(`Rules: AGENTS.md (contract v${version}). Map: docs/INDEX.md.`);
const contract = Boolean(marker) || process.env.EVAL_WORKTEAM_CONTRACT === '1';
for (const warning of [marker && claudeImportWarning(dir), contract && skillCopiesWarning(dir)]) if (warning) out.push(warning);
if (contract) out.push(`Interview decision for this session: before your first product edit write its \`Interview:\` line into \`${sessionFile(input.session_id)}\` — \`light\` only for the Light route, never auth, personal data, money or a new boundary (forms: the \`interview\` skill).`);
const runs = contract && runsLine(dir, input.session_id, input.source); if (runs) out.push(runs, 'Timeline of a session: `node ' + pluginRoot + '/scripts/runs.js [session id]`.');
if ((read('AGENTS.md') || '').length > 28 * 1024) out.push('AGENTS.md is over 28 KiB: Codex reads at most 32 KiB of project instructions by default — move detail into docs/ or a skill.');

const state = read('docs/CURRENT_STATE.md');
const lines = state ? state.trimEnd().split('\n') : [];
out.push('', '### docs/CURRENT_STATE.md', ...(state ? lines.slice(0, 80) : ['missing']));
if (lines.length > 80) out.push(`… truncated at 80 of ${lines.length} lines — keep it short.`);
let plans = [];
try { plans = fs.readdirSync(path.join(dir, 'docs', 'plans', 'active')).filter((f) => f.endsWith('.md')); } catch { /* none */ }
out.push('', '### Active plans', ...(plans.length ? plans.map((f) => planLine(dir, f)) : ['- none']));

const branch = git(dir, 'branch', '--show-current');
if (branch !== null) {
  const changes = (git(dir, 'status', '--short') || '').split('\n').filter(Boolean);
  out.push('', '### Git', `branch: ${branch || '(detached)'}`,
    ...(changes.length ? ['uncommitted:', ...changes.slice(0, 20)] : ['working tree clean']));
  if (changes.length > 20) out.push(`… ${changes.length - 20} more`);
}
if (input.source === 'compact') out.push('', 'Context was compacted: re-read the active plan and check CURRENT_STATE.md against reality before continuing.');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: cap(out.join('\n')) },
}));
