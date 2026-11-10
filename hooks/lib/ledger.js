'use strict';
const fs = require('fs');
const path = require('path');

/**
 * The run ledger of a session: one JSON line per event a hook saw — the session starting, a
 * subagent starting or stopping, a gate's decision — in .workteam/runs/<session id>.jsonl. Hooks
 * write it, never agents, so it holds what happened rather than what an agent says happened. A
 * failed write never fails the hook: the ledger is a record, not a gate.
 */
const ledgerFile = (cwd, sessionId) =>
  path.join(cwd, '.workteam', 'runs', `${String(sessionId || 'session').replace(/[^\w.-]/g, '_')}.jsonl`);

function record(cwd, sessionId, event) {
  try {
    const file = ledgerFile(cwd, sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
  } catch { /* the ledger never blocks the work it records */ }
}

/** The events of a ledger file, oldest first; unreadable lines are skipped. */
function readLedger(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** One line on what ran: interview decisions, subagent stops (a stop the evidence gate sent back counts too), evidence verdicts, stops held. */
function summary(events) {
  const finished = {}, decisions = new Set();
  let refused = 0, stops = 0, held = 0, pending = 0, ignored = 0, accepted = 0, sentBack = 0;
  for (const e of events) {
    if (e.ev === 'agent' && e.phase === 'stop') finished[e.role] = (finished[e.role] || 0) + 1;
    if (e.ev === 'interview') { if (!e.ok) refused++; else if (e.decision) decisions.add(e.decision.split(/\s+[—–-]\s+/)[0]); }
    if (e.ev === 'evidence') { if (e.ok) accepted++; else sentBack++; }
    if (e.ev === 'audit-gate') { stops++; if (e.held) held++; if (e.why === 'pending') pending++; if (e.why === 'ignored') ignored++; }
  }
  const agents = Object.entries(finished).map(([role, n]) => `${role.replace(/^workteam:/, '')} ×${n}`).join(', ') || 'none';
  return [`interview: ${[...decisions].join(', ') || 'no decision'}${refused ? `, ${refused} refused` : ''}`, `subagent stops: ${agents}`,
    ...(accepted + sentBack ? [`evidence: ${accepted} accepted, ${sentBack} sent back`] : []), `stops: ${stops}, ${held} held for the audit${pending ? `, ${pending} passed as pending` : ''}${ignored ? `, ${ignored} ended after the hold without it` : ''}`].join('; ');
}

/** The newest ledger of another session that recorded more than its own start, or null. */
function previousLedger(cwd, sessionId) {
  const dir = path.join(cwd, '.workteam', 'runs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)); } catch { return null; }
  const own = ledgerFile(cwd, sessionId);
  const others = files.filter((f) => f !== own).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return others.find((f) => readLedger(f).some((e) => e.ev !== 'session')) || null;
}

/**
 * The audit left pending and not done since, across every ledger of the project, or null: a stop
 * passed as pending, or a turn that ended after the hold without an audit (`ignored`), opens it; an audited or waived stop, or an auditor that finished, closes it.
 */
function pendingAudit(cwd) {
  const dir = path.join(cwd, '.workteam', 'runs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)); } catch { return null; }
  let open = null;
  const events = files.flatMap((file) => readLedger(file).map((e) => ({ ...e, file: path.relative(cwd, file) })));
  for (const e of events.sort((a, b) => String(a.t).localeCompare(String(b.t)))) {
    if (e.ev === 'audit-gate' && /^(pending|ignored)$/.test(e.why)) open = e;
    else if ((e.ev === 'audit-gate' && /^(audited|waived)$/.test(e.why)) || (e.ev === 'agent' && e.phase === 'stop' && /auditor/.test(e.role || ''))) open = null;
  }
  return open;
}

module.exports = { ledgerFile, record, readLedger, summary, previousLedger, pendingAudit };
