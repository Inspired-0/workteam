# Workteam

Workteam adds a project workflow to **Claude Code and Codex**: clarify requirements,
keep decisions in the repository, delegate implementation, run checks and review changes.
It includes six agent roles, twelve process skills, five optional engineering skills,
and local hooks for evidence, interviews, audits and staged changes.

## Requirements

- Node.js 20 or newer, Git and Bash on your `PATH`.
- Claude Code or Codex CLI with plugin support, signed in to your own account.
- macOS or Linux. On Windows, use WSL; native Windows is not currently validated.

Workteam has no npm dependencies, account of its own or hosted service. Model usage is
charged by your chosen host/provider. Roles inherit your selected model; you can configure
project overrides. User-facing language follows your project preference or your language.

## Install

In Claude Code:

```text
/plugin marketplace add Inspired-0/workteam
/plugin install workteam@workteam-public --scope user
```

In a terminal for Codex:

```bash
codex plugin marketplace add Inspired-0/workteam
codex plugin add workteam@workteam-public
```

Start a new session. In Codex, open `/hooks` and review/trust the Workteam hooks.
Then ask the agent:

> Use workteam:project-onboarding to set up this repository. Preserve existing project instructions.

Onboarding adds a versioned block to `AGENTS.md`, maps project documentation, registers
Codex roles and offers the local Git commit check. Read [installation and removal](docs/installation.md)
for the exact effects, updates, model overrides and troubleshooting.

## Use it

- “Clarify the requirements for adding CSV exports, then write a specification.”
- “Implement the approved specification and run the relevant checks.”
- “Review this design with the critic role.”
- “Run a blind audit of the completed change against the agreed requirements.”

Small, clear changes follow a light route. Standard changes get independent review.
Architecture, authorization, migrations and sensitive data receive more review.
The lead chooses matching skills; each role reads only the skills relevant to its task.

| Role | Purpose |
| --- | --- |
| developer | Implement approved work and supply verification evidence |
| tester | Run checks and report what was actually verified |
| critic | Review specifications and designs before implementation |
| auditor | Check the finished change against its contract in a separate context |
| researcher | Gather repository facts and official documentation |
| debugger | Reproduce a failure and identify its cause |

The process skills cover onboarding, interviews, specifications, architecture, delegation,
reviews, Git discipline, model briefing, skill curation, TDD, debugging and source research.
The optional library covers interfaces, security, production readiness, issue specifications
and questionnaires. Projects install library skills only when needed.

## What runs locally

The hooks read project instructions, state, Git status and relevant tool events. They write
local run records and audit inputs under the project's ignored `.workteam/` directory.
The optional Git hook scans staged text for common credential patterns and tracked scratch.
These checks do not detect every secret and can be bypassed with Git's `--no-verify`.

Workteam does not send telemetry or operate a server. Your host processes prompts and tool
outputs under its own account and data settings. Audit commands launch the chosen host CLI.
See [security and data handling](SECURITY.md).

## Development and releases

```bash
node scripts/check.js
node scripts/check-public.js
claude plugin validate .
```

Edit agent prompts in `agents/*.md`, then run `node scripts/build-codex-agents.js`.
Generated Codex roles must be committed with their source. See [AGENTS.md](AGENTS.md).

Releases export only paths listed in `.public-files.json`:

```bash
node scripts/export-public.js /tmp/workteam-release --repository Inspired-0/workteam
```

The destination must be new. The exporter rejects links and unexpected files; it copies no
Git history. Run the checks and a secret scanner on the export before publishing it.
See [release procedure](docs/releasing.md) and [changelog](CHANGELOG.md).

## License

MIT. Adapted materials retain their attribution in [LICENSE](LICENSE), with complete
upstream notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
