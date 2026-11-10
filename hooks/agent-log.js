#!/usr/bin/env node
/**
 * Agent log (SubagentStart and SubagentStop, both hosts): records every subagent starting and
 * stopping in the session's run ledger (.workteam/runs/<session id>.jsonl), so which roles ran is
 * a fact the hooks saw. Host-internal agents with no type are skipped. Writes nothing without a
 * workteam contract. Override: WORKTEAM_SKIP=agent-log.
 */
'use strict';
const fs = require('fs');
const { underContract } = require('./lib/scope');
const { record } = require('./lib/ledger');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const skip = (process.env.WORKTEAM_SKIP || '').split(',');
const cwd = input.cwd || process.cwd();
if (!input.agent_type || skip.includes('agent-log') || skip.includes('all') || !underContract(cwd)) process.exit(0);
const phase = { SubagentStart: 'start', SubagentStop: 'stop' }[input.hook_event_name];
if (phase) record(cwd, input.session_id, { ev: 'agent', phase, role: input.agent_type, id: input.agent_id || null });
