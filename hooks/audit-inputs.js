#!/usr/bin/env node
/**
 * Audit inputs (SubagentStart, the auditor): the auditor gets the change package without the lead
 * having to build it. A package written in this session (.workteam/audit/*.change.md) is named as
 * is; otherwise the hook builds one with the blind-audit packager, from the last commit older than
 * the session (with a second's margin: git dates are whole seconds) to the working tree. A package
 * the brief names wins. The package holds the diff only, without process paths, as the audit needs.
 * Override: WORKTEAM_SKIP=audit-inputs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sessionStart, underContract } = require('./lib/scope');
const { record } = require('./lib/ledger');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
if (!/^(?:workteam:)?auditor$/.test(input.agent_type || '') || skip.includes('audit-inputs') || skip.includes('all')) process.exit(0);
const cwd = input.cwd || process.cwd();
const git = (...args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const root = git('rev-parse', '--show-toplevel');
if (!root) process.exit(0);
const start = sessionStart(input.transcript_path);
const dir = path.join(root, '.workteam', 'audit');
const mtime = (p) => fs.statSync(p).mtimeMs;
let pkg = '';
if (start) {
  try { pkg = fs.readdirSync(dir).filter((f) => f.endsWith('.change.md')).map((f) => path.join(dir, f)).filter((p) => mtime(p) >= start).sort((a, b) => mtime(b) - mtime(a))[0] || ''; } catch { /* no audit folder yet */ }
}
let how = 'written in this session';
if (!pkg) {
  // No commit before the session (the repository's first commit is part of it): from the empty tree.
  const base = start ? git('rev-list', '-1', `--before=@${Math.floor(start / 1000) - 1}`, 'HEAD') || 'empty' : git('rev-parse', 'HEAD') || 'empty';
  pkg = path.join(dir, `session-${String(input.session_id || 'x').slice(0, 8)}.change.md`);
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'lib', 'change-package.js'), base, pkg], { cwd: root, stdio: 'ignore', timeout: 20000 }); } catch { process.exit(0); }
  how = `built by the SubagentStart hook from ${base === 'empty' ? 'the empty tree (no commit before this session)' : `${base.slice(0, 7)}, the last commit before this session,`} to the working tree`;
}
// The hook cannot see the brief: it records the package it offered, which a brief's own package overrides.
if (underContract(root)) record(root, input.session_id, { ev: 'audit-package', offered: path.relative(root, pkg), built: how !== 'written in this session' });
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart',
  additionalContext: `Change package for this audit: ${pkg} (${how}). Read it as the change under audit; a package your brief names wins.` } }));
