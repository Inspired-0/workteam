---
name: project-onboarding
description: >-
  Use on the first task in a repository the team has not worked in before, when
  the SessionStart hook reports a missing or outdated workteam contract in
  AGENTS.md, when the project file has drifted from the code, or when the user
  asks «адаптируй под проект», «сделай AGENTS.md проекта». Also when the repo
  still carries the pre-2.2 `docs/` layout, and when Codex roles are not
  registered for this project.
---

# Project onboarding

The process rules live in the project, not in the plugin: `AGENTS.md` carries the workteam
contract block — the map of where things live, routes, how work is done, agents — copied from
the plugin template, and below it the project's own sections: which skills matter, which
commands prove things, which conventions an agent cannot infer from the code. This skill
writes that file, the first documents of `docs/`, the team's roles for Codex, the project's
skills through `skill-curation`, and — when the repo predates the 2.2 layout — a one-commit
migration (`migration-2.2.md` in this directory). On a plugin upgrade it refreshes only the
contract block. It is the lead's job, done personally.

## Read what the task needs

You read, in this order, stopping when the answer is clear:

1. Existing `CLAUDE.md`, `AGENTS.md`, `.codex/config.toml`, and `docs/INDEX.md` plus
   `docs/CURRENT_STATE.md` where they exist — what is already declared, and whether it
   still matches the tree.
2. The manifest and lockfile (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`…),
   the CI config, the task runner (`Makefile`, `justfile`, npm scripts) — the commands that
   build, test, lint, run. These are also what fills `<test cmd>` and `<fmt cmd>` below.
3. The top two levels of the tree and the entry points — where the code lives, where the
   tests live, what the deploy target is.

For broad exploration, delegate code/docs reading to the read-only `researcher` subagent
(both hosts; in Codex once its role is registered, before that Codex's built-in explorer) —
ONE dispatch carrying two jobs, each digest ≤ 40 lines:

- **(a) digest for `docs/ARCHITECTURE.md`** — «компоненты, границы, потоки данных,
  инварианты — только факты из кода, с `file:line`».
- **(b) inventory of `docs/`** — every file → its kind (spec / ADR / design / domain
  research / our-system research / status / plan / other) and the place it belongs to per
  the contract's «Where things live» — or, for the old layout, the table in `migration-2.2.md`.

For a narrow task, read the relevant code directly. Create only context the task needs;
missing optional docs do not block useful work.

## Pick the project's skills

Run `skill-curation`: it reads the signals in the repo, names the plugin skills whose trigger
the lead would otherwise miss, installs the library or vendor skills the project needs after
its review, and writes their profile lines. Available when triggered and never named in the
profile: `git-discipline`, `blind-audit`, `delegated-implementation`, `prompting-models`,
`systematic-debugging`.

## Write the project file

Both hosts read one text: `AGENTS.md` at the repo root. Claude Code reads it directly when no
`CLAUDE.md` or `CLAUDE.local.md` exists in the root or a parent directory (Claude Code
2.1.277 and later), so no `CLAUDE.md` is created then. When one exists, the root `CLAUDE.md`
is the single import line `@AGENTS.md` (`<plugin root>/templates/CLAUDE.md`). Never keep the
same rules in two files.

**The contract block.** From `<plugin root>/templates/AGENTS.md` copy everything from the
`<!-- workteam:contract v… -->` line through `<!-- /workteam:contract -->` verbatim to the top
of `AGENTS.md`, replacing only `{{PROJECT_NAME}}`. The version in the opening marker is what
the SessionStart hook compares with the installed plugin. Never edit text inside the block for
one project: a project rule that differs from it goes into a section below — those override the
block, and the block is replaced whole on every refresh.

**Project sections** follow the block, in the template's order: Commands, Layout,
Conventions, Gotchas, Workteam profile. Repo specifics only; fill each from what you read
and ran, drop a section that has nothing to say, leave no `{{…}}` placeholder. What the
product IS goes to `docs/PROJECT.md`. Test each line with: "would removing it make an agent
do something wrong here?" Keep the project sections under ~60 lines.

- Commands: exact, copy-pasteable build / test / lint / run; mark one you did not run
  «(unverified)».
- Workteam profile: the skills `skill-curation` picked, one clause why each;
  what "done" means (test command + what green means, the smoke run); delegated decisions
  and actions needing explicit authorization; project-specific Full triggers; available model
  tiers per host; integration (local merge / PR / leave reviewable changes); the language
  for user-facing dialogue and documents (default: the user's language).

**Existing files.** `AGENTS.md` without the block: insert the block at the top, keep the
existing instructions below it as project sections in their own voice, fix what drifted, and
drop any line the block now states. `CLAUDE.md` with content: move its rules into the project
sections of `AGENTS.md` and reduce it to `@AGENTS.md`; a Claude-only line (a hook, an MCP
note) may stay below the import. Preserve unrelated instructions; existing authorization to
update project context covers these edits. Ask only about new consequential policy decisions.

**Refresh** (the hook says the block is outdated): replace the old block, markers included,
with the current template block, again replacing `{{PROJECT_NAME}}`; touch nothing below it. Then read the project sections for
lines that now contradict or repeat the new block and fix those, and reconcile the Codex
roles below — a plugin version can add roles. Show the user the diff of the block in one
line per changed rule.

## Register Codex roles (once per project)

Use `<root>/agents/codex/config-snippet.toml` as the desired role registrations, replacing
`<PLUGIN_ROOT>` with the current SessionStart plugin path. Reconcile the project's existing
`.codex/config.toml`; do not append a second `[agents]` or duplicate role table. On upgrades,
update references to older workteam snapshot paths even when the role already exists, and
remove a workteam role the snippet no longer lists (3.1 merged `explorer` and
`docs-researcher` into `researcher`; removing `explorer` restores Codex's built-in one).
Preserve unrelated settings and explicit project-local role/model overrides. Resolve a name
collision before changing someone else's role. Read the resulting TOML to confirm each role
is registered once and its target exists.

Roles inherit the host's selected model and effort so installation does not require a specific
model entitlement. Record an explicit tier-to-model mapping in the project profile when the user
wants one; preserve it on updates. Check availability before choosing a model. Codex customization
uses project-local role TOML files registered by `config_file`, not edits to generated plugin
snapshots. Configuration reference: https://learn.chatgpt.com/docs/config-file/config-reference
(checked 2026-09-30). Do not claim a live dispatch test from file validation alone.

## Docs memory

The project's memory lives in `docs/`; what goes where and in which format is the
«Where things live» table of the contract block. Onboarding creates the first files — with content, from the
interview, the README and digest (a). **A file appears when it has something to say: no
skeleton with «требует заполнения».**

- `docs/PROJECT.md` — goal, scope, non-goals, constraints, terms. A product paragraph that
  already lives in `AGENTS.md` MOVES here; it is never kept in both.
- `docs/ARCHITECTURE.md` — from digest (a). Greenfield with no code yet: not created, and
  its `INDEX.md` line says «появится с первым дизайном».
- `docs/CURRENT_STATE.md` — the seven questions; the first version is «в работе — ничего;
  следующий шаг — <задача>».
- `docs/INDEX.md` — one line per document, the files above included.
- `.workteam/` in the project's `.gitignore` (append the line if missing) — until it is
  there the `workteam-ignored` hook denies every commit.

The folders (`specs/`, `plans/active/`, `plans/completed/`, `decisions/`, `knowledge/`,
`investigations/`, `runbooks/`) appear with their first file — git stores no empty directory.

## Staged checks and project hooks

The plugin's PreToolUse checks are early feedback, not the commit boundary; the Git pre-commit
check is. Onboarding installs it — a managed block, local to the clone and removable — unless
the user declined; report it in one line with how to remove it. Run from the target repo:

```bash
node <plugin-root>/scripts/install-git-hook.js
```

This installs/updates a managed block in the actual `pre-commit` path resolved by Git,
including `core.hooksPath`. Each clone gets its own scoped block, so a shared hooks directory
does not enroll other repositories. To remove this clone's block, run the installer with
`--remove` from the project before uninstalling the plugin. Existing shell-hook code is retained; unsupported hook languages
are left intact and need a native call to `node <plugin-root>/scripts/check-staged.js`.
Refresh the managed block after a plugin upgrade so it points at the installed version.
The checker reads Git's actual index (including the temporary index for partial commits and
`commit -a`), never stages files, and returns nonzero on a finding or failed check.

Manual `node <plugin-root>/scripts/check-staged.js` checks the current index only. Git hooks
can be bypassed with `--no-verify`; CI/remote enforcement is a separate project choice.
This small pattern scanner covers text and secret filenames, not every credential format
or binary file. Do not promise complete secret prevention. Override only when explicitly
authorized, using `WORKTEAM_SKIP=secret-scan`, `workteam-ignored`, or `all`.

Reuse the project's existing test/formatter hooks. Add a new one only for a named missing
check, with a command whose cost is known. Do not run the full suite on every edit or merge
command string; verify the actual changed/integrated revision at the appropriate boundary.

## Report

Lines to the user, in the project's user-facing language: which skills you picked and the signal for each, contract
block — written / refreshed vX → vY / current, what went into the project sections, what was created in `docs/`, migration — done / not needed, project
hooks — installed / declined / unsupported language, whether Codex roles were registered, what you
were unsure about (as «Допущения»). Then the actual task begins.

## Red flags

- Project sections that restate the contract block, or edits inside the block itself.
- `CLAUDE.md` with its own copy of the rules instead of `@AGENTS.md`.
- A «Commands» section copied from a README without running one of them.
- An unrelated task blocked on a documentation migration.
