#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

/** Validate review findings against schemas/findings.schema.json and render the Markdown the
 * lead adjudicates. Findings under the confidence cutoff stay visible in their own section:
 * the cutoff orders attention, it does not delete a finding.
 * Usage: findings.js FILE.json [--min-confidence 80] [--out FILE.md]
 */
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'findings.schema.json'), 'utf8'));
function check(value, s, at) {
  if (s.enum && !s.enum.includes(value)) throw Error(`${at}: ${JSON.stringify(value)} is not one of ${s.enum.join(', ')}`);
  const kind = Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (s.type && s.type !== kind && !(s.type === 'object' && kind === 'object' && value !== null)) throw Error(`${at}: expected ${s.type}, got ${kind}`);
  if (s.type === 'integer' && ((s.minimum !== undefined && value < s.minimum) || (s.maximum !== undefined && value > s.maximum))) throw Error(`${at}: ${value} out of range`);
  if (s.type === 'array') value.forEach((v, i) => check(v, s.items, `${at}[${i}]`));
  if (s.type === 'object') {
    for (const key of s.required || []) if (!(key in value)) throw Error(`${at}: missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!s.properties[key]) throw Error(`${at}: unknown property ${key}`);
      check(value[key], s.properties[key], `${at}.${key}`);
    }
  }
}

function render(doc, cutoff) {
  const order = ['Critical', 'Important', 'Minor'];
  const sorted = [...doc.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.confidence - a.confidence);
  const main = sorted.filter((f) => f.confidence >= cutoff), low = sorted.filter((f) => f.confidence < cutoff);
  const count = (sev) => main.filter((f) => f.severity === sev).length;
  const claim = (f) => f.what.split(/(?<=\.)\s/)[0].slice(0, 160);
  const out = [`# Findings: ${doc.subject} (${doc.reviewer})`, '',
    `${main.length} finding(s) at confidence ≥ ${cutoff}: ${count('Critical')} Critical, ${count('Important')} Important, ${count('Minor')} Minor.`, ''];
  for (const f of main) {
    out.push(`### [${f.severity}] (Lens ${f.lens}) ${claim(f)}`, '',
      `**Contract item:** ${f.contract_item}`, `**Where:** ${f.where}`, `**What:** ${f.what}`,
      `**Why load-bearing:** ${f.why_load_bearing}`, `**What closes it:** ${f.what_closes_it}`,
      `**Calibration:** ${f.calibration}, confidence ${f.confidence}`, '');
  }
  if (low.length) out.push(`## Below the confidence cutoff (${cutoff})`, '', ...low.map((f) => `- [${f.severity}] (Lens ${f.lens}) ${claim(f)} — ${f.where}; ${f.calibration}, confidence ${f.confidence}`), '');
  if (doc.verified.length) out.push('## Verified, no finding', '', ...doc.verified.map((v) => `- ${v}`), '');
  return out.join('\n');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
    const cutoff = Number(opt('--min-confidence', '80')), outFile = opt('--out', null);
    if (args.length !== 1 || !Number.isFinite(cutoff)) throw Error('usage: findings.js FILE.json [--min-confidence 80] [--out FILE.md]');
    const doc = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    check(doc, schema, 'findings');
    const md = render(doc, cutoff);
    if (outFile) fs.writeFileSync(outFile, md); else process.stdout.write(md);
  } catch (err) { console.error('findings: ' + err.message); process.exitCode = 1; }
}
module.exports = { check, render, schema };
