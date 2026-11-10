---
name: writing-skills
description: >-
  Use when writing, editing or reviewing a workteam skill (plugin `skills/` or
  `library/`), and when an existing skill is ignored, mistriggered or misapplied
  by agents — the body says the right thing but the behaviour does not change.
---

# Writing skills

**If you never watched an agent fail without the skill, you do not know what it has to teach.**

## 0. Mechanics

A skill is a directory holding `SKILL.md`, whose YAML frontmatter carries `name` (matching the
directory) and `description` (§1). Plugin skills, listed in every session, live in `skills/<name>/`;
skills a project installs on demand live in `library/<name>/` and also carry `license` and
`metadata` (`source`, `upstream`), which `skill-curation` copies into the project. Optional
siblings, referenced by relative path: `*.md` references for material only some branches need,
`scripts/` for executables the skill tells the agent to run. The same SKILL.md must read correctly in Codex
and Claude Code: never name a Claude-only tool as the only path (`EnterWorktree`, `TodoWrite`,
`AskUserQuestion`, `/compact`) — name the capability, harness-native option in ().

## 1. Description = trigger conditions only

The description decides "should I read this skill right now?". It states **when**, never **how**.

```yaml
# ✗ summarizes the workflow — agents follow the summary and skip the body
description: Use when executing plans - dispatches a subagent per task with review between tasks
# ✓ triggering conditions only
description: Use when executing an implementation plan with independent tasks
# ✓ triggers plus the symptom of being about to violate
description: Use when implementing any feature or bugfix, before writing implementation code
```

A workflow summary is a shortcut agents take: a description mentioning "review between tasks"
produced ONE review where the body specified two; removing it fixed that. **The body becomes
documentation agents skip.**

Rules: third person; concrete symptoms, not abstractions; one trigger per genuinely distinct
branch (synonyms are one branch twice); for disciplinary skills, the symptoms of being *about to*
violate. No client or project names — descriptions are resident in every session.

## 2. Match the form to the failure

Classify the baseline failure first: the form that bulletproofs one type measurably backfires on
another.

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Prohibition + a short red-flags list | Soft guidance ("prefer…", "consider…") |
| Output has the wrong shape (bloated, buried verdict) | Positive recipe: what the output IS, its parts in order | Prohibitions ("don't restate", "never narrate") |
| Omits a required element | Structural: a REQUIRED slot in the template | Prose reminders nearby |
| Behaviour should depend on a condition | Conditional on an observable predicate | Unconditional rule plus exemptions |

**Why prohibitions backfire on shaping problems:** negation drags the forbidden behaviour into
context and makes it more available — *don't think of an elephant*. Under a competing incentive
agents negotiate with "don't X"; a recipe leaves nothing to negotiate. Use a prohibition only as
a hard guardrail against a discipline failure, paired with the positive target even then. Note
too that "don't X unless it matters" reopens the negotiation, and exemption clauses don't scope:
"this limit doesn't apply to code blocks" still suppresses code blocks — restructure until the
rule cannot reach them.

## 3. Write it so an agent can execute it

- **Information hierarchy.** In-file steps (in order) → in-file reference (on demand) → disclosed
  reference (behind a pointer). Inline what every branch needs, disclose what only some reach.
- **Completion criteria.** Every step ends on a condition the agent can check; a vague bound
  ("understanding reached") invites stopping early. "Every changed file accounted for" beats
  "produce a change list".
- **Leading words.** A compact pretrained concept — *seam*, *fog of war*, *red* — repeated as a
  token, not a sentence, anchors a region of behaviour.
- **Prune.** One meaning, one place. Delete no-op sentences: an instruction the model obeys by
  default costs tokens and changes nothing. Never ship the triple tail (rationalizations table +
  red flags + checklist all restating the body) — one short red-flags list is the allowance.
  One-part SKILL.md ≤ ~150 lines; bigger → split or disclose.

## 4. Pressure-testing

Owed in full by a **disciplinary** skill — a rule an agent can be tempted to skip. A reference
skill owes a read against §1–§3 plus one retrieval scenario.

1. Write a scenario forcing a CHOICE, not a recitation ("3 hours in, 200 lines, manually tested,
   review at 09:00, you skipped TDD — A) start over B) commit now C) tests now").
2. Stack three or more pressures in — time, sunk cost, authority, exhaustion, "pragmatism".
3. RED: run it on a fresh subagent WITHOUT the skill; that is the failing test.
4. Capture the rationalizations VERBATIM ("I already tested it manually") — a paraphrase loses
   the wording the counter must close.
5. GREEN: write the minimum closing those specific rationalizations, nothing hypothetical; re-run
   the same scenarios with the skill present.
6. REFACTOR: close each new rationalization in the rule itself, workaround named; re-test until
   none appears. Violated anyway → ask the agent how it should have read.

## Before shipping

- [ ] Description: triggers only, third person, no client names.
- [ ] The failure is named, the form matches it, steps end on checkable criteria.
- [ ] ≤ ~150 lines, no duplicated meaning, no triple tail, no Claude-only tool as the only path.
- [ ] Disciplinary: §4 run, loopholes closed.
