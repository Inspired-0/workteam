# ADR format

Check first whether the repo already has an ADR convention — an ADR directory (`docs/adr/`, …),
an `.adr-dir` file, adr-tools, a rule in CLAUDE.md / AGENTS.md. It wins over the format below:
match its location, extension, markup and numbering rather than starting a parallel scheme. Only
when the repo has none, use `docs/decisions/ADR-NNNN-<slug>.md` — four digits, next number = the
highest existing + 1.

```markdown
# ADR-[N]: [Decision title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-[M]
**Date:** YYYY-MM-DD

## Context
The forces at play: requirements, numbers, constraints, what pushes toward a
decision now. 3–6 sentences.

## Decision
What we choose and why — one paragraph, recommendation plus its main argument.

## Options Considered
### Option A: [Name]
A row per dimension that matters (complexity, cost, scalability, team
familiarity, …), each with a one-line because. Then **Pros:** / **Cons:**.
### Option B: [Name] — same shape.

## Trade-off Analysis
Why the chosen option wins UNDER OUR CONSTRAINTS — naming the deciding one.

## Consequences
What becomes easier; what becomes harder; what we revisit as the system grows,
and at which growth point (a threshold someone can alert on, not "when it gets big").

## Допущения
What was assumed unconfirmed and what it costs if wrong.

## Открытые вопросы
What only the user decides.
```

## Short form (small decisions)

One component, an afternoon of work, one obvious alternative — the full format is overhead that
stops people recording anything at all. The whole ADR is then: title, `**Status:** Accepted |
**Date:** YYYY-MM-DD`, and 1–3 sentences giving the context, the choice and why, naming the
alternative not taken. Add the other sections back only when the rejected options are worth
remembering or the consequences are non-obvious.

## What makes an ADR worth writing

- **Name the options explicitly.** Even when leaning one way, at least one alternative with
  honest pros — otherwise it is a rationalization written afterwards. A rejected option nobody
  would ever pick is decoration.
- **Every non-trivial assessment carries its because.** "Complexity: High" with no reason
  convinces nobody.
- **Constraints do the deciding**, and non-functional ones weigh as much as features (latency,
  cost, team expertise, maintenance burden). A comparison hanging in a vacuum is the most common
  defect in an ADR: no constraints means extract them from the user before writing.
