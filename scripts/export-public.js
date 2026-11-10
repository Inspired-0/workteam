#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { checkPublic } = require('./check-public');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
function safeFile(base, relative) {
  if (!relative || path.posix.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '..' || p === '.'))
    throw Error('invalid export path');
  let current = base;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error(`symlink in export: ${relative}`);
  }
  if (!fs.statSync(current).isFile()) throw Error(`not a regular file: ${relative}`);
  return current;
}
function exportPublic(destination, repository) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository || '')) throw Error('provide --repository OWNER/REPO');
  const dest = path.resolve(destination);
  if (fs.existsSync(dest)) throw Error('destination must not exist; export into a fresh directory');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = fs.mkdtempSync(path.join(path.dirname(dest), '.workteam-export-'));
  const files = JSON.parse(fs.readFileSync(safeFile(root, '.public-files.json'), 'utf8'));
  try {
    for (const file of files) {
      const overlay = path.join(root, 'distribution', 'public');
      const relative = fs.existsSync(path.join(overlay, file)) ? `distribution/public/${file}` : file;
      const src = safeFile(root, relative), target = path.join(temp, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
      fs.chmodSync(target, fs.statSync(src).mode & 0o111 ? 0o755 : 0o644);
    }
    const load = p => JSON.parse(fs.readFileSync(path.join(temp, p), 'utf8'));
    const save = (p, value) => fs.writeFileSync(path.join(temp, p), JSON.stringify(value, null, 2) + '\n');
    const author = { name: 'Workteam contributors' };
    const url = `https://github.com/${repository}`;
    const claude = load('.claude-plugin/plugin.json');
    Object.assign(claude, { author, homepage: url, repository: url, icon: './assets/icon.png' });
    save('.claude-plugin/plugin.json', claude);
    const codex = load('.codex-plugin/plugin.json');
    Object.assign(codex, { author, homepage: url, repository: url });
    Object.assign(codex.interface, { developerName: author.name, shortDescription: 'Project workflow and reviews',
      category: 'Developer Tools', logo: './assets/icon.png', composerIcon: './assets/icon.png' });
    save('.codex-plugin/plugin.json', codex);
    save('.claude-plugin/marketplace.json', { name: 'workteam-public', owner: author,
      description: 'Public Workteam releases for Claude Code and Codex',
      plugins: [{ name: 'workteam', source: './', description: 'Project workflow, agent roles and review gates', version: claude.version }] });
    const license = path.join(temp, 'LICENSE');
    fs.writeFileSync(license, fs.readFileSync(license, 'utf8').replace('Copyright (c) 2026 user', 'Copyright (c) 2026 Workteam contributors'));
    checkPublic(temp);
    fs.renameSync(temp, dest);
    console.log(`exported ${files.length} reviewed paths`);
  } catch (err) { fs.rmSync(temp, { recursive: true, force: true }); throw err; }
}
if (require.main === module) {
  try {
    if (process.argv.length !== 5 || process.argv[3] !== '--repository') throw Error('usage: node scripts/export-public.js NEW_DIRECTORY --repository OWNER/REPO');
    exportPublic(process.argv[2], process.argv[4]);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { safeFile, exportPublic };
