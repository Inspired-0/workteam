#!/usr/bin/env node
/**
 * Evidence gate: a developer or tester report without its evidence goes back to the agent.
 * SubagentStop in both hosts (last_assistant_message); in Claude Code auto mode the report is
 * the SubagentHandback tool input, checked here as PreToolUse. A developer report needs an
 * «Evidence:» line naming a command in backticks — or «none» with a reason, accepted only when
 * the transcript shows the agent neither edited a file nor ran a shell command; a tester report
 * names its `.workteam/audit/…evidence.md` file. A format check against
 * forgetting, not proof of the run: the auditor reads the evidence itself. Loop guard:
 * stop_hook_active. Override: WORKTEAM_SKIP=evidence-gate.
 */
'use strict';
const fs = require('fs');
const { underContract } = require('./lib/scope');
const { record } = require('./lib/ledger');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
const role = (/^(?:workteam:)?(developer|tester)$/.exec(input.agent_type || '') || [])[1];
if (!role || skip.includes('evidence-gate') || skip.includes('all') || input.stop_hook_active) process.exit(0);
const handback = input.hook_event_name === 'PreToolUse';
if (handback && input.tool_name !== 'SubagentHandback') process.exit(0);

let transcript = '';
try { transcript = fs.readFileSync(input.agent_transcript_path, 'utf8'); } catch { /* not exposed */ }
// «none» needs a transcript that shows no edit and no shell: a file written through Bash counts.
const edited = /"name":\s*"(Edit|Write|MultiEdit|NotebookEdit|apply_patch|Bash|exec_command|shell)"/.test(transcript);
const quiet = transcript !== '' && !edited;
/** The reason a report fails the format, or null. */
function missing(report) {
  const line = (/^[\s>*_#-]*evidence\b[*_]*\s*[:—-]\s*(.*)$/im.exec(report) || [])[1];
  if (role === 'tester') return /\.workteam\/audit\/\S*evidence\.md/.test(report) || (line && /`[^`]+`/.test(line)) ? null
    : 'Name the evidence file (.workteam/audit/<slug>.evidence.md) you wrote, or an «Evidence:» line with the command you ran and its result.';
  if (line !== undefined && (/`[^`]+`/.test(line) || (quiet && /\bnone\b/i.test(line)))) return null;
  return quiet ? 'End the report with «Evidence: `<command>` → <result>», or «Evidence: none — <why nothing needed running>».'
    : 'You edited files or ran commands: end the report with «Evidence: `<command>` → <the line that proves it>», or say the change is unverified and why.';
}
// After an accepted hand-back the stop event carries only closing text: a hand-back that already
// passes the format settles it, a denied one does not.
let last = null;
for (const l of transcript.split('\n')) {
  if (!l.includes('SubagentHandback')) continue;
  try { for (const c of JSON.parse(l).message?.content || []) if (c.type === 'tool_use' && c.name === 'SubagentHandback') last = String(c.input?.message || ''); } catch { /* partial line */ }
}
const report = handback ? String((input.tool_input && input.tool_input.message) || '') : String(input.last_assistant_message || '');
const reason = !handback && last !== null && !missing(last) ? null : missing(report);
if (underContract(input.cwd || process.cwd())) record(input.cwd || process.cwd(), input.session_id, { ev: 'evidence', role, ok: !reason, ...(reason ? { reason } : {}) });
if (!reason) process.exit(0);
const text = `workteam evidence-gate: ${reason}`;
process.stdout.write(JSON.stringify(handback
  ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text } }
  : { decision: 'block', reason: text }));
