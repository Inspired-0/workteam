#!/usr/bin/env node
'use strict';
/**
 * Print what the hooks saw in a session: the run ledger in .workteam/runs/<session id>.jsonl as a
 * timeline — the session starting, subagents starting and stopping, the evidence verdicts, the
 * interview gate's dispatches and refusals, every stop the audit gate judged, the auditor's package.
 * Usage: runs.js [SESSION_ID] [--list] [--project DIR] — the latest session by default; --list
 * shows every recorded session with a one-line summary, newest first.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readLedger, summary } = require('../hooks/lib/ledger');

const args = process.argv.slice(2);
const at = args.indexOf('--project');
const start = at >= 0 ? path.resolve(args[at + 1] || '.') : process.cwd();
let project = start;
try { project = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: start, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a repo */ }
const dir = path.join(project, '.workteam', 'runs');
let files = [];
try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)); } catch { /* none */ }
files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (!files.length) { console.log(`No run ledger in ${dir}: hooks record one in onboarded projects.`); process.exit(0); }

if (args.includes('--list')) {
  for (const f of files) console.log(`${new Date(fs.statSync(f).mtimeMs).toISOString().slice(0, 16).replace('T', ' ')}  ${path.basename(f, '.jsonl')}  ${summary(readLedger(f))}`);
  process.exit(0);
}
const id = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--project');
const file = id ? files.find((f) => path.basename(f, '.jsonl').startsWith(id)) : files[0];
if (!file) { console.error(`runs: no ledger for session ${id} in ${dir}`); process.exit(1); }

const line = (e) => {
  const role = String(e.role || '').replace(/^workteam:/, '');
  switch (e.ev) {
    case 'session': return ['session', e.source];
    case 'agent': return ['agent', `${e.phase} ${role}`];
    case 'interview': return ['interview', `${e.what}${role ? ' ' + role : ''} ${e.ok ? 'allowed' : 'refused'}${e.decision ? ` — Interview: ${e.decision}` : ''}${e.reason ? ` — ${e.reason}` : ''}`];
    case 'evidence': return ['evidence', `${role} ${e.ok ? 'accepted' : 'sent back'}${e.reason ? ` — ${e.reason}` : ''}`];
    case 'audit-gate': return ['stop', `${e.held ? 'held' : 'passed'} (${e.why})${e.changed ? ': ' + e.changed.join(', ') : ''}`];
    case 'audit-package': return ['package', `offered to the auditor: ${e.offered} (${e.built ? 'built by the hook' : "the lead's"}; a package the brief names wins)`];
    default: return [e.ev, JSON.stringify(e)];
  }
};
const events = readLedger(file);
console.log(`${path.relative(project, file)} — ${summary(events)}\n`);
for (const e of events) { const [kind, text] = line(e); console.log(`${String(e.t).slice(11, 19)}  ${kind.padEnd(9)}  ${text}`); }
