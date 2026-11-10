'use strict';
const fs = require('fs');
const path = require('path');
const { record, readLedger, summary, ledgerFile, previousLedger, pendingAudit } = require('./ledger');

/**
 * Whether Claude Code sessions in `dir` miss the contract. Claude Code reads AGENTS.md
 * directly when no CLAUDE.md or CLAUDE.local.md exists in the root or a parent directory;
 * once one exists, the root CLAUDE.md must import it. Returns a warning or null.
 */
function claudeImportWarning(dir) {
  const own = (name) => { try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return null; } };
  const claude = own('CLAUDE.md');
  if (claude !== null) return /^@AGENTS\.md\s*$/m.test(claude) ? null : 'CLAUDE.md does not import `@AGENTS.md`: Claude Code sessions here miss the contract — run `project-onboarding`.';
  let shadow = own('CLAUDE.local.md') !== null ? 'CLAUDE.local.md' : null;
  for (let up = path.dirname(dir); !shadow && up !== path.dirname(up); up = path.dirname(up)) {
    shadow = ['CLAUDE.md', 'CLAUDE.local.md'].map((n) => path.join(up, n)).find((p) => fs.existsSync(p)) || null;
  }
  return shadow ? `${shadow} exists, so Claude Code does not read AGENTS.md by itself: add a root CLAUDE.md with the single line \`@AGENTS.md\`.` : null;
}

/** An active plan's line, with its task status when docs/plans/active/<feature>.tasks.json exists. */
function planLine(dir, file) {
  const tasks = path.join(dir, 'docs', 'plans', 'active', file.replace(/\.md$/, '.tasks.json'));
  if (!fs.existsSync(tasks)) return `- docs/plans/active/${file}`;
  try {
    const { load, summary } = require('../../scripts/plan-status');
    return `- docs/plans/active/${file} — ${summary(load(tasks))}`;
  } catch (err) { return `- docs/plans/active/${file} — task file unreadable: ${err.message}`; }
}

/** Keep the context under the host limits (Claude Code spills a value over 10,000 characters). */
function cap(text, limit = 9000) {
  if (text.length <= limit) return text;
  const notice = `\n… truncated at ${limit} characters — keep docs/CURRENT_STATE.md short.`;
  return text.slice(0, limit - notice.length) + notice;
}

/**
 * A skill `skill-curation` installed (its frontmatter records `source:`) lives as two equal copies,
 * .agents/skills/<name> for Codex and .claude/skills/<name> for Claude Code. A link to the first
 * copy reads as equal; a link checked out as a plain file does not. Returns a warning or null.
 */
function skillCopiesWarning(dir) {
  const roots = ['.agents/skills', '.claude/skills'].map((r) => path.join(dir, r));
  const list = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
  const tree = (p) => {
    let st;
    try { st = fs.statSync(p); } catch { return 'missing'; }
    return st.isDirectory() ? list(p).sort().map((n) => `${n}\n${tree(path.join(p, n))}`).join('\n') : 'file:' + fs.readFileSync(p, 'utf8');
  };
  const installed = (name) => roots.some((r) => {
    try { return /^\s+source:/m.test((/^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(path.join(r, name, 'SKILL.md'), 'utf8')) || [])[1] || ''); } catch { return false; }
  });
  const differ = [...new Set(roots.flatMap(list))].filter((n) => installed(n) && tree(path.join(roots[0], n)) !== tree(path.join(roots[1], n)));
  return differ.length ? `Installed skill copies differ between .agents/skills and .claude/skills: ${differ.sort().join(', ')} — copy the reviewed one over the other (\`skill-curation\`).` : null;
}

/**
 * The run ledger at a session start: records the start, then sums up this session's ledger after
 * a compaction or resume, or the previous session's on a fresh start. A line, or null when empty.
 */
function runsLine(dir, sessionId, source) {
  record(dir, sessionId, { ev: 'session', source: source || 'startup' });
  const open = pendingAudit(dir);
  const reminder = open && `Audit pending since ${String(open.t).slice(0, 16).replace('T', ' ')} UTC (${open.reason || 'no reason given'}): ${(open.changed || []).slice(0, 5).join(', ') || 'files not recorded'}${(open.changed || []).length > 5 ? ` and ${open.changed.length - 5} more (all in ${open.file})` : ''}. Run \`blind-audit\`; if the user decides it is not needed, end a message with «Audit: waived — «their words»».`;
  const own = readLedger(ledgerFile(dir, sessionId)).filter((e) => e.ev !== 'session');
  let line = null;
  if (source === 'compact' || source === 'resume') line = `This session so far: ${summary(own)}.`;
  else {
    const previous = previousLedger(dir, sessionId);
    const events = previous ? readLedger(previous).filter((e) => e.ev !== 'session') : [];
    if (events.length) line = `Last session (${events[events.length - 1].t.slice(0, 16).replace('T', ' ')} UTC, ${path.relative(dir, previous)}): ${summary(events)}.`;
  }
  return [line, reminder].filter(Boolean).join('\n') || null;
}

module.exports = { claudeImportWarning, planLine, cap, skillCopiesWarning, runsLine };
