# Design method

How a design is reached, in the order that stops the usual failure — picking a technology
first and discovering the data model during implementation. Data, then behaviour under
failure, then technology. `SKILL.md` in this directory says when this applies and where the
result goes.

## The order is the method

```
1. Three numbers  →  2. Data model  →  3. Consistency  →  4. Failure modes
                                                                  ↓
             7. Ownership  ←  6. The 10x test  ←  5. Technology choice
```

Apply the steps that can change the decision. A pure local module refactor starts at
«Module boundaries and seams» and existing contracts/tests; it needs no capacity questionnaire,
storage model or on-call plan. For a service or capacity-sensitive change, follow steps 1–7.
Mark inapplicable steps briefly rather than inventing numbers or assumptions.

## 1. Three numbers, before anything else

When capacity affects the choice, use existing telemetry or documented constraints first;
ask the user only for missing business inputs. Never invent measurements. Name which decision
each number changes; omit numbers that cannot affect this task.

| Number | Why it decides things |
|---|---|
| **Peak flow** — per second at the busy moment, not the average | "A cron job" vs "a queue"; averages hide the peak that breaks it |
| **Volume after a year** — rows, bytes, files, at observed growth | "One table" vs partitioning; whether the index still fits in memory |
| **Working set** — how much of that is touched in a normal hour | Caching, and whether the hot path reaches disk |

No number available → derive it from something they DO know (users x actions x hours), show the
arithmetic in one line, record it in «Допущения» with its source. An order of magnitude with
visible arithmetic is a real input; a confident number with no derivation is not. Then state
which decisions change if it is off by 10x.

## 2. Data model before behaviour

Endpoints and modules are reshaped cheaply. Data written in the wrong shape means migrations,
backfills and downtime.

- **Entities and their invariants** — what must ALWAYS be true. "An order always has at least
  one line" decides where writes are allowed.
- **Lifecycle** — the states, which transitions are legal, which terminal. The illegal ones you
  can now name ARE the validation rules and the test cases.
- **Source of truth** — for every field living in more than one place (cache, index, another
  service, an export), exactly one owner; the rest are derivatives that can be rebuilt. Two
  owners is not a design, it is a scheduled incident.
- **Identity** — what makes two records the same record: natural key, surrogate, or external id.
  This decides deduplication and idempotency downstream.
- **What is not stored** — data you decline to keep cannot leak or go stale; the cheapest data
  to protect is the data never collected.

## 3. Consistency and transaction boundaries

For each write path, one of these — chosen explicitly, written down:

| Boundary | Use when | Cost you accept |
|---|---|---|
| One transaction | Invariant spans one store, must never break | Shared database; splitting later is a migration |
| Outbox / event after commit | An effect must follow a committed write once | Delayed effect; consumers must be idempotent |
| Saga with compensation | Invariant spans services, cannot be locked | Intermediate states visible; every step needs a working undo |
| Eventual, reconciled | Divergence is tolerable if it heals | You owe a reconciliation job AND divergence detection |

Two questions settle most of it: **what must be atomic** (violating it corrupts data), and **how
long may the rest disagree** (seconds or minutes, never "quickly") — a window nobody stated is a
window nobody monitors. Every cross-boundary effect is at-least-once; no queue changes that
across a consumer crash, so retry safety is a design property, not a later fix.

## Module boundaries and seams

The same design continues inside the code. A **module** is anything with an interface and an
implementation — function, class, package, a slice spanning tiers. Its **interface** is
everything a caller must know to use it correctly: signature plus invariants, ordering, error
modes, required configuration, performance. A **seam** is a place where behaviour can be changed
without editing in that place — where the interface lives; where it goes is a decision separate
from what sits behind it.

- **Aim for depth** — much behaviour behind a small interface. A shallow module, whose interface
  is nearly as complex as what it hides, is a pass-through that adds a name and a file. Ask: can
  I remove a method, simplify the parameters, hide more inside?
- **The deletion test.** Imagine deleting it. Complexity vanishes → pass-through. Complexity
  reappears across N callers → it earned its keep.
- **Depth belongs to the interface, not the implementation** — a deep module may be composed
  internally of small swappable parts; those internal seams are not its interface.
- **One adapter is a hypothetical seam; two are a real one.** Do not cut a seam until something
  actually varies across it. Stop at the first rung that holds: not needed at all → already in
  the codebase → stdlib → native platform feature → an installed dependency → one line →
  minimum code. Validation at trust boundaries, error handling that prevents data loss,
  security, accessibility and explicitly requested behaviour are never what gets simplified away.
- **The interface is the test surface** — callers and tests cross the same seam; wanting to test
  *past* it means the module is the wrong shape. For testability: accept dependencies instead of
  constructing them inside, return results instead of mutating shared state, keep the surface
  small (fewer methods, fewer parameters, simpler setup).
- **Never assert about code nobody read** — read the file before stating what an existing module
  does, its invariants or its error modes; an unread-code claim is «требует проверки», not a fact.

**Spike = answer, not code.** A prototype answers ONE named question: throwaway from day one and
named so any reader sees it, one command to run, no persistence, no tests or abstractions beyond
what makes it run. What lands is the validated decision, never the prototype's code — that would
carry its missing error handling somewhere the absence is invisible.

## 4. Failure modes per dependency

Every dependency — database, queue, third-party API, another service, the filesystem — gets
three failures, because they need different answers:

- **Down** — refuses connections. Fast to detect, easiest to handle.
- **Slow** — answers eventually. The dangerous one: it exhausts the connection pool and turns
  one sick dependency into a total outage. Every external call gets a timeout, and that timeout
  is a chosen number, not a library default nobody looked at.
- **Wrong** — answers promptly with bad data. Validate third-party responses at the boundary.

Then the behaviour per dependency, stated: **Fail** (reject, surface the error) ·
**Degrade** (reduced results — stale cache, partial data — labelled as reduced) · **Buffer**
(accept now, process later; you now own a queue, its depth alarm, and an answer for when it
fills). "Retry" is not one of the three: it happens BEFORE you pick one, and unbounded retries
against a degraded dependency turn a brownout into an outage. Bound the attempts, back off, name
what happens after the last one.

## 5. Technology choice

Only now, and only against steps 1-4: does the candidate hold the volume from step 1, support
the boundary from step 3, behave acceptably in the failure modes from step 4, does the team know
it, what does it cost per month at that volume. The first rung that holds wins — a table in the
database you already operate beats a new store the team must learn and run. Familiarity is a
criterion, not an embarrassment — say so when it decides. Record the choice as an ADR
(`adr-format.md`); the rejected options are the point of the record.

## 6. The 10x test

Multiply the step-1 numbers by ten and name **what breaks first** — a specific component hitting
a specific limit, never "we would need to scale". Then the revisit threshold, as something
someone can alert on ("queue holds more than 50k messages", not "when it gets big"). "We will
revisit as it grows" is a promise to think later, not analysis.

## 7. Ownership

Who operates this, and what do they do at 3 a.m.? A design that cannot answer will be operated
by whoever is unlucky. Concretely: what is monitored and what pages, the runbook's first query,
and the manual recovery path for when the automatic one fails.

## What must be true

Close with the reverse test: the conditions under which your recommendation is the right one —
the numbers, constraints and team facts it rests on. Any condition not verified goes into
«Допущения» **with the cost of being wrong**. This is what `critic` reads first, and what makes
a design falsifiable instead of merely persuasive.
