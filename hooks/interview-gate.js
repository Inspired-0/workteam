#!/usr/bin/env node
/**
 * Interview gate (PreToolUse, both hosts): Standard and Full work starts after the `interview`
 * skill. A dispatch of the developer or a general-purpose agent, and the lead's own
 * edits outside docs/, .workteam/, host folders and *.md, wait for an «Interview:» decision — in
 * the brief of a dispatch; for an edit in .workteam/interview/<session id>.md, which the lead writes
 * (a file: the transcript lags the current message). A subagent's edits passed at its dispatch.
 * `light` is taken at its word; the rest is checked against what the user
 * wrote: `<record>` needs its «Confirmed: «…»» words in a user message after the record appeared
 * in the session, `settled — <doc>` a document the user named or a committed one, `settled — «…»`
 * and `opted out — «…»` the user's own words. Shell writes are not seen. Inactive without a workteam contract.
 * Override: WORKTEAM_SKIP=interview-gate.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { entries, quote, userSaid } = require('./lib/transcript');
const { isProduct, underContract, sessionFile, decisionIn, committed } = require('./lib/scope');
const { record } = require('./lib/ledger');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
const tool = input.tool_name || '', t = input.tool_input || {}, cwd = input.cwd || process.cwd();
const read = (p) => { try { return fs.readFileSync(path.resolve(cwd, p), 'utf8'); } catch { return ''; } };
const dispatch = /^(Agent|Task|spawn_agent)$/.test(tool), edit = /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/.test(tool);
const role = String(t.subagent_type || t.agent_type || '').replace(/^workteam:/, '');
const files = tool === 'apply_patch' ? [...String(t.command || '').matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map((m) => m[1])
  : [t.file_path || t.notebook_path].filter(Boolean);
const product = files.some((f) => isProduct(cwd, f));
if (skip.includes('interview-gate') || skip.includes('all')) process.exit(0);
if (dispatch ? !/^(developer|general-purpose|claude|fork|default|worker|)$/.test(role) : !edit || input.agent_id || !product) process.exit(0);
if (!underContract(cwd)) process.exit(0);

const log = entries(input.transcript_path);
const said = (words, after) => userSaid(log, words, after);
if (!dispatch && log.subagent) process.exit(0);
const file = sessionFile(input.session_id);
const decision = decisionIn(dispatch ? (t.prompt || t.message || t.task || '') : read(file));

function problem() {
  if (!decision) return `${dispatch ? 'the brief' : file} has no «Interview:» line`;
  if (/^light\b/i.test(decision)) return null;
  if (/^(opted out|settled)\b/i.test(decision) && quote(decision)) return said(quote(decision)) ? null : 'the line quotes words the user did not write';
  if (/^opted out\b/i.test(decision)) return 'an opt-out quotes the user: «…»';
  const doc = (/[^\s«»"'`]+\.md\b/.exec(decision) || [])[0] || '';
  if (/^settled\b/i.test(decision)) return !read(doc) ? `settled names no existing document (${doc || 'none'})`
    : said(doc) || said(path.basename(doc)) || committed(cwd, doc) ? null : `${doc} is neither named by the user nor committed`;
  const record = read(doc); if (!record) return `the interview record ${doc || '(no path)'} does not exist`;
  const words = quote((/^[\s*_-]*(?:Confirmed|Подтверждено)[*_]*\s*:\s*(.+)$/im.exec(record) || [])[1]);
  const shown = log.findIndex((e) => e.text.includes(path.basename(doc)));
  if (shown < 0) return `${doc} never appeared in this session: show it to the user and record their confirmation`;
  return words && said(words, shown) ? null : `${doc} has no «Confirmed: «…»» line quoting a user message written after the record appeared`;
}
const reason = problem();
if (dispatch || reason) record(cwd, input.session_id, { ev: 'interview', what: dispatch ? 'dispatch' : 'edit', role: role || null, ok: !reason, decision: decision || null, ...(reason ? { reason } : {}) });
if (!reason) process.exit(0);
const where = dispatch ? 'the brief' : `${file} (this gate does not check .workteam/)`;
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
  permissionDecisionReason: `workteam interview-gate: ${reason}. Standard and Full work starts after the \`interview\` skill. Before ${dispatch ? `dispatching ${role || 'a general-purpose agent'}` : 'editing product files'}, ${where} carries one line: «Interview: light — <what you understood>» for the Light route only (never auth, personal data, money or a new boundary); «Interview: <record path>» once the user confirmed the record; «Interview: settled — <doc>» for a document the user named or a committed one, or «Interview: settled — «<their words>»» when their request settles it; «Interview: opted out — «<their words>»». The route still decides spec, tester and audit. Reading and research (the researcher role) are not gated.` } }));
