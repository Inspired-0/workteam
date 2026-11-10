'use strict';
const fs = require('fs');

/** The strings of a tool input, one per line, so its lines can be matched like text. */
const strings = (v) => typeof v === 'string' ? v : v && typeof v === 'object' ? Object.values(v).map(strings).filter(Boolean).join('\n') : '';

/**
 * A session transcript as ordered { role, text } entries, for hooks that check what the user
 * actually wrote. Claude Code and Codex both write JSONL, in shapes neither host promises to
 * keep, so both are read loosely. User entries are only what a person typed, including a message
 * queued mid-turn: not tool results, subagent reports, compaction summaries, copies of API
 * requests, or context the host injects in <tags> or as AGENTS.md instructions. Agent entries are
 * its text and its tool inputs, so a file it wrote is found by name. The array's `subagent` flag
 * marks a Codex subagent's own transcript (`session_meta` with a `subagent` source).
 */
function entries(file) {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  out.subagent = false;
  for (const line of raw.split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e && e.type === 'session_meta') out.subagent = Boolean(e.payload && e.payload.source && e.payload.source.subagent);
    if (!e || e.isMeta || e.isCompactSummary || (e.origin && e.origin.kind !== 'human')) continue;
    const queued = e.type === 'attachment' && e.attachment && e.attachment.type === 'queued_command';
    if (queued && (e.attachment.origin || {}).kind === 'human') { out.push({ role: 'user', text: String(e.attachment.prompt || '') }); continue; }
    if (e.message && !/^(user|assistant)$/.test(e.type)) continue;
    const m = e.payload || e.message || {};
    if (/^(function_call|custom_tool_call)$/.test(m.type)) {
      let args = m.arguments ?? m.input;
      try { args = JSON.parse(args); } catch { /* a raw patch */ }
      out.push({ role: 'assistant', text: strings(args) });
      continue;
    }
    const role = m.role || (m.type === 'user_message' ? 'user' : e.type);
    if (role !== 'user' && role !== 'assistant') continue;
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }]
      : Array.isArray(m.content) ? m.content : typeof m.message === 'string' ? [{ type: 'text', text: m.message }] : [];
    for (const b of blocks) {
      if (b.type === 'tool_use') out.push({ role: 'assistant', text: strings(b.input) });
      else if (typeof b.text === 'string' && /^(text|input_text|output_text)$/.test(b.type)
        && !(role === 'user' && /^\s*(<|# AGENTS\.md instructions)/.test(b.text))) out.push({ role, text: b.text });
    }
  }
  return out;
}

/** Text folded for matching whole quoted words: case, ё, quotes, backticks, slashes, punctuation, spacing. */
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„'`.,!?;:()/\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** The first «…» or "…" quotation in a line. */
const quote = (s) => (/[«"“]([^»"”]+)[»"”]/.exec(String(s || '')) || [])[1] || '';

/** Whether a person typed these words (whole words) in a user entry after index `after`. */
const userSaid = (log, words, after = -1) => {
  const w = ` ${norm(words)} `;
  return w.length > 3 && log.some((e, i) => i > after && e.role === 'user' && ` ${norm(e.text)} `.includes(w));
};

module.exports = { entries, norm, quote, userSaid };
