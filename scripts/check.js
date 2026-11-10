#!/usr/bin/env node
/**
 * Consistency checks for the workteam plugin. Run from the plugin root:
 *
 *   node scripts/check.js
 *
 * Exit code 0 = every check passed; 1 = at least one failed (each failure is
 * printed). The plugin is prompts and manifests, so these are the regressions
 * that matter: a manifest that does not parse, a version that drifted between
 * manifests, a contract template whose version or size drifted, a hook that
 * emits invalid JSON, a skill (plugin or library) whose frontmatter does not
 * match its directory, a reference to a skill that no longer exists or to a library
 * skill outside skill-curation, a repository skill link that does not resolve, a leftover
 * path into the removed memory store, a reference to the pre-2.2 docs layout, a
 * hook that fails its smoke run or its scenario file, or Codex role files out of
 * sync with the markdown agents they are generated from.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Recursively list files under a directory (relative paths, forward slashes). */
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

// 1. Manifests parse and agree on the version.
const manifests = [...(fs.existsSync(path.join(root, 'plugin.json')) ? ['plugin.json'] : []), '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.codex-plugin/plugin.json', 'hooks/hooks.json'];
const versions = {};
for (const m of manifests) {
  try {
    const j = JSON.parse(read(m));
    if (m.endsWith('marketplace.json')) versions[m] = j.plugins[0].version;
    else if (j.version) versions[m] = j.version;
  } catch (e) {
    fail(`${m}: does not parse — ${e.message}`);
  }
}
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) fail(`version mismatch across manifests: ${JSON.stringify(versions)}`);

// 2. The contract template carries the plugin version in its opening marker and stays
// within its budget: the block is copied into every onboarded AGENTS.md and read in
// every session there. The SessionStart scenarios live in scripts/test-hooks.js.
const template = read('templates/AGENTS.md');
const block = template.match(/^<!-- workteam:contract v([\d.]+)[\s\S]*?<!-- \/workteam:contract -->/);
if (!block) fail('templates/AGENTS.md: contract markers missing or not at the top');
else {
  if (block[1] !== versions['.claude-plugin/plugin.json']) fail(`templates/AGENTS.md: contract v${block[1]} != plugin version`);
  if (block[0].split(/\s+/).length > 1200) fail('templates/AGENTS.md: contract block exceeds the 1200-word budget');
}
if (read('templates/CLAUDE.md').trim() !== '@AGENTS.md') fail('templates/CLAUDE.md: must be the single line @AGENTS.md');
if (fs.existsSync(path.join(root, 'core'))) fail('core/: removed in 3.0 — the rules live in templates/AGENTS.md');

// 2b. Every PreToolUse hook survives a smoke run, and the scenario file is green.
// A hook that throws on load (a syntax error, a missing require) is invisible
// here but shows up as a "hook error" notice on every Bash call in every
// session, so the repo's single gate has to catch it. The stdin below carries a
// command no hook matches: the whole contract for it is silence — exit 0 and an
// empty stdout. `cwd` is omitted on purpose; the helper falls back to the
// child's own working directory.
const smokeStdin = '{"tool_name":"Bash","tool_input":{"command":"ls"}}';
/** First non-empty line of a failed child's output, for a one-line failure. */
const firstLine = (e) => {
  const text = `${e.stdout || ''}\n${e.stderr || ''}`;
  return text.split(/\r?\n/).find((l) => l.trim()) || e.message;
};
const hookFiles = fs.readdirSync(path.join(root, 'hooks')).filter((f) => f.endsWith('.js'));
for (const f of hookFiles.filter((h) => h !== 'session-start.js')) {
  const rel = `hooks/${f}`;
  try {
    const out = execFileSync('node', [path.join(root, rel)], { input: smokeStdin, encoding: 'utf8' });
    if (out !== '') fail(`${rel}: smoke run with a non-matching command failed / printed output`);
  } catch (e) {
    fail(`${rel}: smoke run with a non-matching command failed / printed output — ${firstLine(e)}`);
  }
}
// The scenarios themselves are the real contract test; check.js runs the
// harness and reports however many scenarios it says passed, so adding one
// needs no edit here.
let hookScenarios = '?';
try {
  const out = execFileSync('node', [path.join(root, 'scripts', 'test-hooks.js')], { encoding: 'utf8' });
  const m = out.match(/(\d+) passed/);
  if (m) hookScenarios = m[1];
} catch (e) {
  fail(`scripts/test-hooks.js: ${firstLine(e)}`);
}

// 3. Skill and agent frontmatter.
const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
};
const dirsOf = (top) => fs.readdirSync(path.join(root, top), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const skillDirs = dirsOf('skills');
// library/ holds skills a project installs through skill-curation; no host scans it, so a
// library skill also carries the provenance skill-curation copies into the project.
const libraryDirs = dirsOf('library');
for (const [top, names] of [['skills', skillDirs], ['library', libraryDirs]]) {
  for (const name of names) {
    const p = `${top}/${name}/SKILL.md`;
    if (!fs.existsSync(path.join(root, p))) { fail(`${p}: missing`); continue; }
    const fm = frontmatter(read(p));
    if (!fm) { fail(`${p}: no frontmatter`); continue; }
    if (fm.name !== name) fail(`${p}: frontmatter name "${fm.name}" != directory "${name}"`);
    if (!('description' in fm)) fail(`${p}: no description`);
    if (top === 'library' && (!fm.license || !/\n {2}source: \S/.test(read(p)))) fail(`${p}: library skill needs license and metadata.source`);
    if (top === 'library' && skillDirs.includes(name)) fail(`${p}: also a plugin skill`);
  }
}
// The repository's own skills: .agents/skills (Codex) and .claude/skills (Claude Code). This repository
// keeps core.symlinks=false, so the second is a copy, and the two must not drift apart.
for (const name of fs.existsSync(path.join(root, '.claude/skills')) ? fs.readdirSync(path.join(root, '.claude/skills')) : []) {
  const claude = path.join(root, '.claude/skills', name, 'SKILL.md'), agents = path.join(root, '.agents/skills', name, 'SKILL.md');
  if (!fs.existsSync(claude)) fail(`.claude/skills/${name}: no SKILL.md (a link checked out as a plain file?)`);
  else if (fs.existsSync(agents) && fs.readFileSync(claude, 'utf8') !== fs.readFileSync(agents, 'utf8')) fail(`.claude/skills/${name}: differs from .agents/skills/${name}`);
}
const agentFiles = fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md'));
for (const f of agentFiles) {
  const text = read(`agents/${f}`);
  const fm = frontmatter(text);
  const expected = f.replace(/\.md$/, '');
  if (!fm) { fail(`agents/${f}: no frontmatter`); continue; }
  if (fm.name !== expected) fail(`agents/${f}: frontmatter name "${fm.name}" != "${expected}"`);
  // Skills are loaded on demand from one registry in the prompt, in both hosts.
  if (fm.skills) fail(`agents/${f}: skills frontmatter preloads bodies; use On-demand skills`);
  const section = text.match(/\n## On-demand skills\n([\s\S]*?)(\n## |$)/);
  const names = section ? [...section[1].matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]) : [];
  // auditor reads no skills by design (blind review).
  const skillless = expected === 'auditor';
  if (!skillless && !names.length) fail(`agents/${f}: missing on-demand skill registry`);
  if (skillless && names.length) fail(`agents/${f}: ${expected} must not load skills`);
  if (new Set(names).size !== names.length) fail(`agents/${f}: duplicate skill`);
  for (const name of names) if (!skillDirs.includes(name)) fail(`agents/${f}: unknown skill ${name}`);
}

// 4. No references to removed skills, the old memory store,  — anywhere outside docs/ and evals/.
const removed = ['feature-flow', 'writing-plans', 'receiving-code-review', 'project-claude-md', 'codebase-design', 'workteam:retro', 'workteam:wizard',
  'service-design', 'deploy-checklist', 'observability-and-instrumentation', 'workteam:adr', 'workteam:design', 'workteam:status'];
const forbidden = [/obsidianFolder/i, /\bvault\b/i, /core[\\/]core\.md/];
const scanned = ['templates', 'agents', 'skills', 'commands', 'hooks', 'README.md', 'AGENTS.md', '.claude-plugin', '.codex-plugin'];
for (const top of scanned) {
  const files = fs.statSync(path.join(root, top)).isDirectory() ? walk(top) : [top];
  for (const f of files) {
    if (/\.(png|jpg|gif)$/i.test(f)) continue;
    const text = read(f);
    for (const r of removed) {
      const re = new RegExp(`(^|[^a-z0-9-])${r.replace(/[-]/g, '\\-')}([^a-z0-9-]|$)`, 'i');
      if (re.test(text)) fail(`${f}: references removed skill "${r}"`);
    }
    for (const re of forbidden) if (re.test(text)) fail(`${f}: matches forbidden pattern ${re}`);
  }
}

// 4b. Library skills are named only by skill-curation: elsewhere a plugin file would point an
//     agent at a skill that is not installed in the project.
for (const f of walk('skills').filter((s) => s.endsWith('.md') && !s.startsWith('skills/skill-curation/'))) {
  for (const name of libraryDirs) if (read(f).includes(`\`${name}\``)) fail(`${f}: names library skill "${name}" — only skill-curation does`);
}

// 5. Every skill named in the contract template, the agents and the commands exists.
const known = new Set(skillDirs);
const agentNames = agentFiles.map((a) => a.replace(/\.md$/, ''));
for (const f of ['templates/AGENTS.md', ...agentFiles.map((a) => `agents/${a}`), ...fs.readdirSync(path.join(root, 'commands')).map((c) => `commands/${c}`)]) {
  const text = read(f);
  for (const m of text.matchAll(/`([a-z][a-z0-9-]+)`/g)) {
    const tok = m[1];
    // Only tokens that look like skill names and are not agent names / tiers / common words.
    if (agentNames.includes(tok)) continue;
    if (['lead', 'routine', 'standard', 'strong', 'strongest', 'lean', 'ок', 'docs', 'sonnet', 'opus', 'haiku', 'fable'].includes(tok)) continue;
    // The tail of the list — hook and script names the contract, agents and commands
    // cite in backticks after 2.2.0; they are files, not skills.
    if (tok.includes('-') && !known.has(tok) && !['project-onboarding', 'model-per-task', 'in-progress', 'read-only', 'ok-we', 'plugin-root', 'secret-scan', 'workteam-ignored', 'interview-gate', 'audit-gate', 'test-hooks', 'git-guard'].includes(tok)) {
      // Names with a hyphen are almost always skills; flag unknown ones.
      fail(`${f}: names unknown skill-like token \`${tok}\``);
    }
  }
}

// 6. Validate generated roles without mutating the working tree.
try {
  execFileSync('node', [path.join(root, 'scripts', 'build-codex-agents.js'), '--check'], { encoding: 'utf8' });
} catch (e) { fail(`codex roles out of sync: ${firstLine(e)}`); }

// Executable packaging and Git-hook contracts, exercised in isolated repositories.
for (const script of ['test-audit-package.js', 'test-staged-check.js', 'test-shared-hooks.js', 'test-eval-report.js', 'test-findings.js', 'test-plan-status.js', 'test-audit-run.js', 'test-audit-cli.js', 'test-public-export.js']) {
  try { execFileSync('node', [path.join(root, 'scripts', script)], { encoding: 'utf8' }); }
  catch (e) { fail(`${script}: ${firstLine(e)}`); }
}
for (const hook of hookFiles) {
  if (read(`hooks/${hook}`).trimEnd().split('\n').length > 60) fail(`hooks/${hook}: entry point exceeds 60 lines`);
}

// 7. No references to the pre-2.2 docs layout.
//    The 2.2 layout replaced `docs/architecture`, `docs/research`, `docs/status.md`
//    and `.workteam/plans`; a returned old path now fails this command instead of
//    waiting for a reader to notice it. Same `scanned` set as section 4 — `scripts/`
//    and `docs/` stay out on purpose: this file and `scripts/test-hooks.js` carry the
//    old paths as pattern strings, and `docs/` holds the project's own history.
const pre22 = [/docs[\\/]architecture/, /docs[\\/]research/, /docs[\\/]status\.md/, /\.workteam[\\/]plans/];
// The onboarding skill's migration reference is the one place the old paths are required —
// it tells the reader what to move — so that one file is skipped; every other file is scanned.
const migrationFile = 'skills/project-onboarding/migration-2.2.md';
if (!fs.existsSync(path.join(root, migrationFile))) fail(`${migrationFile}: missing — onboarding points to it`);
for (const top of scanned) {
  const files = fs.statSync(path.join(root, top)).isDirectory() ? walk(top) : [top];
  for (const f of files) {
    if (/\.(png|jpg|gif)$/i.test(f) || f === migrationFile) continue;
    const text = read(f);
    for (const re of pre22) {
      const m = text.match(re);
      if (m) fail(`${f}: references pre-2.2 path "${m[0]}"`);
    }
  }
}

// Report.
if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok: ${manifests.length} manifests, contract template, hooks (${hookScenarios} scenarios), audit package, staged Git check, eval records, ${skillDirs.length} skills + ${libraryDirs.length} in library, ${agentFiles.length} agents, pre-2.2 paths, codex roles in sync`);
