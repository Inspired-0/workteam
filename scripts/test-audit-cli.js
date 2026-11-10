'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync, execFileSync } = require('child_process');
const os = require('os');
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-audit-cli-'));
const target = path.resolve(__dirname, '..');
try {
const repo = path.join(scratch, 'audit-project');
const bin = path.join(scratch, 'host-shims');
fs.rmSync(repo, { recursive: true, force: true });
for (const key of ['package', 'contract', 'evidence']) fs.mkdirSync(path.join(repo, '.workteam/audit', key), { recursive: true });
fs.mkdirSync(bin, { recursive: true });
fs.writeFileSync(path.join(repo, '.gitignore'), '.workteam/\n');
fs.writeFileSync(path.join(repo, 'product.js'), 'const result = 1;\n');
fs.writeFileSync(path.join(repo, '.workteam/audit/package/input.md'), '# Change\n\n## Excluded process paths\n- .workteam\n\nproduct.js\n');
fs.writeFileSync(path.join(repo, '.workteam/audit/contract/input.md'), 'Synthetic test contract\n');
fs.writeFileSync(path.join(repo, '.workteam/audit/evidence/input.md'), 'Synthetic test evidence\n');
execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: repo });
execFileSync('git', ['add', '.'], { cwd: repo });
execFileSync('git', ['-c', 'user.name=Synthetic tester', '-c', 'user.email=tester@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Synthetic fixture'], { cwd: repo });
const shim = `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2);
const inputs=Object.fromEntries(['package','contract','evidence'].map(key=>[key,fs.readFileSync(path.join(process.cwd(),'../inputs',key+'.md'),'utf8')]));
fs.writeFileSync(process.env.PROBE_ARGS_FILE,JSON.stringify({args,inputs,cwd:process.cwd(),auditor:process.env.WORKTEAM_AUDITOR,memory:process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY}));
if(process.env.PROBE_FAILURE==='exit') { process.stderr.write('synthetic host failure'); process.exit(23); }
const raw={reviewer:'auditor',subject:'synthetic',findings:[],verified:['synthetic host boundary only']};
if(path.basename(process.argv[1])==='codex') fs.writeFileSync(args[args.indexOf('-o')+1],process.env.PROBE_FAILURE==='json'?'invalid-json':JSON.stringify(raw));
else process.stdout.write(process.env.PROBE_FAILURE==='json'?'invalid-json':JSON.stringify({structured_output:raw}));
`;
for (const host of ['claude', 'codex']) fs.writeFileSync(path.join(bin, host), shim, { mode: 0o755 });
const records = [];
function run(name, extra, expected, verify, failure = '') {
  const out = path.join(scratch, name + '-audit-out');
  const argsFile = path.join(scratch, name + '-host-args.json');
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(argsFile, { force: true });
  const args = ['--package', path.join(repo, '.workteam/audit/package/input.md'), '--contract', path.join(repo, '.workteam/audit/contract/input.md'), '--evidence', path.join(repo, '.workteam/audit/evidence/input.md'), '--out', out, ...extra];
  const p = spawnSync(process.execPath, [path.join(target, 'scripts/audit-run.js'), ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, PROBE_ARGS_FILE: argsFile, PROBE_FAILURE: failure }
  });
  const call = fs.existsSync(argsFile) ? JSON.parse(fs.readFileSync(argsFile, 'utf8')) : null;
  const generated = fs.existsSync(path.join(out, 'input.audit.md'));
  const tests = { exitAsExpected: expected ? p.status === 0 : p.status !== 0, hostArguments: verify(call), distinctInputs: !call || (call.inputs.package.includes('product.js') && call.inputs.contract === 'Synthetic test contract\n' && call.inputs.evidence === 'Synthetic test evidence\n'), copyCleaned: !call || !fs.existsSync(path.dirname(call.cwd)), reportMatchesOutcome: generated === expected };
  records.push({ name, passed: Object.values(tests).every(Boolean), tests, status: p.status, error: p.stderr.trim().split('\n')[0] });
}
const opt = (args, key) => args[args.indexOf(key) + 1];
run('claude-default', ['--host','claude'], true, c => c && !c.args.includes('--model') && c.auditor === '1' && c.memory === '1' && opt(c.args, '--tools') === 'Read,Grep,Glob');
run('claude-explicit', ['--host','claude','--model','synthetic-claude-model'], true, c => c && opt(c.args, '--model') === 'synthetic-claude-model');
run('codex-default', ['--host','codex'], true, c => c && !c.args.includes('-m') && !c.args.includes('-c') && opt(c.args,'--sandbox') === 'read-only' && c.args.includes('--ephemeral'));
run('codex-explicit', ['--host','codex','--model','synthetic-codex-model','--effort','high'], true, c => c && opt(c.args, '-m') === 'synthetic-codex-model' && opt(c.args, '-c') === 'model_reasoning_effort="high"');
run('codex-effort-only', ['--host','codex','--effort','medium'], true, c => c && !c.args.includes('-m') && opt(c.args,'-c') === 'model_reasoning_effort="medium"');
run('claude-reject-effort', ['--host','claude','--effort','high'], false, c => c === null);
run('codex-reject-unsafe-effort', ['--host','codex','--effort','high"\nsynthetic=true'], false, c => c === null);
run('reject-host', ['--host','unsupported-host'], false, c => c === null);
run('claude-host-failure', ['--host','claude'], false, c => c !== null, 'exit');
run('codex-malformed-output', ['--host','codex'], false, c => c !== null, 'json');
const roles = fs.readdirSync(path.join(target,'agents')).filter(f=>f.endsWith('.md'));
const inherited = roles.every(file => /^model: inherit$/m.test(fs.readFileSync(path.join(target,'agents',file),'utf8')));
const codexDefault = roles.every(file => !/^(model|model_reasoning_effort)\s*=/m.test(fs.readFileSync(path.join(target,'agents/codex',file.replace(/\.md$/,'.toml')),'utf8')));
records.push({name:'All six role defaults omit fixed model settings',passed:inherited && codexDefault && roles.length===6});
for (const record of records) assert(record.passed, JSON.stringify(record));
console.log('audit CLI: defaults, explicit model/effort, read-only boundary, validation and failure cleanup');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
