---
name: delegated-implementation
description: Use when Standard or Full implementation needs several independently verifiable tasks or stages; not for a local change with a clear focused check
---

# Delegated implementation

The route and authority come from the project contract in `AGENTS.md`. This skill
coordinates an authorized multi-task change; the word «фича» and file count alone do not
trigger it. Lead may implement a task when a dispatch would add no value; independent stage
review remains required.

## 1. Plan and workspace

Apply `git-discipline` before edits: preserve unrelated changes, isolate risky/parallel work,
record the baseline. Do not create a second worktree when already isolated. An inherited
failure is a blocker only when it prevents judging this change.

The lead writes `docs/plans/active/<feature>.md`, scaled to the work. A plan is not
another approval gate. It contains:

- Goal, contract/spec path, constraints and consequential decisions verbatim.
- File map and task dependencies; uncertainties with a check that would settle each.
- Stages: complete user-visible increments, each mapped to acceptance criteria. A small
  multi-task feature can be one stage. Never audit a half-delivered criterion as complete.
- Discoveries: new facts and the tasks/interfaces/checks they change. Mark superseded task
  instructions explicitly; retain enough history to avoid repeating failed approaches.

Each task names **Why**, **Files**, **Interfaces**, **Do**, **Verify**. Define error behaviour
and exact checks; omit literal implementation code and filler. Slice vertically where possible.
File count suggests size, not a mandatory split. Reuse source requirements instead of copying
large documents. Add the plan to `docs/INDEX.md`.

Beside the plan, `docs/plans/active/<feature>.tasks.json` holds the task list as data —
`{"tasks": [{"id": "T1", "title": "…", "verify": "<command whose exit 0 means done>", "status":
"pending"}]}`. Only `node <plugin root>/scripts/plan-status.js <file> verify <id>` changes a
status, by running that command and recording exit code and revision; a status set by hand
counts as unverified. The SessionStart hook prints the count and the next task from it.

Run `bash <skill-dir>/scripts/sdd-workspace <plan>` to create gitignored recovery state.
Record the starting revision and clean/dirty baseline. BASE is recorded, never guessed as
HEAD~1. Commit coherent task slices when the project's policy calls for it; package scripts
must not assume all work is committed.

## 2. Tasks

For each task:

1. Read relevant Discoveries and record BASE. First task BASE is STAGE_BASE.
2. Implement directly or delegate with a brief (contract «Brief»; its parts in
   `prompting-models`) that adds the task's interfaces, the relevant discoveries and the
   `Interview:` line of the work (`interview`); never repeat role bodies. A role runs on its role default; raise the tier for a high-risk task, never lower it. Do not run concurrent writers on one tree.
3. Run `plan-status.js <file> verify <id>` for the task's own check, plus any focused checks.
   A separate tester is used for independent verification or a substantial harness, not
   automatically after every small task. Write commands/results and revision identity to
   `.workteam/audit/<slug>-stage-<S>.evidence.md`.
4. Fix in-scope defects under existing authorization; a fix that does not hold goes back to
   `systematic-debugging`, and independent work continues. Escalate only a material blocker or
   a changed consequential decision, not every technical question.
5. Record relevant discoveries in the plan. Resume from the first task `plan-status.js` does
   not show as passing; never redispatch a verified one without new evidence.

## 3. Stage close

Exercise the paths composed by this stage. Reuse valid same-revision checks; add integration
checks for behaviour that task checks did not exercise. The last stage verifies the whole branch.

Then `blind-audit` over STAGE_BASE to the working tree — the last stage over the branch
merge-base and the full contract. Its inputs, evidence rules, adjudication and the two-round
limit apply as written there. No separate final audit repeating the last stage's whole-branch
audit.

## 4. Recovery and stopping

`.workteam/sdd/<feature>/journal.md` records STAGE_BASE, evidence paths, findings, rulings and
fix-round counts; task status lives in the `.tasks.json`. Only the lead writes the journal. A
verified task or a closed stage is not redone after compaction; resume an unfinished fix at its
recorded count. Gitignored scratch
is not durable storage and can be lost to cleanup: accepted facts belong in `docs/`.

Stop dependent work only for an unresolved consequential user decision, a required action
outside authorization, or a material defect with the stage loop exhausted. State the exact
blocker and recommended next action. Missing technical facts are investigated before asking.

## 5. Wrap-up

Follow project integration policy via `git-discipline`; preserve unrelated work and recovery
artifacts until integration and durable documentation are settled. Before the plan moves, ask
what the work taught that nobody knew at the start: a fact about the outside world goes to
`docs/knowledge/`, one about our system to `docs/investigations/`, each with its `INDEX.md`
line — or the report says «нового знания нет». Discoveries left only in a completed plan are
not found again. Move the finished plan and its `.tasks.json` to `docs/plans/completed/`,
update `docs/INDEX.md` and `docs/CURRENT_STATE.md` only as needed.
Report the result, verification and unresolved material risks in the project's user-facing language. No requirement for
a separate wrap-up commit or an artificially clean tree when the project uses another flow.
