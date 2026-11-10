#!/usr/bin/env node
/**
 * Audit gate (Stop, both hosts): a turn does not end after a code change in the session until a
 * blind audit ran. A change: a product file the session modified, deleted or committed, by any tool
 * (`sessionChanges`). It passes when the session's interview decision — its file, else the last one
 * in the lead's messages and briefs — is `light`, when a .workteam/audit/*.audit.md was written since
 * the session began, or while an auditor runs in the background. A last message with «Audit: pending
 * — <why>» passes and is recorded with its reason and files, so SessionStart reminds of it until an
 * audit runs; «Audit: waived — «…»» passes only when the user wrote those words. A change with no
 * decision is held too: Light work writes its line. A turn is held once: the repeated stop
 * (stop_hook_active) is never held but recorded, and one that ends with neither an audit nor a
 * line is `ignored`, which SessionStart reminds of like a pending audit.
 * Override: WORKTEAM_SKIP=audit-gate.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { entries, quote, userSaid } = require('./lib/transcript');
const { underContract, sessionFile, decisionIn, sessionStart, sessionChanges } = require('./lib/scope');
const { record } = require('./lib/ledger');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
const cwd = input.cwd || process.cwd();
if (skip.includes('audit-gate') || skip.includes('all') || !underContract(cwd)) process.exit(0);
const pass = (why, extra = {}) => { record(cwd, input.session_id, { ev: 'audit-gate', held: false, why, ...extra }); process.exit(0); };
if ((input.background_tasks || []).some((t) => /auditor|audit-run/.test(`${t.agent_type || ''} ${t.command || ''}`))) pass('auditor running');
const start = sessionStart(input.transcript_path);
const changed = start && sessionChanges(cwd, start);
if (!changed) process.exit(0);
const log = entries(input.transcript_path);
const line = (/^[\s>*_-]*Audit[*_]*\s*:\s*(.+)$/im.exec(input.last_assistant_message || '') || [])[1] || '';
const waiver = /^waived\b/i.test(line) ? quote(line) : '';
let audited = false;
try { audited = fs.readdirSync(path.join(cwd, '.workteam', 'audit')).some((f) => f.endsWith('.audit.md') && fs.statSync(path.join(cwd, '.workteam', 'audit', f)).mtimeMs >= start); } catch { /* no audit folder */ }
// An audit or a waiver closes a pending one even in a session that changed no code.
if (audited) pass('audited');
if (waiver && userSaid(log, waiver)) pass('waived', { reason: waiver.slice(0, 300), changed });
if (!changed.length) pass('no change');
if (/^pending\s*[—–-]+\s*\S/i.test(line)) pass('pending', { reason: line.replace(/^pending\s*[—–-]+\s*/i, '').slice(0, 300), changed });
let decision = '';
try { decision = decisionIn(fs.readFileSync(path.resolve(cwd, sessionFile(input.session_id)), 'utf8')); } catch { /* no session file */ }
if (!decision) for (const e of log) if (e.role === 'assistant') decision = decisionIn(e.text) || decision;
if (/^light\b/i.test(decision)) pass('light');
if (input.stop_hook_active) pass('ignored', { reason: 'the turn ended after the audit-gate hold without an audit', changed });

record(cwd, input.session_id, { ev: 'audit-gate', held: true, why: decision ? 'no audit' : 'no route', changed });
const list = changed.slice(0, 5).join(', ') + (changed.length > 5 ? ` and ${changed.length - 5} more` : '');
const file = sessionFile(input.session_id);
const route = decision ? `under «Interview: ${decision}», a Standard or Full change,` : `with no route declared (no «Interview:» line in ${file} or a brief),`;
const waivedNote = waiver ? ' A waiver counts only in words the user wrote: quote them in «Audit: waived — «…»».' : '';
process.stdout.write(JSON.stringify({ decision: 'block', reason: `workteam audit-gate: this session changed ${list} ${route} and no blind audit ran.${waivedNote} ${decision ? 'Run' : `Light work: write «Interview: light — <what you understood>» into ${file}. Otherwise run`} \`blind-audit\` now — the auditor subagent in Claude Code, \`scripts/audit-run.js\` in Codex — and adjudicate its findings before you report. If the work is not finished or the audit comes later, end your message with «Audit: pending — <why>».` }));
