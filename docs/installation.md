# Installation, updates and removal

Use Node.js 20+, Git and Bash on macOS or Linux (or Windows through WSL).
Release 3.7.0 was checked with Claude Code 2.1.319 and Codex CLI 0.167.0.
Claude manifest validation and install/update/removal were tested; live model execution
was not tested in Claude. Codex was also exercised with a live account.
The package uses each host's supported manifest directory (`.claude-plugin/` and
`.codex-plugin/`). Older clients may not support every hook or plugin command; update the client if a command
is missing. Workteam uses your own host account and its available models.

## First session

Follow the install commands in the README. Restart the session after installation.
In Codex, use `/hooks` to review and trust the installed hook definition. Trust may need to
be renewed when a release changes the hooks. Until trusted, hooks do not run.

Ask for `workteam:project-onboarding`. The agent preserves existing project instructions,
adds a versioned contract block to `AGENTS.md`, and records project conventions below it.
It creates documentation only where useful and adds `.workteam/` to `.gitignore`.
If the project already uses Claude instruction files, `CLAUDE.md` imports `AGENTS.md`.
For Codex, onboarding reconciles role registrations in `.codex/config.toml` with the installed
plugin path. It preserves explicit role overrides and unrelated settings. Codex may request
approval to write protected project configuration or Git hook paths. If approval is disabled,
onboarding can prepare the files but cannot finish those installation steps.

Onboarding offers a local pre-commit check. It preserves existing shell hook code and respects
`core.hooksPath`. Unsupported hook languages require manual integration. The block is scoped to the clone, including its linked worktrees; shared hook directories
retain separate registrations for other clones. Older unscoped blocks in shared paths require
their owner to migrate them. Existing disabled hooks are left unchanged for their owner
to enable or integrate explicitly. Removal preserves hook permissions. The check invokes Node.js and blocks detected credential patterns or tracked `.workteam/` files.

## Model and language settings

Claude roles inherit the current model. Codex role files omit a model and effort so the
host resolves them from its own settings. Put explicit overrides in project-owned role
files and record the mapping in the project's Workteam profile. Do not edit installed caches.
Set your preferred language for user-facing dialogue and documents in the same profile.

A separate audit CLI process uses the host's configured default, not the calling session's
temporary model flag. To select one explicitly:

```bash
node <plugin-root>/scripts/audit-run.js --package change.md --contract contract.md --evidence evidence.md --host codex --model MODEL --effort high
```

`--model` is optional for either host; `--effort` is optional and Codex-only. Use a model and
effort supported by your account. Claude-specific commands such as `/workteam:critique` have
the equivalent role dispatch in Codex.

## Update

Claude Code, in the terminal:

```bash
claude plugin marketplace update workteam-public
claude plugin update workteam@workteam-public
```

Codex:

```bash
codex plugin marketplace upgrade workteam-public
codex plugin add workteam@workteam-public
```

Restart the session, review any changed hooks, and run onboarding again to refresh the
contract and Codex role paths. Re-run `node <current-plugin-root>/scripts/install-git-hook.js`
in each opted-in project: the commit hook points to the installed plugin's location.
If the old copy disappears, it warns and proceeds without checking until refreshed.

## Remove

Before uninstalling, run this in each enrolled project to remove only its managed Git-hook block:

```bash
node <plugin-root>/scripts/install-git-hook.js --remove
```

Then uninstall the plugin:

```bash
claude plugin uninstall workteam@workteam-public
claude plugin marketplace remove workteam-public
```

Or, for Codex:

```bash
codex plugin remove workteam@workteam-public
codex plugin marketplace remove workteam-public
```

Uninstalling the plugin leaves project-owned documentation and configuration in place.
To remove its project setup, delete the marked Workteam contract block from `AGENTS.md`,
remove only the Workteam role registrations from `.codex/config.toml`. If the hook installer
is no longer available, remove only the block whose `BEGIN/END workteam staged check <id>`
markers and embedded clone path identify this project; keep other clones' blocks. Preserve the rest of each file. Keep any useful project docs; delete `.workteam/`
only if its local audit and recovery records are no longer needed.

## Troubleshooting

- No session-start message: check plugin enablement, Node.js on `PATH`, and Codex hook trust.
- A Codex role points to a missing path: rerun onboarding from the current installation.
- A model is unavailable: remove or change the project override using the host's model picker.
- A gate blocks a legitimate workflow: inspect its reason and the project contract. The user
  can authorize a named `WORKTEAM_SKIP` override. Avoid permanent blanket overrides.
