---
name: blind-audit
description: Use when a Standard or Full change needs independent review against its contract, or when findings must be adjudicated; not for Light changes or analysis artifacts
---

# Blind audit

An independent reviewer checks the result without the implementer's persuasive history.
The agent's half of the contract is `agents/auditor.md`. Independence is a property of the
inputs and session, not an instruction to forget context it already received.

## When

After checks, once per implementation stage. Standard may use implementer run evidence;
Full requires a separate tester. The last stage spans the whole branch and full contract.
Fix confirmed Critical tester findings first. Light work has no mandatory audit; substantive
spec/design/ADR/research reasoning goes to `critic` instead.

In both hosts the `audit-gate` hook keeps the lead's turn open after a code change in the session
— a product file modified, deleted or committed since the session began — unless the session's
interview decision is `light`, until an audit file `.workteam/audit/<slug>.audit.md` was written in
the session; the auditor subagent and `audit-run.js` both write one. A change with no decision at
all is held too, with the Light line to write if it was Light work. The auditor subagent gets a
change package from its SubagentStart hook (yours, if written in the session; otherwise one built
from the last commit before the session), and `audit-run.js` without `--package` builds the default
one. When the work pauses for the user or the audit belongs to a later session, end the message
with `Audit: pending — <why>`: the user sees it, the run ledger records the reason and the files,
and every session start reminds of it until an audit runs. The hook holds a turn once: a turn
that then ends with neither an audit nor this line is recorded as ignored and reminded the same way. Only the user can drop it: when they
say the audit is not needed, end a message with `Audit: waived — «their words»`; the hook checks the
quote against their messages.

## Build the three inputs

1. Run `bash <skill-dir>/scripts/audit-package [BASE]` from the target repo. Default BASE is
   HEAD for uncommitted work; use the recorded STAGE_BASE for committed/mixed work and the
   branch merge-base for the last stage. The package spans BASE to the working tree, including
   untracked files. It excludes `.workteam/`, `docs/plans/`, `docs/CURRENT_STATE.md` and
   `docs/INDEX.md`, and names those exclusions. Check custom process paths and exclude them
   with repeated `--exclude <repo-relative-path>` arguments. If an excluded artifact itself is
   the deliverable, give it a separate appropriate document review; do not declare it audited.
   The package lists the changed test files: a test edited to pass is the usual way a change
   fakes completion.
2. Write `.workteam/audit/<slug>.contract.md`: verbatim purpose, scope, acceptance criteria,
   approved constraints and decisions, including referenced binding ADR clauses. On a spec-less
   task use the original request and subsequent explicit decisions. Approved product constraints
   are authority, not process narrative. Exclude who argued for them and prior reviewer rulings.
   For intermediate stages mark later criteria out of scope without hiding them.
3. Provide `.workteam/audit/<slug>.evidence.md`: commands, inputs, environment, exit codes,
   observed outcomes and inspected HEAD plus working-tree diff identity. Record untracked
   inputs too when they affect a run. After changes, rerun affected checks and refresh evidence.
   Missing coverage remains unverified; do not use a report from a different revision as proof.

## Dispatch

Fresh auditor context, no parent conversation/history. Pass the three paths and repo root
only. Two ways give that:

- a separate process — the strong form: `node <plugin root>/scripts/audit-run.js --package P
  --contract C --evidence E [--host claude|codex]` runs a new read-only session in a sterile
  copy of the repository (no git history, plans, journals, state files or project instructions)
  and returns schema-checked findings (`<slug>.findings.json` and the rendered `<slug>.audit.md`
  beside the package). In Codex use this one: `codex exec` runs read-only, which a spawned role
  does not guarantee. A `--host` of the other vendor than the one that wrote the change gives a
  cross-vendor audit — reviewers of one model family agreeing is weak evidence;
- the `auditor` subagent (Claude Code) — the auditor-blind hook closes direct reads of git
  history, scratch, plans and state files, but a whole-tree search can still show lines from
  them; disclose that in the audit.

If neither can isolate history, report that limitation and call the result an independent
review, not a blind audit. Do not supply the plan, journal, implementer report,
prior findings, fix counts, or expected verdict. The auditor may read product source for a
named risk, even when its filename contains words such as `report` or `plan`.

Use the project review tier, normally strong/strongest according to risk. A more expensive
reviewer is not proof of better findings; judge by confirmed defects and false positives.

## Findings and termination

For each finding, verify the evidence, fix through the implementer or record a reasoned ruling; report each
dismissed finding as one line «dismissed: <finding> — <reason>».
Severity can change only with evidence about the consequence. An uncertain material scenario
gets a targeted check; preference alone does not justify a fix. Report unresolved material
risks and decisions to the user; minor notes need no blocking round.

One initial audit, at most two fix/recheck rounds per stage. Recheck changed behaviour and each
prior finding with a reviewer who can see those findings; this is explicitly not a blind audit.
Still materially wrong after two rounds: preserve the work and report the blocker/options.
Do not silently mark it done. The same limit applies to single-task and delegated work.
