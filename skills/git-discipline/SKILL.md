---
name: git-discipline
description: >-
  Use before the first edit of code work in a git repo, and again when a
  finished branch has to land. Triggers: a multi-file or risky change, parallel
  tasks, an experiment, a wrap-up with a branch or worktree still open.
---

# Git discipline

Three parts in task order: **isolation** before the first edit, **commit hygiene** during the
work, **finishing** when it is green. Merge-to-main flow: no long-lived branches.

Isolation is the lead's call, declared in the delegation prompt: multi-file or risky change,
parallel tasks, experiments → isolate; a small single-file edit → work in place, skip to Part 2.
Ask only about unresolved blockers or actions not already authorized. Worktree cleanup must
preserve files not covered by the integration.

## Part 1 — Isolation

**Step 0: detect isolation you already have.**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
git rev-parse --show-superproject-working-tree   # prints a path → submodule, not a worktree
```

`GIT_DIR != GIT_COMMON` and not a submodule → already in a linked worktree. Do NOT create another;
go straight to Step 2.

**Step 1: create one, in this order.**

1. Inside Orca (`ORCA_WORKTREE_ID` is set): `orca worktree create --name <short> --json`, then
   `cd` into `result.worktree.path` — the worktree shows up in Orca's UI. Orca names the branch
   itself (user prefix, `/` → `-`): take it from `result.worktree.branch`, not from `--name`.
2. Native worktree isolation if the harness offers it (Claude Code: `EnterWorktree`) — it owns
   placement, branch creation and cleanup registration.
3. Otherwise plain git:
   ```bash
   git check-ignore -q .worktrees || { echo ".worktrees/" >> .gitignore && git add .gitignore && git commit -m "chore: ignore .worktrees"; }
   git worktree add ".worktrees/<branch>" -b "<branch>" && cd ".worktrees/<branch>"
   ```
   The `check-ignore` line is mandatory: an unignored worktree dir commits the whole tree into
   the repo.
4. Blocked from all → say so and work in place on a branch, `git checkout -b <branch>`. Never
   silently on main.

Branch names: `feature/<short>` `fix/<short>` `chore/<short>` `refactor/<short>`.

**Step 2: dependencies and baseline.** Install per the repo's manifest (`npm install`,
`pip install -r requirements.txt`, `cargo build`, … — whatever it implies). Then, BEFORE the first
edit, run the full suite and `git status`. Record the baseline and unrelated dirty files before editing. Preserve user changes and
compare new failures against inherited ones. Continue when your scope can be isolated and
verified; ask only when overlapping changes or baseline failures block that distinction.

## Part 2 — Commit hygiene

**Atomic commits.** One logical change per commit, after every green step. `feat: add task
creation endpoint` / `test: cover invalid-payload cases` — not `add feature, fix sidebar, update
deps`. Message `<type>: what & why`, English, types `feat` `fix` `refactor` `test` `docs`
`chore`; a body line when the diff does not explain itself. Formatting and behaviour, refactor
and feature, tooling and content: two commits each, never one.

**Diff sizing.** ~100 lines per commit reviews and reverts easily; ~300 is the ceiling for one
logical change; ~1000 means decomposition was skipped.

**Save points.** Commit coherent verified slices. A red test is evidence to investigate,
including the expected RED phase of TDD. Inspect and preserve the diff; fix the cause or
selectively undo only your failed experiment. Never `git reset --hard`, discard user changes,
or delete useful work merely to restore green. Destructive reset requires explicit authorization.
Measure optimizations; keep a neutral attempt only when another stated requirement justifies it.

**Before every commit** inspect intended changes without copying credentials into the
transcript. Run `node <plugin-root>/scripts/check-staged.js` against the staged content;
install it at Git's pre-commit boundary via `project-onboarding` to cover content staged by
the commit command itself. The shell hooks are early feedback, not the enforcement boundary.
A real credential must be removed and rotated if exposed. A false positive can use
`WORKTEAM_SKIP=secret-scan` (or `workteam-ignored`, `all`) only with explicit authorization;
record the reason without copying the matched value.

**Dependency updates:** one per change, changelog read, lockfile diff reviewed, suite green before
AND after. Never batched into feature work.

**End of task:** inspect `git status`; account for your changes and preserve unrelated
modified/untracked files. Do not manufacture a clean tree by deleting someone else's work. No force-push, ever: a rejected push means the remote moved, so investigate.

## Part 3 — Finishing

Follow the project's integration policy (local merge, PR, or leave a reviewable branch).
Without one, leave the verified changes ready for review. Push, PR, publish and deploy require
authorization; existing explicit authorization for that action is sufficient.

1. **Checks on the tree being integrated.** Use the project's required suite. Reuse evidence
   for the same revision, inputs and environment; rerun after changes or a named new risk.
2. **Capture the paths BEFORE any `cd`** — afterwards they cannot be computed:
   ```bash
   WORKTREE_PATH=$(git rev-parse --show-toplevel)
   MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
   ```
3. **Merge locally:** `cd "$MAIN_ROOT" && git checkout main && git merge <branch>`.
4. **Run the project's checks on the merge result** — the full suite plus whatever the repo
   defines (lint, typecheck, build). Red → STOP: delete nothing, branch and worktree stay while
   you investigate. The merge is local and recoverable.
5. **Remove the worktree**, if one was used — before the branch: git refuses to delete a branch a
   worktree still has checked out. Orca worktree: `orca worktree rm --worktree
   "path:$WORKTREE_PATH" --json` (it also deletes the merged branch); otherwise `git worktree
   remove "$WORKTREE_PATH" && git worktree prune`. Refused (modified or untracked files) → those
   files exist NOWHERE else. **Never `--force`.** Show the user `git -C "$WORKTREE_PATH" status
   --porcelain -uall` and ask: commit them, move them out, or delete them. Existing explicit instructions for those files settle the choice.
6. **Delete the branch:** `git branch -d <branch>`, unless `orca worktree rm` already did.

**Merge conflicts.** Recover the intent of BOTH sides from history — `git log` of each branch on
the conflicted file plus the commit messages — and resolve by intent; never invent an "average"
behaviour neither side wrote. Then run the FULL suite: conflicts break neighbours. Intent
undeterminable → STOP, leave the merge in progress, «Открытые вопросы» with both variants.

## Red flags

- Overwriting unrelated work or treating an inherited failure as one introduced by the task.
- `git worktree add` before verifying `.worktrees/` is ignored; `--force` on a refused removal.
- Claiming green from a run earlier in the session rather than on the integrated tree.
- Pushing, opening a PR or deploying without asking, because the repo has a remote.
