#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { check, render, schema } = require('./findings');

const finding = (over = {}) => ({
  severity: 'Important', lens: 'B', contract_item: 'criterion 2', where: 'src/export.js:3',
  what: 'Values with commas are written unquoted. The row splits.', why_load_bearing: 'Excel shows shifted columns.',
  what_closes_it: 'Quote per RFC 4180.', calibration: 'checked', confidence: 90, ...over,
});
const doc = { reviewer: 'auditor', subject: '.workteam/audit/x.change.md', findings: [finding(), finding({ severity: 'Minor', confidence: 40 })], verified: ['criterion 3: owner check present'] };

check(doc, schema, 'findings');
const md = render(doc, 80);
assert.ok(md.includes('1 finding(s) at confidence ≥ 80: 0 Critical, 1 Important, 0 Minor.'), md);
assert.ok(md.includes('### [Important] (Lens B) Values with commas are written unquoted.'), md);
assert.ok(md.includes('## Below the confidence cutoff (80)') && md.includes('confidence 40'), 'low-confidence findings stay visible');
assert.ok(md.includes('- criterion 3: owner check present'));
for (const [bad, why] of [
  [{ ...doc, findings: [finding({ severity: 'High' })] }, /not one of/],
  [{ ...doc, findings: [finding({ confidence: 101 })] }, /out of range/],
  [{ ...doc, extra: 1 }, /unknown property/],
  [{ reviewer: 'auditor', subject: 'x', findings: [] }, /missing verified/],
]) assert.throws(() => check(bad, schema, 'findings'), why);
console.log('findings: schema check, rendering and confidence cutoff passed');
