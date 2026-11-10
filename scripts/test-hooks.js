#!/usr/bin/env node
/**
 * Harness for the hooks in hooks/: the PreToolUse commit checks and, at the end,
 * the SessionStart orientation (scenarios S1–S10), the subagent hooks (G1–G4, B1–B3) and the
 * interview gate (I1–I6), the audit gate (A1–A5), the audit inputs (P1–P4) and the run ledger (L1–L4).
 *
 * Each scenario builds a throwaway git repository, feeds one hook the synthetic
 * stdin a host sends ({"tool_name":"Bash","cwd":…,"tool_input":{"command":…}}),
 * and asserts on the observable contract: exit code, stdout, stderr. Nothing is
 * imported from the hooks — they are exercised as child processes, exactly the
 * way Claude Code and Codex run them.
 *
 * Why the fixtures are concatenated at runtime ('AKIA' + 'ABCDEFGHIJKLMNOP'):
 * a literal secret-shaped string anywhere in a tracked file of this repository
 * would make secret-scan block every commit of the plugin itself. No line of
 * this file may match the pattern table in hooks/secret-scan.js.
 *
 * Usage: node scripts/test-hooks.js → "N passed" and exit 0, or the name of the
 * first failing scenario on stderr and exit 1.
 */
'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hooksDir = path.join(__dirname, '..', 'hooks');

// Hooks that must stay silent on an unrelated command and on malformed stdin
// (scenarios 1 and 8).
const allHooks = ['secret-scan', 'workteam-ignored'];

// Every temporary repository created during the run, removed at exit so a
// failing scenario still leaves the machine clean.
const tempRepos = [];
process.on('exit', () => {
  for (const repo of tempRepos) {
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch (err) {
      /* best effort: a leftover temp dir must never change the exit code */
    }
  }
});

/**
 * Create an empty git repository in a temp directory.
 *
 * The identity is set locally (never --global) and the initial commit is empty,
 * so `git diff --cached` has a HEAD to compare against. realpathSync resolves
 * the macOS /var → /private/var symlink: `git worktree list --porcelain` prints
 * the real path, and the scenarios compare paths with what the hook reports.
 *
 * @returns {string} absolute path of the new repository
 */
function initRepo() {
  const repo = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-hooks-'));
  tempRepos.push(repo);
  const run = (args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  run(['init', '-q']);
  run(['config', 'core.hooksPath', '.git/hooks']);
  run(['config', 'user.email', 'hooks-test@example.invalid']);
  run(['config', 'user.name', 'workteam hooks test']);
  run(['commit', '-q', '--allow-empty', '-m', 'init']);
  return repo;
}

/**
 * Write a file inside the repository and stage it.
 *
 * @param {string} repo    repository root from initRepo()
 * @param {string} relPath path relative to the root ('.env.example', 'a/b.txt')
 * @param {string} content file body, written verbatim
 */
function stage(repo, relPath, content) {
  const full = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  execFileSync('git', ['add', '--', relPath], { cwd: repo, stdio: 'ignore' });
}

/**
 * Run one hook as a child process, the way a host does.
 *
 * @param {string} hookFile  file name inside hooks/ ('secret-scan.js')
 * @param {object} opts      { cwd, command } for the normal path, or
 *                           { cwd, rawStdin } to send bytes verbatim
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function runHook(hookFile, opts) {
  const stdin = opts.rawStdin !== undefined
    ? opts.rawStdin
    : JSON.stringify({ tool_name: 'Bash', cwd: opts.cwd, tool_input: { command: opts.command } });
  const res = spawnSync(process.execPath, [path.join(hooksDir, hookFile)], {
    cwd: opts.cwd,
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// Fixtures assembled from parts — see the header comment. None of these strings
// exists in this file as a literal.
const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const privateKeyHeader = '-----BEGIN RSA ' + 'PRIVATE KEY-----';

/** Stage the AWS-key fixture used by scenarios 2 and 4. @returns {string} repo */
function repoWithAwsKey() {
  const repo = initRepo();
  stage(repo, 'config.txt', 'aws_key = "' + awsKey + '"\n');
  return repo;
}

/**
 * Repository with an untracked journal under .workteam/, nothing ignored yet.
 *
 * The files are written, never staged: the point of scenarios 6, 7 and 9 is
 * what an untracked .workteam/ does to `git status`, which is how the content
 * would reach a `git commit -a` or a careless `git add .`.
 *
 * @returns {string} repo
 */
function repoWithWorkteam() {
  const repo = initRepo();
  const journal = path.join(repo, '.workteam', 'sdd', 'x', 'journal.md');
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(journal, '# journal\n');
  return repo;
}

/**
 * Repository whose tracked file carries the key as an UNSTAGED modification.
 *
 * `git commit -a` picks such a change up, so the hook must scan the unstaged
 * diff too — that is what scenario 10 exercises. The committed version holds a
 * placeholder, so the finding can only come from the working-tree change.
 *
 * @returns {string} repo
 */
function repoWithUnstagedAwsKey() {
  const repo = initRepo();
  stage(repo, 'config.txt', 'aws_key = "placeholder-value"\n');
  execFileSync('git', ['commit', '-q', '-m', 'add config'], { cwd: repo, stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, 'config.txt'), 'aws_key = "' + awsKey + '"\n');
  return repo;
}

/**
 * Repository whose key sits in a file that is still UNTRACKED.
 *
 * The shape scenarios 12 and 13 need: `git add config.txt && git commit -m x`
 * stages it only after the hook has run, so the hook has to judge from the
 * command text what the commit will contain.
 *
 * @returns {string} repo
 */
function repoWithUntrackedAwsKey() {
  const repo = initRepo();
  fs.writeFileSync(path.join(repo, 'config.txt'), 'aws_key = "' + awsKey + '"\n');
  return repo;
}

// Scenarios 1-9 are the spec's (E6); 10 and 11 come from the blind audit of
// Stage 1; 12-14 from the final audit — the one-line `git add … && git commit`
// form, whose files are still untracked when the PreToolUse hook runs; 15 from
// the re-review of that fix — the command that only talks about committing.
const scenarios = [
  {
    name: '1: an unrelated command is not touched by any hook',
    run: () => {
      const repo = initRepo();
      for (const hook of allHooks) {
        const res = runHook(`${hook}.js`, { cwd: repo, command: 'ls' });
        assert.strictEqual(res.status, 0, `${hook}: exit ${res.status}, stderr ${res.stderr}`);
        assert.strictEqual(res.stdout, '', `${hook}: unexpected stdout ${res.stdout}`);
      }
    },
  },
  {
    name: '2: a staged AWS access key denies the commit without printing the key',
    run: () => {
      const repo = repoWithAwsKey();
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('"permissionDecision":"deny"'), `no deny in stdout: ${res.stdout}`);
      assert.ok(res.stdout.includes('aws-access-key'), `pattern name missing: ${res.stdout}`);
      assert.ok(res.stdout.includes('config.txt'), `file name missing: ${res.stdout}`);
      assert.ok(!res.stdout.includes(awsKey), 'the key value leaked into stdout');
      assert.ok(!res.stderr.includes(awsKey), 'the key value leaked into stderr');
    },
  },
  {
    name: '3: a staged .env.example with ordinary text is allowed',
    run: () => {
      const repo = initRepo();
      stage(repo, '.env.example', 'FOO=bar\n');
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stdout ${res.stdout}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
  {
    name: '4: a leading WORKTEAM_SKIP assignment overrides the scan',
    run: () => {
      const repo = repoWithAwsKey();
      const res = runHook('secret-scan.js', {
        cwd: repo,
        command: 'WORKTEAM_SKIP=secret-scan git commit -m x',
      });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stdout ${res.stdout}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
  {
    name: '5: a staged private-key block denies the commit',
    run: () => {
      const repo = initRepo();
      stage(repo, 'key.txt', privateKeyHeader + '\nAAAA\n');
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('"permissionDecision":"deny"'), `no deny in stdout: ${res.stdout}`);
      assert.ok(res.stdout.includes('private-key'), `pattern name missing: ${res.stdout}`);
    },
  },
  {
    name: '6: an unignored .workteam/ denies the commit',
    run: () => {
      const repo = repoWithWorkteam();
      const res = runHook('workteam-ignored.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('"permissionDecision":"deny"'), `no deny in stdout: ${res.stdout}`);
      assert.ok(res.stdout.includes('.workteam/ is not ignored'), `wrong reason: ${res.stdout}`);
    },
  },
  {
    name: '7: .workteam/ ignored by the root .gitignore is allowed',
    run: () => {
      const repo = repoWithWorkteam();
      fs.writeFileSync(path.join(repo, '.gitignore'), '.workteam/\n');
      const res = runHook('workteam-ignored.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stdout ${res.stdout}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
  {
    name: '8: stdin that is not JSON leaves every hook silent',
    run: () => {
      const repo = initRepo();
      for (const hook of allHooks) {
        const res = runHook(`${hook}.js`, { cwd: repo, rawStdin: 'not json' });
        assert.strictEqual(res.status, 0, `${hook}: exit ${res.status}, stderr ${res.stderr}`);
        assert.strictEqual(res.stdout, '', `${hook}: unexpected stdout ${res.stdout}`);
      }
    },
  },
  {
    name: '9: a self-ignoring .workteam/.gitignore alone is enough',
    run: () => {
      const repo = repoWithWorkteam();
      fs.writeFileSync(path.join(repo, '.workteam', '.gitignore'), '*\n');
      const res = runHook('workteam-ignored.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stdout ${res.stdout}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
  {
    name: '10: -a is seen after a quoted message, and a quoted "-a" is not',
    run: () => {
      const repo = repoWithUnstagedAwsKey();
      // The flag sits behind the quoted message: truncating the command at the
      // first quote would miss it and skip the unstaged diff entirely.
      const withFlag = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m "note" -a' });
      assert.strictEqual(withFlag.status, 2, `exit ${withFlag.status}, stderr ${withFlag.stderr}`);
      assert.ok(withFlag.stdout.includes('aws-access-key'), `pattern name missing: ${withFlag.stdout}`);
      assert.ok(!withFlag.stdout.includes(awsKey), 'the key value leaked into stdout');
      // The same text inside the message is not a flag: nothing is staged, so
      // a plain commit has nothing to scan.
      const inMessage = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m "add -a later"' });
      assert.strictEqual(inMessage.status, 0, `exit ${inMessage.status}, stdout ${inMessage.stdout}`);
      assert.strictEqual(inMessage.stdout, '', `unexpected stdout ${inMessage.stdout}`);
    },
  },
  {
    name: '11: a staged .env is denied by its name alone, with no line number',
    run: () => {
      const repo = initRepo();
      stage(repo, '.env', 'FOO=bar\n');
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('secret-file-name'), `pattern name missing: ${res.stdout}`);
      assert.ok(res.stdout.includes('.env matches'), `file name missing: ${res.stdout}`);
      assert.ok(!res.stdout.includes('.env:'), `a name finding must carry no line number: ${res.stdout}`);
    },
  },
  {
    name: '12: a key in an untracked file that the same command stages is denied',
    run: () => {
      const repo = repoWithUntrackedAwsKey();
      // `git add` has not run yet when the hook fires: the index is empty and
      // only the working tree carries the key.
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git add config.txt && git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('"permissionDecision":"deny"'), `no deny in stdout: ${res.stdout}`);
      assert.ok(res.stdout.includes('aws-access-key'), `pattern name missing: ${res.stdout}`);
      assert.ok(res.stdout.includes('config.txt'), `file name missing: ${res.stdout}`);
      assert.ok(!res.stdout.includes(awsKey), 'the key value leaked into stdout');
      assert.ok(!res.stderr.includes(awsKey), 'the key value leaked into stderr');
    },
  },
  {
    name: '13: the same untracked file with a plain commit, nothing staged, is allowed',
    run: () => {
      const repo = repoWithUntrackedAwsKey();
      // No add in the command and no pathspec: this commit takes the (empty)
      // index, so the untracked file must not be scanned.
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stdout ${res.stdout}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
  {
    name: '14: an untracked .env swept up by `git add -A` is denied by its name',
    run: () => {
      const repo = initRepo();
      fs.writeFileSync(path.join(repo, '.env'), 'FOO=bar\n');
      const res = runHook('secret-scan.js', { cwd: repo, command: 'git add -A && git commit -m x' });
      assert.strictEqual(res.status, 2, `exit ${res.status}, stderr ${res.stderr}`);
      assert.ok(res.stdout.includes('secret-file-name'), `pattern name missing: ${res.stdout}`);
      assert.ok(res.stdout.includes('.env matches'), `file name missing: ${res.stdout}`);
    },
  },
  {
    name: '15: a command that only quotes the words "git commit" is not a commit',
    run: () => {
      const repo = repoWithUntrackedAwsKey();
      // The trigger fires on the raw text, so the hook does start — but the
      // command commits nothing, and a grep over this repository must never be
      // answered with a whole-tree secret scan and a deny.
      const res = runHook('secret-scan.js', { cwd: repo, command: 'grep -rn "git commit" .' });
      assert.strictEqual(res.status, 0, `exit ${res.status}, stderr ${res.stderr}`);
      assert.strictEqual(res.stdout, '', `unexpected stdout ${res.stdout}`);
    },
  },
];

// Regression cases from the 2.3 review: exercise observable decisions, not parser internals.
scenarios.push(
  { name: '16: read-only quoted git text is allowed even with staged secrets/scratch', run() {
    const repo = repoWithAwsKey();
    fs.mkdirSync(path.join(repo, '.workteam')); fs.writeFileSync(path.join(repo, '.workteam', 'note'), 'scratch');
    for (const hook of allHooks) for (const command of ['grep -rn "git commit" .', 'echo "git add . && git commit"']) {
      const r = runHook(`${hook}.js`, { cwd: repo, command });
      assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, '');
    }
  } },
  { name: '17: a commit inside a quoted shell wrapper is left to the Git hook (3.1: no shell parsing)', run() {
    const repo = repoWithUntrackedAwsKey();
    for (const shell of ['bash -c', 'zsh -lc', 'sh -c']) {
      const r = runHook('secret-scan.js', { cwd: repo, command: `${shell} "git add config.txt && git commit -m x"` });
      assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, '');
    }
  } },
  { name: '18: explicit add excludes unrelated untracked secrets', run() {
    const repo = repoWithUntrackedAwsKey(); fs.writeFileSync(path.join(repo, 'safe.txt'), 'safe');
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git add safe.txt && git commit -m x' });
    assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, '');
  } },
  { name: '19: git -C and cd target the selected repo from outside it', run() {
    const repo = repoWithAwsKey();
    for (const command of [`git -C "${repo}" commit -m x`, `cd "${repo}" && git commit -m x`]) {
      const r = runHook('secret-scan.js', { cwd: path.dirname(repo), command });
      assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('aws-access-key'));
    }
  } },
  { name: '20: a clean target is independent of dirty sibling worktrees', run() {
    const repo = repoWithAwsKey(), sibling = path.join(repo, 'sibling');
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'sibling', sibling], { cwd: repo });
    for (const hook of allHooks) {
      const r = runHook(`${hook}.js`, { cwd: repo, command: 'git -C sibling commit --allow-empty -m x' });
      assert.strictEqual(r.status, 0);
    }
  } },
  { name: '21: commit -a does not scan unrelated untracked files', run() {
    const repo = repoWithUntrackedAwsKey();
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git commit -am x' });
    assert.strictEqual(r.status, 0); assert.strictEqual(r.stderr, '');
    const supported = runHook('secret-scan.js', { cwd: repo, command: 'git commit -a -m x' });
    assert.strictEqual(supported.status, 0); assert.strictEqual(supported.stderr, '');
  } },
  { name: '22: command envelopes for both hosts are accepted', run() {
    const repo = repoWithAwsKey();
    const r = runHook('secret-scan.js', { cwd: repo, rawStdin: JSON.stringify({ tool_name: 'exec_command', tool_input: { cmd: 'git commit -m x', workdir: repo } }) });
    assert.strictEqual(r.status, 2);
  } },
  { name: '23: skip text inside a message does not bypass the check', run() {
    const repo = repoWithAwsKey();
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m "WORKTEAM_SKIP=all"' });
    assert.strictEqual(r.status, 2);
  } },
  { name: '24: a staged secret blocks even a partial commit, and the deny names its file (3.1: superset scan)', run() {
    const repo = initRepo(); stage(repo, 'safe.txt', 'before');
    execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: repo });
    fs.writeFileSync(path.join(repo, 'safe.txt'), 'after');
    stage(repo, 'config.txt', awsKey);
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x -- safe.txt' });
    assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('config.txt')); assert.ok(!r.stdout.includes(awsKey));
  } },
  { name: '25: quoted spaces in add paths retain the intended scope', run() {
    const repo = repoWithUntrackedAwsKey();
    fs.writeFileSync(path.join(repo, 'safe file.txt'), 'safe');
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git add "safe file.txt" && git commit -m x' });
    assert.strictEqual(r.status, 0);
  } }
);

scenarios.push(
  { name: '26: opaque shell commands fall back to the staged floor, with a coverage note', run() {
    const repo = repoWithAwsKey();
    const r = runHook('secret-scan.js', { cwd: repo, command: 'GIT_INDEX_FILE=$index git commit -m x' });
    assert.strictEqual(r.status, 2); assert.ok(r.stderr.includes('cannot resolve'));
    assert.ok(r.stdout.includes('aws-access-key')); assert.ok(!r.stderr.includes(awsKey));
    const clean = runHook('secret-scan.js', { cwd: initRepo(), command: 'GIT_INDEX_FILE=$index git commit -m x' });
    assert.strictEqual(clean.status, 0); assert.ok(clean.stderr.includes('cannot resolve'));
    const grep = runHook('secret-scan.js', { cwd: repo, command: 'grep -rn "git commit" .' });
    assert.strictEqual(grep.status, 0); assert.strictEqual(grep.stderr, '');
  } },
  { name: '26b: common commit shapes with a staged key are denied', run() {
    const repo = repoWithAwsKey();
    const shapes = {
      heredoc: "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
      backtick: 'git commit -m "fix `foo`"',
      redirect: 'git commit -m x 2>&1',
      'file heredoc': "git commit -F - <<'EOF'\nmsg\nEOF",
      'var prefix': 'HUSKY=0 git commit -m x',
      env: 'env git commit -m x',
      'command/time/nohup': 'nohup time command git commit -m x',
      dollar: 'git commit -m "$MSG" -- safe.txt',
    };
    for (const [label, command] of Object.entries(shapes)) {
      const r = runHook('secret-scan.js', { cwd: repo, command });
      assert.strictEqual(r.status, 2, `${label}: exit ${r.status}`); assert.ok(r.stdout.includes('aws-access-key'), label);
    }
    const scratch = repoWithWorkteam();
    assert.strictEqual(runHook('workteam-ignored.js', { cwd: scratch, command: 'git add . && git commit -m "$(date)"' }).status, 2);
  } },
  { name: '26e: unrecognised shapes around an unquoted git commit take the floor', run() {
    const repo = repoWithAwsKey();
    for (const command of ['git add -A && \\\ngit commit -m x', 'git commit \\\n -m x', 'sudo git commit -m x',
      'if git commit -m x; then echo ok; fi', '! git commit -m x', 'timeout 60 git commit -m x',
      '{ git commit -m x; }', 'exec git commit -m x']) {
      const r = runHook('secret-scan.js', { cwd: repo, command });
      assert.strictEqual(r.status, 2, `${JSON.stringify(command)}: exit ${r.status}`);
    }
    const quoted = runHook('secret-scan.js', { cwd: repo, command: 'grep -rn "git commit" .' });
    assert.strictEqual(quoted.status, 0);
  } },
  { name: '26c: pathspec commit still sees an untracked file added earlier in the command', run() {
    const repo = repoWithUntrackedAwsKey();
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git add config.txt && git commit -m x config.txt' });
    assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('config.txt'));
  } },
  { name: '26d: a modified submodule is skipped by commit -a, not an error', run() {
    const sub = initRepo(), repo = initRepo(), git = (cwd, ...a) => execFileSync('git', ['-c', 'protocol.file.allow=always', '-c', 'user.name=Workteam fixture', '-c', 'user.email=fixture@example.invalid', ...a], { cwd, stdio: 'ignore' });
    git(repo, 'submodule', 'add', sub, 'sub'); git(repo, 'commit', '-qm', 'sub');
    git(path.join(repo, 'sub'), 'commit', '-q', '--allow-empty', '-m', 'bump');
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git commit -a -m x' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  } },
  { name: '27: git add -A from a subdirectory covers the whole repository', run() {
    const repo = repoWithUntrackedAwsKey(); fs.mkdirSync(path.join(repo, 'sub'));
    const r = runHook('secret-scan.js', { cwd: path.join(repo, 'sub'), command: 'git add -A && git commit -m x' });
    assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('config.txt'));
  } },
  { name: '28: documentation comments cannot exempt an actual assigned secret', run() {
    const repo = initRepo();
    const value = 'abcdefghijklmnopqrst';
    stage(repo, 'config.txt', 'password = "' + value + '" // example docs');
    const r = runHook('secret-scan.js', { cwd: repo, command: 'git commit -m x' });
    assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('generic-assignment'));
    assert.ok(!r.stdout.includes(value));
  } }
);

/**
 * Run the SessionStart hook for `dir` and return its additionalContext.
 * The reply must be one JSON object; anything else fails the scenario here.
 *
 * @param {string} dir    project directory, sent as `cwd` the way both hosts do
 * @param {string} source 'startup' | 'compact' …
 * @returns {string}
 */
function sessionContext(dir, source = 'startup') {
  const r = runHook('session-start.js', { cwd: dir, rawStdin: JSON.stringify({ cwd: dir, source }) });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}
const pluginVersion = JSON.parse(fs.readFileSync(path.join(hooksDir, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
/** Write `content` to `relPath` inside `repo` without staging it. */
function put(repo, relPath, content) {
  fs.mkdirSync(path.dirname(path.join(repo, relPath)), { recursive: true });
  fs.writeFileSync(path.join(repo, relPath), content);
}

scenarios.push(
  { name: 'S1: no AGENTS.md — plugin root, missing contract, missing state, clean tree', run() {
    const ctx = sessionContext(initRepo());
    assert.ok(ctx.includes('Plugin root: ' + path.resolve(hooksDir, '..')));
    assert.ok(ctx.includes('No workteam contract'));
    assert.ok(ctx.includes('### docs/CURRENT_STATE.md\nmissing'));
    assert.ok(ctx.includes('- none') && ctx.includes('working tree clean'));
  } },
  { name: 'S2: outdated contract block is reported with both versions', run() {
    const repo = initRepo();
    put(repo, 'AGENTS.md', '<!-- workteam:contract v0.9.0 -->\n# x\n<!-- /workteam:contract -->\n');
    assert.ok(sessionContext(repo).includes(`contract is v0.9.0, plugin is v${pluginVersion}`));
  } },
  { name: 'S3: current contract, state, active plan and uncommitted file are all printed', run() {
    const repo = initRepo();
    put(repo, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n<!-- /workteam:contract -->\n`);
    put(repo, 'CLAUDE.md', '@AGENTS.md\n');
    put(repo, 'docs/CURRENT_STATE.md', '# State\nnext step: ship\n');
    put(repo, 'docs/plans/active/feature-x.md', '# plan\n');
    const ctx = sessionContext(repo);
    assert.ok(ctx.includes(`contract v${pluginVersion}`) && !ctx.includes('`project-onboarding`'));
    assert.ok(ctx.includes('next step: ship'));
    assert.ok(ctx.includes('- docs/plans/active/feature-x.md'));
    assert.ok(ctx.includes('uncommitted:') && ctx.includes('AGENTS.md'));
  } },
  { name: 'S4: a long CURRENT_STATE.md is truncated; compaction adds the re-read note', run() {
    const repo = initRepo();
    put(repo, 'docs/CURRENT_STATE.md', Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n'));
    const ctx = sessionContext(repo, 'compact');
    assert.ok(ctx.includes('line 80') && !ctx.includes('line 81'));
    assert.ok(ctx.includes('truncated at 80 of 100 lines'));
    assert.ok(ctx.includes('Context was compacted'));
  } },
  { name: 'S5: outside a git repository the Git section is omitted, not an error', run() {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-nogit-'));
    tempRepos.push(dir);
    const ctx = sessionContext(dir);
    assert.ok(!ctx.includes('### Git'));
  } },
  { name: 'S6: stdin cwd in a subdirectory wins over the process cwd and resolves to the git root', run() {
    const repo = initRepo(), other = initRepo();
    put(repo, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n<!-- /workteam:contract -->\n`);
    put(repo, 'CLAUDE.md', '@AGENTS.md\n');
    put(repo, 'docs/CURRENT_STATE.md', 'root state\n');
    fs.mkdirSync(path.join(repo, 'packages', 'app'), { recursive: true });
    const r = runHook('session-start.js', { cwd: other, rawStdin: JSON.stringify({ cwd: path.join(repo, 'packages', 'app') }) });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes(`contract v${pluginVersion}`) && ctx.includes('root state'), ctx);
  } },
  { name: 'S7: a block without its closing marker is no contract; a missing import is reported', run() {
    const repo = initRepo();
    put(repo, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n# truncated\n`);
    assert.ok(sessionContext(repo).includes('No workteam contract'));
    put(repo, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n<!-- /workteam:contract -->\n`);
    put(repo, 'CLAUDE.md', '# own rules\n');
    assert.ok(sessionContext(repo).includes('CLAUDE.md does not import `@AGENTS.md`'));
  } },
  { name: 'S8: no CLAUDE.md is fine (Claude Code reads AGENTS.md); a CLAUDE.local.md needs the import', run() {
    const repo = initRepo();
    put(repo, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n<!-- /workteam:contract -->\n`);
    const ctx = sessionContext(repo);
    assert.ok(!ctx.includes('CLAUDE.md does not import') && !ctx.includes('does not read AGENTS.md'), ctx);
    put(repo, 'CLAUDE.local.md', '# my notes\n');
    assert.ok(sessionContext(repo).includes('CLAUDE.local.md exists, so Claude Code does not read AGENTS.md by itself'));
  } },
  { name: 'S10: an active plan shows its task status; a hand-set status is not counted; audits get no state', run() {
    const repo = initRepo();
    put(repo, 'docs/plans/active/feature-x.md', '# plan\n');
    put(repo, 'docs/plans/active/feature-x.tasks.json', JSON.stringify({ tasks: [
      { id: 'T1', title: 'parser', verify: 'node --test', status: 'passing' },
      { id: 'T2', title: 'export', verify: 'node --test test/export.test.js', status: 'pending' },
    ] }));
    const ctx = sessionContext(repo);
    assert.ok(ctx.includes('- docs/plans/active/feature-x.md — 0/2 tasks passing; 1 marked passing without a recorded run; next T1: parser'), ctx);
    const r = runHook('session-start.js', { cwd: repo, rawStdin: JSON.stringify({ cwd: repo }), env: { WORKTEAM_AUDITOR: '1' } });
    assert.strictEqual(r.stdout, '', 'a blind audit session sees no state or plans');
  } },
  { name: 'S9: the context stays under the host limit however long CURRENT_STATE.md lines are', run() {
    const repo = initRepo();
    put(repo, 'docs/CURRENT_STATE.md', Array.from({ length: 60 }, () => 'x'.repeat(400)).join('\n'));
    const ctx = sessionContext(repo);
    assert.ok(ctx.length <= 9000 && ctx.includes('truncated at 9000 characters'), String(ctx.length));
    const { cap } = require(path.join(hooksDir, 'lib', 'session-state'));
    assert.strictEqual(cap('x'.repeat(9000)), 'x'.repeat(9000), 'text at the limit is kept whole');
    assert.strictEqual(cap('x'.repeat(9001)).length, 9000, 'the notice fits inside the limit');
  } }
);

// Installed skills (3.2): two equal copies, one per host; the session names its interview file.
scenarios.push(
  { name: 'S11: installed skill copies that differ are named; equal copies, a link and unrecorded skills are not', run() {
    const dir = initRepo();
    put(dir, 'AGENTS.md', `<!-- workteam:contract v${pluginVersion} -->\n# x\n<!-- /workteam:contract -->\n`);
    const skill = (body) => `---\nname: x\ndescription: x\nmetadata:\n  source: workteam library\n---\n${body}\n`;
    for (const host of ['.agents', '.claude']) put(dir, `${host}/skills/same/SKILL.md`, skill('Same.'));
    put(dir, '.agents/skills/drift/SKILL.md', skill('New text.'));
    put(dir, '.claude/skills/drift/SKILL.md', skill('Old text.'));
    put(dir, '.agents/skills/flat/SKILL.md', skill('Linked.'));
    put(dir, '.claude/skills/flat', '../../.agents/skills/flat');
    put(dir, '.agents/skills/linked/SKILL.md', skill('Linked.'));
    fs.symlinkSync('../../.agents/skills/linked', path.join(dir, '.claude/skills/linked'));
    put(dir, '.claude/skills/own/SKILL.md', '---\nname: own\ndescription: x\n---\nClaude only.\n');
    const r = runHook('session-start.js', { cwd: dir, rawStdin: JSON.stringify({ cwd: dir, source: 'startup', session_id: 'abc-1' }) });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    const line = ctx.split('\n').find((l) => l.startsWith('Installed skill copies differ')) || '';
    assert.ok(line.includes('drift, flat'), line);
    for (const name of ['same', 'linked', 'own']) assert.ok(!line.includes(name), name);
    assert.ok(ctx.includes('.workteam/interview/abc-1.md'), 'the session names its interview file');
    assert.ok(!sessionContext(initRepo()).includes('Interview decision'), 'no contract, no interview line');
  } }
);

// Subagent hooks (3.1): the evidence gate, the blind-audit guard, the plugin root for
// subagents and the eval-only contract. Each gets the stdin its host sends.
const hookJson = (file, payload, env) => {
  const r = runHook(file, { cwd: os.tmpdir(), rawStdin: JSON.stringify(payload), env });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const transcriptWith = (text) => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-transcript-'));
  tempRepos.push(dir);
  fs.writeFileSync(path.join(dir, 'agent.jsonl'), text);
  return path.join(dir, 'agent.jsonl');
};
const stop = (agent, message, extra = {}) => ({ hook_event_name: 'SubagentStop', agent_type: agent, stop_hook_active: false, last_assistant_message: message, ...extra });
scenarios.push(
  { name: 'G1: a developer report without evidence is sent back; with a command it passes', run() {
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', 'Done: fixed the parser.')).decision, 'block');
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', 'Done.\n- Evidence: `node --test` → 4 passed')), null);
    assert.strictEqual(hookJson('evidence-gate.js', stop('developer', 'Done.\n**Evidence:** `pytest -q` → 12 passed')), null, 'Codex role names count too');
  } },
  { name: 'G2: «Evidence: none» passes only when the transcript shows no edit and no shell command', run() {
    const report = 'Read the module.\nEvidence: none — read-only investigation';
    const used = (tool) => transcriptWith(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: tool, input: {} }] } }) + '\n');
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', report, { agent_transcript_path: used('Read') })), null);
    for (const tool of ['Edit', 'Write', 'Bash'])
      assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', report, { agent_transcript_path: used(tool) })).decision, 'block', tool);
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', report)).decision, 'block', 'no transcript: the exemption cannot be established');
  } },
  { name: 'G3: a tester names its evidence file; the loop guard and other agents stay silent', run() {
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:tester', 'All green.')).decision, 'block');
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:tester', 'Evidence file: .workteam/audit/x-stage-1.evidence.md')), null);
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:tester', 'All green.', { stop_hook_active: true })), null);
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:critic', 'Findings attached.')), null);
  } },
  { name: 'G4: in auto mode the hand-back is checked; only an accepted one settles the stop after it', run() {
    const deny = hookJson('evidence-gate.js', { hook_event_name: 'PreToolUse', agent_type: 'workteam:developer', tool_name: 'SubagentHandback', tool_input: { message: 'Implemented.' } });
    assert.strictEqual(deny.hookSpecificOutput.permissionDecision, 'deny');
    const handback = (message) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message } }] } }) + '\n';
    const accepted = transcriptWith(handback('Done.\nEvidence: `node --test` → 3 passed'));
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', 'Handed back.', { agent_transcript_path: accepted })), null);
    const denied = transcriptWith(handback('Implemented.'));
    assert.strictEqual(hookJson('evidence-gate.js', stop('workteam:developer', 'Stopping.', { agent_transcript_path: denied })).decision, 'block', 'a denied hand-back does not exempt the stop');
  } },
  { name: 'B1: the auditor cannot read git history, journals or plans; others and product code are untouched', run() {
    const deny = (tool, input, agent = 'workteam:auditor') => hookJson('auditor-blind.js', { hook_event_name: 'PreToolUse', agent_type: agent, cwd: '/repo', tool_name: tool, tool_input: input });
    assert.strictEqual(deny('Read', { file_path: '/repo/.git/logs/HEAD' }).hookSpecificOutput.permissionDecision, 'deny');
    assert.strictEqual(deny('Grep', { pattern: 'x', path: 'docs/plans' }).hookSpecificOutput.permissionDecision, 'deny');
    assert.strictEqual(deny('Glob', { pattern: '.workteam/sdd/**' }).hookSpecificOutput.permissionDecision, 'deny');
    assert.strictEqual(deny('Read', { file_path: '/repo/src/report-plan.js' }), null, 'product code named like a plan stays readable');
    assert.strictEqual(deny('Read', { file_path: '/repo/.workteam/audit/x.change.md' }), null, 'the audit inputs stay readable');
    for (const file of ['/repo/docs/CURRENT_STATE.md', '/repo/docs/INDEX.md', '/repo/.workteam/sdd/x/journal.md', '/repo/.workteam/briefs/t1.md',
      '/repo/.workteam/audit/x.audit.md', '/repo/.workteam/audit/x.findings.json'])
      assert.strictEqual(deny('Read', { file_path: file }).hookSpecificOutput.permissionDecision, 'deny', file);
    const repo = initRepo(); fs.mkdirSync(path.join(repo, 'src'));
    const search = (tool, input) => hookJson('auditor-blind.js', { hook_event_name: 'PreToolUse', agent_type: 'workteam:auditor', cwd: repo, tool_name: tool, tool_input: input });
    assert.strictEqual(search('Grep', { pattern: 'x' }).hookSpecificOutput.permissionDecision, 'deny', 'a search from the root reaches .git');
    assert.strictEqual(search('Glob', { pattern: '**/*.md', path: repo }).hookSpecificOutput.permissionDecision, 'deny');
    assert.strictEqual(search('Grep', { pattern: 'x', path: path.join(repo, 'src') }), null, 'a product directory can be searched');
    assert.strictEqual(search('Grep', { pattern: 'Critical', path: path.join(repo, '.workteam', 'audit') }).hookSpecificOutput.permissionDecision, 'deny', 'earlier reviews cannot be searched');
    assert.strictEqual(deny('Read', { file_path: '/repo/.git/HEAD' }, 'workteam:developer'), null);
  } },
  { name: 'B2: workteam roles that read skills get the plugin root; the auditor and other agents do not', run() {
    const ctx = hookJson('subagent-start.js', { hook_event_name: 'SubagentStart', agent_type: 'workteam:developer' });
    assert.ok(ctx.hookSpecificOutput.additionalContext.includes('Plugin root: ' + path.resolve(hooksDir, '..')));
    assert.strictEqual(hookJson('subagent-start.js', { hook_event_name: 'SubagentStart', agent_type: 'workteam:auditor' }), null);
    assert.strictEqual(hookJson('subagent-start.js', { hook_event_name: 'SubagentStart', agent_type: 'Explore' }), null);
  } },
  { name: 'B3: the eval contract prints the block only when EVAL_WORKTEAM_CONTRACT=1', run() {
    assert.strictEqual(hookJson('eval-contract.js', {}), null);
    const ctx = hookJson('eval-contract.js', {}, { EVAL_WORKTEAM_CONTRACT: '1' }).hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes(`<!-- workteam:contract v${pluginVersion}`) && ctx.includes('<!-- /workteam:contract -->') && !ctx.includes('{{PROJECT_NAME}}'));
  } }
);

// Interview gate (3.2): a build entry point waits for an interview decision the user's own
// messages back. Transcripts are written in each host's JSONL shape.
const contractProject = (files = {}) => {
  const dir = initRepo();
  put(dir, 'AGENTS.md', '<!-- workteam:contract v' + pluginVersion + ' -->\n# x\n<!-- /workteam:contract -->\n');
  for (const [rel, content] of Object.entries(files)) put(dir, rel, content);
  return dir;
};
const say = (role, text) => JSON.stringify({ type: role, message: { role, content: [{ type: 'text', text }] } });
const wrote = (file) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: { file_path: file, content: '# Интервью' } }] } });
const codex = (role, text) => JSON.stringify({ type: 'response_item', payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
const gate = (dir, tool, toolInput, lines = [], extra = {}, env) => hookJson('interview-gate.js',
  { hook_event_name: 'PreToolUse', cwd: dir, tool_name: tool, tool_input: toolInput, transcript_path: transcriptWith(lines.join('\n') + '\n'), ...extra }, env);
const denied = (r) => Boolean(r && r.hookSpecificOutput.permissionDecision === 'deny');
const brief = (role, line) => ({ subagent_type: role, prompt: `Goal: implement the export.\n${line || ''}` });
scenarios.push(
  { name: 'I1: builders wait for a decision under a contract; readers, reviewers, no contract and the override pass', run() {
    assert.strictEqual(gate(initRepo(), 'Agent', brief('workteam:developer')), null, 'no contract: inactive');
    const dir = contractProject();
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer'))));
    assert.ok(denied(gate(dir, 'Agent', { prompt: 'Build it.' })), 'a general-purpose agent builds too');
    for (const role of ['workteam:researcher', 'workteam:critic', 'workteam:tester', 'Explore'])
      assert.strictEqual(gate(dir, 'Agent', brief(role)), null, role);
    assert.strictEqual(gate(dir, 'Agent', brief('workteam:developer'), [], {}, { WORKTEAM_SKIP: 'interview-gate' }), null);
    assert.ok(denied(gate(initRepo(), 'Agent', brief('workteam:developer'), [], {}, { EVAL_WORKTEAM_CONTRACT: '1' })), 'the eval contract counts');
  } },
  { name: 'I2: light is taken at its word', run() {
    const dir = contractProject();
    assert.strictEqual(gate(dir, 'Agent', brief('workteam:developer', 'Interview: light — rename the label')), null);
  } },
  { name: 'I3: a record passes with the user\'s confirmation written after it appeared', run() {
    const rec = '.workteam/briefs/csv-interview.md';
    const dir = contractProject({ [rec]: '# Интервью\nConfirmed: «ок, делай»\n' });
    const line = `Interview: ${rec}`;
    assert.strictEqual(gate(dir, 'Agent', brief('workteam:developer', line), [say('user', 'Нужен экспорт в CSV'), wrote(path.join(dir, rec)), say('user', 'Ок, делай!')]), null);
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer', line), [say('user', 'ок, делай'), wrote(path.join(dir, rec))])), 'confirmed before the record existed');
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer', line), [wrote(path.join(dir, rec)), say('assistant', 'ок, делай')])), 'the agent cannot confirm for the user');
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer', line), [say('user', 'ок, делай')])), 'a record never shown in this session');
    const ok = '.workteam/briefs/ok-interview.md';
    put(dir, ok, '# Интервью\nConfirmed: «ок»\n');
    const okLine = brief('workteam:developer', `Interview: ${ok}`);
    assert.ok(denied(gate(dir, 'Agent', okLine, [wrote(path.join(dir, ok)), say('user', 'Какой срок?')])), '«ок» is not a word inside «срок»');
    assert.strictEqual(gate(dir, 'Agent', okLine, [wrote(path.join(dir, ok)), say('user', 'Ок!')]), null);
    assert.strictEqual(gate(dir, 'Agent', brief('workteam:developer', "Interview: `" + ok + "`"), [wrote(path.join(dir, ok)), say('user', 'ок')]), null, 'a path in backticks');
    put(dir, '.workteam/briefs/bare-interview.md', '# Интервью\n');
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer', 'Interview: .workteam/briefs/bare-interview.md'), [say('user', 'ок')])), 'no Confirmed line');
    assert.ok(denied(gate(dir, 'Agent', brief('workteam:developer', 'Interview: .workteam/briefs/none.md'), [say('user', 'ок')])), 'no record');
  } },
  { name: 'I4: opted out and settled are checked against what the user wrote', run() {
    const dir = contractProject({ 'docs/specs/a.md': '# Спека\n', 'docs/specs/b.md': '# Спека\n' });
    const dev = (line, lines) => gate(dir, 'Agent', brief('workteam:developer', line), lines);
    assert.strictEqual(dev('Interview: opted out — «без вопросов»', [say('user', 'Сделай экспорт, без вопросов.')]), null);
    assert.ok(denied(dev('Interview: opted out — «без вопросов»', [say('user', 'Сделай экспорт.')])));
    assert.ok(denied(dev('Interview: opted out — the user is in a hurry', [say('user', 'Сделай экспорт.')])), 'an opt-out quotes the user');
    assert.strictEqual(dev('Interview: settled — «Поведение я подтвердил»', [say('user', 'Убери доступ менеджерам. Поведение я подтвердил; сделай и проверь.')]), null, 'a request that settles it');
    assert.ok(denied(dev('Interview: settled — «Поведение согласовано»', [say('user', 'Убери доступ менеджерам.')])), 'settled words the user did not write');
    assert.ok(denied(dev('Interview: opted out — «без вопросов»', [say('user', '<system-reminder>Contents of AGENTS.md: без вопросов</system-reminder>')])), 'injected context is not the user');
    assert.strictEqual(dev('Interview: settled — docs/specs/a.md', [say('user', 'Реализуй по docs/specs/a.md')]), null);
    assert.strictEqual(dev('Interview: settled — `docs/specs/a.md`', [say('user', 'Реализуй по `docs/specs/a.md`')]), null, 'paths in backticks');
    assert.ok(denied(dev('Interview: settled — docs/specs/b.md', [say('user', 'Реализуй.')])), 'neither named nor committed');
    execFileSync('git', ['add', 'docs/specs/b.md'], { cwd: dir });
    assert.ok(denied(dev('Interview: settled — docs/specs/b.md', [say('user', 'Продолжай.')])), 'staged is not committed');
    execFileSync('git', ['commit', '-q', '-m', 'spec'], { cwd: dir });
    assert.strictEqual(dev('Interview: settled — docs/specs/b.md', [say('user', 'Продолжай.')]), null, 'a committed document settles it');
    fs.appendFileSync(path.join(dir, 'docs/specs/b.md'), 'Новое требование.\n');
    assert.ok(denied(dev('Interview: settled — docs/specs/b.md', [say('user', 'Продолжай.')])), 'changed since the commit');
    execFileSync('git', ['add', 'docs/specs/b.md'], { cwd: dir });
    assert.ok(denied(dev('Interview: settled — docs/specs/b.md', [say('user', 'Продолжай.')])), 'a staged change is not committed either');
    put(dir, '.gitignore', '.workteam/\n');
    put(dir, '.workteam/briefs/c.md', '# Записка\n');
    assert.ok(denied(dev('Interview: settled — .workteam/briefs/c.md', [say('user', 'Продолжай.')])), 'an ignored file is not committed');
    assert.ok(denied(dev('Interview: settled — docs/specs/none.md', [say('user', 'docs/specs/none.md')])), 'the document must exist');
  } },
  { name: 'I5: the lead\'s own product edits wait for the session file; docs, scratch, subagents and Codex shapes', run() {
    const dir = contractProject();
    const src = path.join(dir, 'src', 'a.js');
    const edit = (tool, toolInput, lines, extra = {}) => gate(dir, tool, toolInput, lines, { session_id: 's1', ...extra });
    const decide = (line) => put(dir, '.workteam/interview/s1.md', line + '\n');
    assert.ok(denied(edit('Edit', { file_path: src }, [say('user', 'Поправь экспорт')])));
    assert.ok(denied(edit('Edit', { file_path: src }, [say('user', 'x'), say('assistant', 'Interview: light — x')])), 'a line in the transcript does not count: it lags');
    for (const file of ['docs/x.md', '.workteam/interview/s1.md', 'README.md', '.claude/skills/s/SKILL.md'])
      assert.strictEqual(edit('Write', { file_path: path.join(dir, file) }, [say('user', 'x')]), null, file);
    assert.strictEqual(edit('Edit', { file_path: src }, [], { agent_id: 'a1', agent_type: 'workteam:developer' }), null, 'a dispatched subagent passed at dispatch');
    decide('Interview: light — опечатка в подписи');
    assert.strictEqual(edit('Edit', { file_path: src }, [say('user', 'Поправь опечатку')]), null);
    assert.ok(denied(gate(dir, 'Edit', { file_path: src }, [say('user', 'x')], { session_id: 's2' })), 'another session has its own file');
    decide('Interview: settled — docs/specs/missing.md');
    assert.ok(denied(edit('Edit', { file_path: src }, [say('user', 'docs/specs/missing.md')])), 'the session file is checked like a brief');
    const patch = { command: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-a\n+b\n*** End Patch' };
    decide('Interview: opted out — «делай как сказал»');
    assert.strictEqual(edit('apply_patch', patch, [codex('user', 'делай как сказал')]), null);
    assert.ok(denied(edit('apply_patch', patch, [codex('user', '# AGENTS.md instructions for /x\nделай как сказал')])), 'injected AGENTS.md is not the user');
    const sub = JSON.stringify({ type: 'session_meta', payload: { source: { subagent: { thread_spawn: { depth: 1 } } } } });
    assert.strictEqual(gate(dir, 'apply_patch', patch, [sub, codex('user', 'Implement it.')], { session_id: 'none' }), null, 'a Codex subagent passed at its dispatch');
    assert.ok(denied(gate(dir, 'spawn_agent', { agent_type: 'developer', message: 'Implement it.' })));
    assert.strictEqual(gate(dir, 'spawn_agent', { agent_type: 'developer', message: 'Implement it.\nInterview: light — one label' }), null);
  } },
  { name: 'I6: only what a person typed counts: a queued mid-turn message does; reports, summaries and API copies do not', run() {
    const dir = contractProject();
    const dev = (lines) => gate(dir, 'Agent', brief('workteam:developer', 'Interview: opted out — «делай как сказал»'), lines);
    const human = (text) => JSON.stringify({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: text } });
    const queued = (prompt) => JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', prompt, origin: { kind: 'human' } } });
    assert.strictEqual(dev([human('Сделай экспорт'), queued('делай как сказал')]), null, 'a message sent mid-turn');
    assert.strictEqual(dev([human('Ладно, делай как сказал.')]), null);
    assert.ok(denied(dev([JSON.stringify({ type: 'user', isMeta: true, origin: { kind: 'peer' }, message: { role: 'user', content: 'делай как сказал' } })])), 'a subagent report');
    assert.ok(denied(dev([JSON.stringify({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'User said: делай как сказал' } })])), 'a compaction summary');
    assert.ok(denied(dev([JSON.stringify({ type: 'api-request-blob', message: { role: 'user', content: 'делай как сказал' } })])), 'a copy of an API request');
  } }
);

// Audit gate (3.3): a Standard or Full change made in the session does not end the turn unaudited.
// The transcript is written first, so files touched afterwards count as changed in the session.
const auditProject = () => {
  const dir = contractProject();
  const transcript = transcriptWith(say('user', 'Сделай экспорт') + '\n');
  return { dir, transcript };
};
const touch = (dir, rel, content, when = Date.now() / 1000 + 5) => {
  put(dir, rel, content);
  fs.utimesSync(path.join(dir, rel), when, when);
};
const OLD = Date.parse('2020-01-01') / 1000;
const stopAt = (p, extra = {}, env) => hookJson('audit-gate.js', {
  hook_event_name: 'Stop', cwd: p.dir, session_id: 's1', transcript_path: p.transcript, stop_hook_active: false,
  last_assistant_message: 'Готово: экспорт работает, тесты зелёные.', ...extra }, env);
const blocked = (r) => Boolean(r && r.decision === 'block');
scenarios.push(
  { name: 'A1: no contract, a repeated stop, the override, docs-only and older changes pass', run() {
    const bare = { dir: initRepo(), transcript: transcriptWith('') };
    touch(bare.dir, 'src/a.js', 'x');
    assert.strictEqual(stopAt(bare), null, 'no contract');
    const p = auditProject();
    touch(p.dir, '.workteam/interview/s1.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(p.dir, 'docs/specs/x.md', '# Спека\n');
    touch(p.dir, 'src/old.js', 'x', OLD);
    assert.strictEqual(stopAt(p), null, 'docs and a change older than the session');
    touch(p.dir, 'src/a.js', 'x');
    assert.strictEqual(stopAt(p, { stop_hook_active: true }), null, 'a repeated stop is never held');
    assert.strictEqual(stopAt(p, {}, { WORKTEAM_SKIP: 'audit-gate' }), null);
  } },
  { name: 'A2: a Standard change without an audit is held; an audit, a pending line or a running auditor pass', run() {
    const p = auditProject();
    touch(p.dir, '.workteam/interview/s1.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(p.dir, 'src/export.js', 'x');
    const r = stopAt(p);
    assert.ok(blocked(r) && r.reason.includes('src/export.js') && r.reason.includes('blind-audit'), JSON.stringify(r));
    assert.strictEqual(stopAt(p, { last_assistant_message: 'Сделал половину.\n\nAudit: pending — жду ответа про канал' }), null);
    for (const last of ['Готово.\nAudit: не нужен, правка маленькая', 'Готово.\nAudit: complete', 'Готово.\nAudit: pending —'])
      assert.ok(blocked(stopAt(p, { last_assistant_message: last })), `only «pending — why» is an exception: ${last}`);
    assert.strictEqual(stopAt(p, { background_tasks: [{ id: 't1', type: 'subagent', status: 'running', agent_type: 'workteam:auditor' }] }), null);
    touch(p.dir, '.workteam/audit/old.audit.md', '# Findings', OLD);
    assert.ok(blocked(stopAt(p)), 'an audit from before the session does not count');
    touch(p.dir, '.workteam/audit/export.review.md', '# Review');
    assert.ok(blocked(stopAt(p)), 'a critic review is not an audit');
    touch(p.dir, '.workteam/audit/export.audit.md', '# Findings');
    assert.strictEqual(stopAt(p), null, 'audited in the session');
  } },
  { name: 'A3: light passes; an undeclared change is held with the Light line to write; a decision found only in a brief counts', run() {
    const p = auditProject();
    touch(p.dir, 'src/a.js', 'x');
    const r = stopAt(p);
    assert.ok(blocked(r) && r.reason.includes('no route declared') && r.reason.includes('.workteam/interview/s1.md'), 'a shell-only edit with no decision: ' + JSON.stringify(r));
    touch(p.dir, '.workteam/interview/s1.md', 'Interview: light — опечатка\n');
    assert.strictEqual(stopAt(p), null, 'light');
    const q = auditProject();
    const dispatch = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'workteam:developer', prompt: 'Build it.\nInterview: .workteam/briefs/x-interview.md' } }] } });
    fs.appendFileSync(q.transcript, dispatch + '\n');
    touch(q.dir, 'src/a.js', 'x');
    assert.ok(blocked(stopAt(q)), 'the developer built it under a Standard decision');
  } },
  { name: 'A4: a change committed in the session, a deleted file and a deleted folder count; a non-ASCII docs commit and a commit just before the session do not', run() {
    const p = auditProject();
    touch(p.dir, '.workteam/interview/s1.md', 'Interview: settled — «Сделай экспорт»\n');
    put(p.dir, '.gitignore', '.workteam/\n');
    touch(p.dir, 'src/export.js', 'x');
    const later = new Date(Date.now() + 5000).toISOString();
    execFileSync('git', ['add', '-A'], { cwd: p.dir });
    execFileSync('git', ['commit', '-q', '-m', 'export'], { cwd: p.dir, env: { ...process.env, GIT_AUTHOR_DATE: later, GIT_COMMITTER_DATE: later } });
    const r = stopAt(p);
    assert.ok(blocked(r) && r.reason.includes('src/export.js'), 'committed in the session: ' + JSON.stringify(r));
    const q = auditProject();
    touch(q.dir, '.workteam/interview/s1.md', 'Interview: settled — «Убери старый экспорт»\n');
    put(q.dir, '.gitignore', '.workteam/\n');
    put(q.dir, 'src/legacy.js', 'x');
    const old = { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' };
    execFileSync('git', ['add', '-A'], { cwd: q.dir, env: old });
    execFileSync('git', ['commit', '-q', '-m', 'legacy'], { cwd: q.dir, env: old });
    fs.utimesSync(path.join(q.dir, 'src'), OLD, OLD);
    assert.strictEqual(stopAt(q), null, 'an old commit and no change in the session');
    fs.rmSync(path.join(q.dir, 'src/legacy.js'));
    assert.ok(blocked(stopAt(q)), 'deleted in the session');
    const w = auditProject();
    touch(w.dir, '.workteam/interview/s1.md', 'Interview: settled — «Убери старый модуль»\n');
    put(w.dir, '.gitignore', '.workteam/\n');
    put(w.dir, 'src/legacy/a.js', 'x');
    execFileSync('git', ['add', '-A'], { cwd: w.dir, env: old });
    execFileSync('git', ['commit', '-q', '-m', 'legacy module'], { cwd: w.dir, env: old });
    fs.rmSync(path.join(w.dir, 'src/legacy'), { recursive: true });
    const r2 = stopAt(w);
    assert.ok(blocked(r2) && r2.reason.includes('src/legacy/a.js'), 'a whole folder deleted in the session: ' + JSON.stringify(r2));
    const n = auditProject();
    touch(n.dir, '.workteam/interview/s1.md', 'Interview: settled — «Запиши заметки»\n');
    put(n.dir, '.gitignore', '.workteam/\n');
    touch(n.dir, 'docs/заметки.md', '# Заметки\n');
    execFileSync('git', ['add', '-A'], { cwd: n.dir });
    execFileSync('git', ['commit', '-q', '-m', 'notes'], { cwd: n.dir });
    assert.strictEqual(stopAt(n), null, 'a docs-only commit with a non-ASCII name is not a product change');
    const f = initRepo();
    put(f, 'AGENTS.md', '<!-- workteam:contract v' + pluginVersion + ' -->\n<!-- /workteam:contract -->\n');
    put(f, '.gitignore', '.workteam/\nAGENTS.md\n');
    put(f, 'src/fixture.js', 'x');
    execFileSync('git', ['add', '-A'], { cwd: f });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: f });
    assert.strictEqual(stopAt({ dir: f, transcript: transcriptWith(say('user', 'Нужна фича') + '\n') }), null, 'a commit in the second before the session is not the session\'s');
  } }
);

// Audit inputs (3.3): the auditor gets the change package of the session without the lead building it.
const OLD_GIT = { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' };
const sessionRepo = () => {
  const dir = initRepo();
  put(dir, '.gitignore', '.workteam/\n');
  put(dir, 'src/a.js', 'module.exports = 1;\n');
  execFileSync('git', ['add', '-A'], { cwd: dir, env: OLD_GIT });
  execFileSync('git', ['commit', '-q', '-m', 'before the session'], { cwd: dir, env: OLD_GIT });
  return { dir, transcript: transcriptWith(say('user', 'Сделай') + '\n') };
};
const auditorStart = (p, extra = {}, env) => hookJson('audit-inputs.js',
  { hook_event_name: 'SubagentStart', agent_type: 'workteam:auditor', cwd: p.dir, session_id: 's1abcdefgh', transcript_path: p.transcript, ...extra }, env);
scenarios.push(
  { name: 'P1: the auditor gets a package of the session built for it; other agents and the override get nothing', run() {
    const p = sessionRepo();
    put(p.dir, 'src/a.js', 'module.exports = 2;\n');
    assert.strictEqual(auditorStart(p, { agent_type: 'workteam:developer' }), null);
    assert.strictEqual(auditorStart(p, {}, { WORKTEAM_SKIP: 'audit-inputs' }), null);
    const ctx = auditorStart(p).hookSpecificOutput.additionalContext;
    const pkg = path.join(p.dir, '.workteam', 'audit', 'session-s1abcdef.change.md');
    assert.ok(ctx.includes(pkg) && ctx.includes('built by the SubagentStart hook'), ctx);
    assert.ok(fs.readFileSync(pkg, 'utf8').includes('+module.exports = 2;'), 'the uncommitted change is in the package');
  } },
  { name: 'P2: a commit made in the session is in the package; a package the lead wrote is named; an old one is not', run() {
    const p = sessionRepo();
    put(p.dir, 'src/a.js', 'module.exports = 3;\n');
    execFileSync('git', ['add', '-A'], { cwd: p.dir });
    execFileSync('git', ['commit', '-q', '-m', 'in the session'], { cwd: p.dir });
    put(p.dir, 'src/b.js', 'module.exports = 4;\n');
    const stale = path.join(p.dir, '.workteam', 'audit', 'old.change.md');
    put(p.dir, '.workteam/audit/old.change.md', '# old');
    fs.utimesSync(stale, Date.parse('2020-01-01') / 1000, Date.parse('2020-01-01') / 1000);
    const ctx = auditorStart(p).hookSpecificOutput.additionalContext;
    assert.ok(!ctx.includes('old.change.md'), 'a package from before the session is not reused');
    const built = fs.readFileSync(path.join(p.dir, '.workteam', 'audit', 'session-s1abcdef.change.md'), 'utf8');
    assert.ok(built.includes('+module.exports = 3;') && built.includes('src/b.js'), 'committed and uncommitted work of the session');
    put(p.dir, '.workteam/audit/lead.change.md', '# the lead\x27s package');
    fs.utimesSync(path.join(p.dir, '.workteam/audit/lead.change.md'), Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    assert.ok(auditorStart(p).hookSpecificOutput.additionalContext.includes('lead.change.md (written in this session)'));
  } },
  { name: 'P3: a session that makes the repository\'s first commit is packaged from the empty tree', run() {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-first-'));
    tempRepos.push(dir);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const p = { dir, transcript: transcriptWith(say('user', 'Сделай') + '\n') };
    put(dir, '.gitignore', '.workteam/\n');
    put(dir, 'src/first.js', 'module.exports = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', 'commit', '-q', '-m', 'first'], { cwd: dir });
    const ctx = auditorStart(p).hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('the empty tree'), ctx);
    assert.ok(fs.readFileSync(path.join(dir, '.workteam', 'audit', 'session-s1abcdef.change.md'), 'utf8').includes('+module.exports = 1;'), 'the committed first file is in the package');
  } },
  { name: 'P4: a repository with no commit at all still gets a package of its files', run() {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workteam-unborn-'));
    tempRepos.push(dir);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const p = { dir, transcript: transcriptWith(say('user', 'Сделай') + '\n') };
    put(dir, '.gitignore', '.workteam/\n');
    put(dir, 'src/first.js', 'module.exports = 5;\n');
    const ctx = auditorStart(p).hookSpecificOutput.additionalContext;
    const pkg = fs.readFileSync(path.join(dir, '.workteam', 'audit', 'session-s1abcdef.change.md'), 'utf8');
    assert.ok(ctx.includes('the empty tree') && pkg.includes('src/first.js') && pkg.includes('HEAD: (none: no commit yet)'), ctx);
  } }
);

// Run ledger (3.4): the hooks write what they saw to .workteam/runs/<session>.jsonl; agents do not.
const ledgerOf = (dir, id = 's1') => {
  try { return fs.readFileSync(path.join(dir, '.workteam', 'runs', `${id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};
scenarios.push(
  { name: 'L1: the hooks record agents, evidence, interview dispatches and refusals, held and passed stops and the package; nothing without a contract', run() {
    const p = auditProject();
    const base = { cwd: p.dir, session_id: 's1', transcript_path: p.transcript };
    hookJson('agent-log.js', { ...base, hook_event_name: 'SubagentStart', agent_type: 'workteam:developer', agent_id: 'a1' });
    hookJson('evidence-gate.js', { ...base, hook_event_name: 'SubagentStop', agent_type: 'workteam:developer', stop_hook_active: false, last_assistant_message: 'Done.' });
    hookJson('agent-log.js', { ...base, hook_event_name: 'SubagentStop', agent_type: 'workteam:developer', agent_id: 'a1' });
    hookJson('agent-log.js', { ...base, hook_event_name: 'SubagentStop', agent_type: '' });
    hookJson('interview-gate.js', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'workteam:developer', prompt: 'Build it.' } });
    hookJson('interview-gate.js', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'workteam:developer', prompt: 'Build it.\nInterview: light — one label' } });
    hookJson('interview-gate.js', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(p.dir, 'src/x.js') } });
    touch(p.dir, '.workteam/interview/s1.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(p.dir, 'src/export.js', 'x');
    stopAt(p);
    hookJson('audit-inputs.js', { ...base, hook_event_name: 'SubagentStart', agent_type: 'workteam:auditor' });
    touch(p.dir, '.workteam/audit/export.audit.md', '# Findings');
    stopAt(p);
    const events = ledgerOf(p.dir);
    const kinds = events.map((e) => e.ev + ':' + (e.phase || e.what || (e.held ? 'held' : 'ok')) + (e.ev === 'interview' || e.ev === 'evidence' ? (e.ok ? '+' : '-') : ''));
    assert.deepStrictEqual(kinds, ['agent:start', 'evidence:ok-', 'agent:stop', 'interview:dispatch-', 'interview:dispatch+', 'interview:edit-', 'audit-gate:held', 'audit-package:ok', 'audit-gate:ok'], kinds.join(' '));
    assert.strictEqual(events[4].decision, 'light — one label');
    assert.deepStrictEqual(events[6].changed, ['src/export.js']);
    assert.ok(events[7].built && events[7].offered.endsWith('.change.md') && events[8].why === 'audited', JSON.stringify(events.slice(7)));
    const bare = initRepo();
    hookJson('agent-log.js', { cwd: bare, session_id: 's1', hook_event_name: 'SubagentStart', agent_type: 'workteam:developer' });
    assert.ok(!fs.existsSync(path.join(bare, '.workteam')), 'no contract, no ledger');
  } },
  { name: 'L2: SessionStart sums up this session after a compaction and the previous one on a fresh start', run() {
    const p = auditProject();
    const start = (id, source) => JSON.parse(runHook('session-start.js', { cwd: p.dir, rawStdin: JSON.stringify({ cwd: p.dir, source, session_id: id }) }).stdout).hookSpecificOutput.additionalContext;
    assert.ok(!start('s1', 'startup').includes('Last session'), 'nothing recorded yet');
    hookJson('agent-log.js', { cwd: p.dir, session_id: 's1', hook_event_name: 'SubagentStop', agent_type: 'workteam:auditor' });
    const compact = start('s1', 'compact');
    assert.ok(compact.includes('This session so far: interview: no decision; subagent stops: auditor ×1'), compact);
    assert.ok(start('s3', 'compact').includes('This session so far: interview: no decision; subagent stops: none'), 'an empty current session, not the previous one');
    const fresh = start('s2', 'startup');
    assert.ok(fresh.includes('Last session (') && fresh.includes('.workteam/runs/s1.jsonl') && fresh.includes('auditor ×1'), fresh);
  } },
  { name: 'L3: runs.js prints the timeline of the latest session and lists them all', run() {
    const p = auditProject();
    hookJson('agent-log.js', { cwd: p.dir, session_id: 's9', hook_event_name: 'SubagentStart', agent_type: 'workteam:critic' });
    hookJson('agent-log.js', { cwd: p.dir, session_id: 's9', hook_event_name: 'SubagentStop', agent_type: 'workteam:critic' });
    const out = execFileSync(process.execPath, [path.join(hooksDir, '..', 'scripts', 'runs.js'), '--project', p.dir], { encoding: 'utf8' });
    assert.ok(out.includes('.workteam/runs/s9.jsonl — interview: no decision; subagent stops: critic ×1') && /agent\s+start critic/.test(out), out);
    const list = execFileSync(process.execPath, [path.join(hooksDir, '..', 'scripts', 'runs.js'), '--list', '--project', p.dir], { encoding: 'utf8' });
    assert.ok(list.includes('s9') && list.includes('critic ×1'), list);
  } }
);

// Pending audits (3.5): recorded with their reason and files, reminded at every session start until
// an audit runs or the user waives it in their own words.
const sessionOf = (dir, id, userText = 'Сделай экспорт') => ({ dir, id, transcript: transcriptWith(say('user', userText) + '\n') });
const stopIn = (s, last, extra = {}) => hookJson('audit-gate.js', { hook_event_name: 'Stop', cwd: s.dir, session_id: s.id, transcript_path: s.transcript, stop_hook_active: false, last_assistant_message: last, ...extra });
const startOf = (dir, id) => JSON.parse(runHook('session-start.js', { cwd: dir, rawStdin: JSON.stringify({ cwd: dir, source: 'startup', session_id: id }) }).stdout).hookSpecificOutput.additionalContext;
scenarios.push(
  { name: 'A5: a pending stop is recorded with its reason and files; a waiver passes only in the user\'s words', run() {
    const dir = contractProject();
    const a = sessionOf(dir, 'p1');
    touch(dir, '.workteam/interview/p1.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(dir, 'src/export.js', 'x');
    assert.strictEqual(stopIn(a, 'Сделал половину.\nAudit: pending — жду ответа про канал'), null);
    const pend = ledgerOf(dir, 'p1').find((e) => e.why === 'pending');
    assert.ok(pend && pend.reason === 'жду ответа про канал' && pend.changed.includes('src/export.js'), JSON.stringify(pend));
    const b = sessionOf(dir, 'p2', 'Аудит не нужен, это прототип');
    touch(dir, '.workteam/interview/p2.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(dir, 'src/export.js', 'y');
    const fake = stopIn(b, 'Готово.\nAudit: waived — «пользователь разрешил»');
    assert.ok(blocked(fake) && fake.reason.includes('A waiver counts only in words the user wrote'), JSON.stringify(fake));
    assert.strictEqual(stopIn(b, 'Готово.\nAudit: waived — «аудит не нужен, это прототип»'), null);
    assert.ok(ledgerOf(dir, 'p2').some((e) => e.why === 'waived' && e.reason === 'аудит не нужен, это прототип'));
  } },
  { name: 'L4: a pending audit is reminded until an audit or a waiver in the user words closes it, even in a session that changed no code', run() {
    const dir = contractProject();
    const s1 = sessionOf(dir, 'r1');
    touch(dir, '.workteam/interview/r1.md', 'Interview: settled — «Сделай экспорт»\n');
    for (let i = 1; i <= 22; i++) touch(dir, `src/f${i}.js`, 'x');
    stopIn(s1, 'Audit: pending — аудит после ответа заказчика');
    assert.strictEqual(ledgerOf(dir, 'r1').find((e) => e.why === 'pending').changed.length, 22, 'every changed file is recorded');
    const reminded = startOf(dir, 'r2');
    assert.ok(reminded.includes('Audit pending since') && reminded.includes('аудит после ответа заказчика') && reminded.includes('and 17 more (all in .workteam/runs/r1.jsonl)'), reminded);
    stopIn(sessionOf(dir, 'r2'), 'Ответил на вопрос.');
    assert.ok(startOf(dir, 'r3').includes('Audit pending since'), 'a session without changes does not clear it');
    touch(dir, '.workteam/audit/export.audit.md', '# Findings');
    stopIn(sessionOf(dir, 'r3'), 'Аудит прошёл.');
    assert.ok(!startOf(dir, 'r4').includes('Audit pending since'), 'an audit clears it, though the session changed no code');
    fs.utimesSync(path.join(dir, '.workteam/audit/export.audit.md'), OLD, OLD);
    touch(dir, '.workteam/interview/r5.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(dir, 'src/export.js', 'w');
    stopIn(sessionOf(dir, 'r5'), 'Audit: pending — позже');
    assert.ok(startOf(dir, 'r6').includes('позже'));
    stopIn(sessionOf(dir, 'r6', 'Аудит этой правки не нужен'), 'Audit: waived — «аудит этой правки не нужен»');
    assert.ok(!startOf(dir, 'r7').includes('Audit pending since'), 'the user\'s waiver clears it, though the session changed no code');
  } },
  { name: 'A6: the repeated stop after a hold is recorded, not held: a pending line, an ignored hold and an audit', run() {
    const dir = contractProject();
    const again = { stop_hook_active: true };
    const a = sessionOf(dir, 'h1');
    touch(dir, '.workteam/interview/h1.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(dir, 'src/export.js', 'x');
    assert.ok(blocked(stopIn(a, 'Готово.')), 'the first stop is held');
    assert.strictEqual(stopIn(a, 'Жду ответа.\nAudit: pending — жду решения по каналу', again), null);
    assert.ok(ledgerOf(dir, 'h1').some((e) => e.why === 'pending' && e.reason === 'жду решения по каналу'), 'a pending line written after the hold is recorded');
    assert.ok(startOf(dir, 'h2').includes('жду решения по каналу'), 'and reminded');
    const b = sessionOf(dir, 'h2');
    touch(dir, '.workteam/interview/h2.md', 'Interview: settled — «Сделай экспорт»\n');
    touch(dir, 'src/export.js', 'y');
    assert.ok(blocked(stopIn(b, 'Готово.')));
    assert.strictEqual(stopIn(b, 'Готово, всё работает.', again), null, 'never held twice');
    const ign = ledgerOf(dir, 'h2').find((e) => e.why === 'ignored');
    assert.ok(ign && ign.changed.includes('src/export.js'), JSON.stringify(ledgerOf(dir, 'h2')));
    const reminded = startOf(dir, 'h3');
    assert.ok(reminded.includes('Audit pending since') && reminded.includes('without an audit') && reminded.includes('ended after the hold without it'), reminded);
    touch(dir, '.workteam/audit/export.audit.md', '# Findings');
    assert.strictEqual(stopIn(sessionOf(dir, 'h3'), 'Аудит прошёл.', again), null);
    assert.ok(ledgerOf(dir, 'h3').some((e) => e.why === 'audited'), 'an audit run after the hold is recorded');
    assert.ok(!startOf(dir, 'h4').includes('Audit pending since'), 'and closes the reminder');
  } }
);

// Runner: stop at the first failure — a broken helper fails every later
// scenario, and the first name is the one worth reading.
let failures = 0;
for (const scenario of scenarios) {
  try {
    scenario.run();
  } catch (err) {
    console.error(`FAILED ${scenario.name}\n  ${err.message}`);
    failures += 1;
    break;
  }
}
if (failures) process.exit(1);
console.log(`${scenarios.length} passed`);
