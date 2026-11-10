#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Summarize `claude plugin eval` results: per case with/without and Δ, per tag (seeded-defect =
 * defect recall, should-not-fire = no ceremony and no false alarm, should-fire = gate behaviour),
 * gate indicators (with-only graders), cost per arm, unstable cases and run errors. Several
 * aggregate-result.json files merge by case, so disputed cases can be rerun and added.
 * Usage: eval-report.js RESULT.json [RESULT.json ...]
 */
function tagsOf(dir) {
  try { return ((/^tags:\s*\[(.*)\]\s*$/m.exec(fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8')) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean); }
  catch { return []; }
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (x) => (x === null ? '  —  ' : x.toFixed(2));
const signed = (x) => (x === null ? '  —  ' : (x >= 0 ? '+' : '') + x.toFixed(2));

function report(files) {
  const cases = new Map(), meta = [], seen = new Set(), setups = new Set();
  for (const file of files) {
    const real = fs.realpathSync(file);
    if (seen.has(real)) throw Error(`${file}: given twice`); seen.add(real);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (doc.schemaVersion !== 1 || !Array.isArray(doc.cases)) throw Error(`${file}: not a plugin eval result (schemaVersion 1)`);
    // Runs merge only when host and plugin match: otherwise a version change would read as plugin effect.
    const suite = doc.suite || {};
    const plugin = (suite.plugins || []).map((p) => `${p.name}@${p.version}`).join(',') || 'unknown';
    setups.add(`Claude Code ${doc.claudeVersion}, ${plugin}, model ${suite.model || 'default'}, judge ${suite.judgeModel || 'default'}`);
    meta.push(`${path.basename(path.dirname(file))}: Claude Code ${doc.claudeVersion}, ${plugin}, $${(doc.costUsd || 0).toFixed(2)}${doc.partial ? `, PARTIAL (${doc.partialReason})` : ''}`);
    for (const c of doc.cases) {
      // A case merges only with the same prompt and graders: an edited case is a different case.
      const identity = crypto.createHash('sha256').update(String(c.promptMarkdown) + JSON.stringify(c.graders || [])).digest('hex');
      const entry = cases.get(c.name) || { name: c.name, identity, tags: tagsOf(c.dir), with: [], without: [] };
      if (entry.identity !== identity) throw Error(`case ${c.name} has a different prompt or graders in ${file}; compare the results separately`);
      entry.with.push(...(c.arms.with || [])); entry.without.push(...(c.arms.without || []));
      cases.set(c.name, entry);
    }
  }
  const out = ['workteam eval report', ...meta.map((m) => `  ${m}`), '',
    'case                          with   w/out   Δ      runs   note'];
  const byTag = new Map(), indicators = new Map(), errors = [];
  let costWith = 0, costWithout = 0;
  if (setups.size > 1) throw Error(`results come from different setups, compare them separately: ${[...setups].join(' | ')}`);
  for (const c of cases.values()) {
    const w = mean(c.with.map((r) => r.score)), wo = mean(c.without.map((r) => r.score));
    const unstable = [c.with, c.without].some((runs) => new Set(runs.map((r) => r.score)).size > 1);
    for (const r of [...c.with, ...c.without]) if (r.error) errors.push(`${c.name}: ${r.error}`);
    costWith += c.with.reduce((a, r) => a + (r.costUsd || 0), 0); costWithout += c.without.reduce((a, r) => a + (r.costUsd || 0), 0);
    for (const r of c.with) for (const g of r.graders || []) if (g.withOnly) {
      const k = `${c.name}/${g.name}`, v = indicators.get(k) || [0, 0]; v[0] += g.passed ? 1 : 0; v[1] += 1; indicators.set(k, v);
    }
    const delta = w === null || wo === null ? null : w - wo;
    for (const t of c.tags) { const v = byTag.get(t) || { w: [], wo: [] }; if (delta !== null) { v.w.push(w); v.wo.push(wo); } byTag.set(t, v); }
    const note = delta === null ? 'missing arm: no comparison' : unstable ? 'unstable: runs disagree' : '';
    out.push(`${c.name.padEnd(30)}${fmt(w)}   ${fmt(wo)}   ${signed(delta)}  ${String(c.with.length).padStart(2)}/${String(c.without.length).padEnd(2)}  ${note}`);
  }
  out.push('', 'by tag (mean with / without, Δ):');
  const label = { 'seeded-defect': 'defect found', 'should-not-fire': 'no ceremony, no false alarm', 'should-fire': 'gate behaviour' };
  for (const [t, v] of [...byTag].sort()) {
    const w = mean(v.w), wo = mean(v.wo);
    out.push(`  ${t.padEnd(16)} ${fmt(w)} / ${fmt(wo)}  ${signed(wo === null ? null : w - wo)}${label[t] ? `  — ${label[t]}` : ''}`);
  }
  if (indicators.size) out.push('', 'gate indicators (graded with-plugin runs where the gate fired):', ...[...indicators].map(([k, [p, n]]) => `  ${k}: ${p}/${n}`));
  const all = [...cases.values()];
  const suiteDelta = mean(all.filter((c) => c.with.length && c.without.length).map((c) => mean(c.with.map((r) => r.score)) - mean(c.without.map((r) => r.score))));
  out.push('', `suite: mean Δ ${signed(suiteDelta)}; cost with $${costWith.toFixed(2)}, without $${costWithout.toFixed(2)}` +
    (costWithout ? ` (${costWith >= costWithout ? '+' : ''}${(((costWith - costWithout) / costWithout) * 100).toFixed(0)}%)` : ''));
  out.push('noise: a suite Δ under 0.03 is noise; with few runs per arm one run moves a case by 1/runs, so read only large, stable case differences.');
  if (errors.length) out.push('', `run errors (${errors.length}):`, ...errors.map((e) => `  ${e}`));
  return out.join('\n');
}

if (require.main === module) {
  try {
    if (process.argv.length < 3) throw Error('usage: eval-report.js RESULT.json [RESULT.json ...]');
    console.log(report(process.argv.slice(2)));
  } catch (err) { console.error('eval-report: ' + err.message); process.exitCode = 1; }
}
module.exports = { report };
