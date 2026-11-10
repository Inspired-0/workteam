#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

function filesUnder(root, dir = '', files = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (rel === '.git') continue;
    if (entry.isSymbolicLink()) throw Error(`symlink: ${rel}`);
    if (entry.isDirectory()) filesUnder(root, rel, files);
    else if (entry.isFile()) files.push(rel);
    else throw Error(`non-regular entry: ${rel}`);
  }
  return files.sort();
}
function checkPublic(root, denylist = []) {
  root = fs.realpathSync(root);
  const allowed = JSON.parse(fs.readFileSync(path.join(root, '.public-files.json'), 'utf8'));
  if (!Array.isArray(allowed) || new Set(allowed).size !== allowed.length || allowed.some(f => typeof f !== 'string' || !/^[.A-Za-z0-9_/-]+$/.test(f) || f.split('/').some(x => x === '..' || !x)))
    throw Error('invalid public file list');
  const files = filesUnder(root);
  const extra = files.filter(f => !allowed.includes(f));
  const missing = allowed.filter(f => !files.includes(f));
  if (extra.length || missing.length) throw Error(`public file list mismatch: ${extra.length} extra, ${missing.length} missing`);
  const checks = [
    ['home-directory', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[A-Za-z0-9_.-]+/i],
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
    ['api-token', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/],
    ['credential-url', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ];
  for (const file of files) {
    if (/(^|\/)(?:\.env(?:\.|$)|auth\.json$|credentials(?:\.|$)|id_rsa$|id_ed25519$|\.DS_Store$)|\.(pem|p12|pfx|key|jsonl)$/i.test(file))
      throw Error(`sensitive filename: ${file}`);
    if (file.startsWith('evals-real/') || file.startsWith('.workteam/')) throw Error(`private artifact: ${file}`);
    const data = fs.readFileSync(path.join(root, file));
    if (file === 'assets/icon.png') {
      // Only this reviewed metadata-free asset may bypass text scanning. Review a replacement
      // image and its metadata before updating this digest; arbitrary PNGs are not trusted.
      const approved = '50991f64728162975b715c120d52f281ebdea8a3e4852145245e4a548bcc0bf0';
      if (createHash('sha256').update(data).digest('hex') !== approved) throw Error('unreviewed PNG bytes');
      continue;
    }
    if (data.includes(0) || data.toString('utf8').includes('\ufffd')) throw Error(`unexpected binary or invalid UTF-8: ${file}`);
    const text = data.toString('utf8');
    for (const [label, re] of checks) if (re.test(text)) throw Error(`${file}: ${label}`);
    for (let i = 0; i < denylist.length; i++) {
      if (denylist[i] && (text.toLowerCase().includes(denylist[i].toLowerCase()) || file.toLowerCase().includes(denylist[i].toLowerCase())))
        throw Error(`${file}: private identity pattern ${i + 1}`);
    }
  }
  const manifests = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].map(p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8')));
  if (new Set(manifests.map(m => m.version)).size !== 1 || manifests.some(m => m.name !== 'workteam' || m.author.name !== 'Workteam contributors')) throw Error('public manifest identity mismatch');
  if (manifests[1].interface.shortDescription.length > 30) throw Error('subtitle too long');
  return files.length;
}
if (require.main === module) {
  try {
    const root = process.argv[2] || path.resolve(__dirname, '..');
    const denylist = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [];
    console.log(`public check: ${checkPublic(root, denylist)} allowed files; no detected private patterns`);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { checkPublic, filesUnder };
