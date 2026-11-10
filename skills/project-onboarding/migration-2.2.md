# Migration from the pre-2.2 layout

Reference for `SKILL.md` in this directory, read only when a repository still has the old layout.

The old layout is present when any of these exists: `docs/status.md`, `docs/architecture/`,
`docs/research/`, `.workteam/plans/`. Respect the existing layout during the current task. Offer migration separately;
it is not a prerequisite for an unrelated fix.

| Old | New |
|---|---|
| `docs/status.md` | `docs/CURRENT_STATE.md`; after the move its content is rewritten by the seven questions |
| `docs/architecture/*.md` whose heading is `# ADR-N` | `docs/decisions/ADR-NNNN-<slug>.md` — N from the heading, zero-padded to four digits; slug from the old name without the date |
| any other `docs/architecture/*.md` | `docs/specs/YYYY-MM-DD_<slug>-design.md` |
| `docs/research/*` | `docs/knowledge/` (the domain and the outside world) or `docs/investigations/` (our own system), per the researcher's inventory; doubt → ask in the same list |
| `.workteam/plans/<slug>-plan.md`, journal absent or closed | `docs/plans/completed/<slug>.md` |
| `.workteam/plans/<slug>-plan.md`, journal open | `docs/plans/active/<slug>.md` **and** `mv .workteam/sdd/<slug>-plan .workteam/sdd/<slug>` |

Closed = the last line of the journal `.workteam/sdd/<slug>-plan/` is `Stage <S>: complete`
for the plan's last stage. The journal move is not optional and appears in the list like any
other move: `sdd-workspace` derives the journal directory from the plan's basename, so
without it a resumed feature finds an empty directory and restarts from task 1. Gitignored
sources move with `mv` + `git add`, not `git mv`.

Procedure: show the user the «старое → новое» list line by line → wait for «ок» → execute →
add the `docs/INDEX.md` lines → replace the old paths in the project's `AGENTS.md` /
`CLAUDE.md` and inside the moved documents, found with
`grep -rn 'docs/architecture\|docs/research\|docs/status.md\|.workteam/plans' docs AGENTS.md CLAUDE.md`
→ one commit `chore: migrate docs to workteam 2.2 layout`.
