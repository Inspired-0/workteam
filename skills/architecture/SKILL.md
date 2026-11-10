---
name: architecture
description: >-
  Use when a design or an architecture decision is needed: designing a service,
  a significant component or a module's public structure from requirements; a
  technology or approach fork to decide and record (Kafka vs SQS, migrate or
  not); a mid-task decision that is expensive to reverse; assessing an existing
  design. Triggers: «спроектировать сервис/модуль», «выбрать между X и Y»,
  «зафиксировать архитектурное решение», «оформить ADR», «оценить архитектуру».
---

# Architecture: design and decisions

How the team designs a component and records what it decided. It prevents two failures:
choosing a technology before the data model, and a decision that lives in one person's head.
The order is data, then behaviour under failure, then technology; every fork is written once,
as an ADR.

## Modes

1. **Design** — requirements exist, the shape does not. Follow `design-method.md` in this
   directory: three numbers, data model, consistency, failure modes, technology, the 10x test,
   ownership; module boundaries and seams for code-level structure; spikes. Output: the design
   artifact below.
2. **ADR** — a fork exists ("X or Y?", "migrate to Z?") and the requirements are settled.
   Output: an ADR in the format of `adr-format.md`. Requirements still open → Design first: an
   ADR comparing options against no constraints is the most common defect.
3. **Design review** — an existing or external proposal must be assessed. The seven steps of
   `design-method.md` are the checklist of what a design owes. Output: a walkthrough naming what
   is missing, where the holes are and which trade-offs go unnamed, with a verdict and a
   recommendation, in `docs/investigations/YYYY-MM-DD_<slug>-design-review.md`. Adversarial
   review of OUR OWN artifacts is the `critic` agent's job, not this mode's.

## One home per decision

Each fork a design settles is written once, as an ADR in `docs/decisions/` — the short form for a
small one. The design artifact's «Ключевые решения» holds one line per fork: the choice and the
ADR link, never a second copy of the options and arguments.

## Proposing an ADR unprompted

Any agent about to make — or having just made — a decision that is **expensive to reverse**
(a migration, changed external contract or substantial rework) records the choice and its
alternatives. Ask about unresolved consequential decisions; a settled choice does not need
new permission, and touching multiple components alone is not an ADR trigger. Proposing = the
decision, the alternative and the reason, in one short paragraph. The lead asks only if the
decision exceeds existing authorization. An authorized consequential choice can be documented
without another approval. Reversible internal details need no ADR; record an assumption only if
it affects understanding or verification.

## Process

- **Lead**: gathers the inputs, collects the references (prior ADRs live in `docs/decisions/`,
  the stable architecture in `docs/ARCHITECTURE.md`) and writes the artifact with
  `specification`.
- **critic** reviews it before the user sees it — mandatory, per the contract's critic pass. Optional: a `developer` pass on implementability and on how the
  chosen technology behaves per official docs.
- A design or an ADR that changes a component boundary updates `docs/ARCHITECTURE.md` in the
  same chain and adds its `INDEX.md` line.

Inputs to obtain from existing project facts before asking the user: functional requirements;
the non-functional numbers (step 1 of `design-method.md` — peak flow, one-year volume, working
set, latency, availability, cost); constraints (timeline, team size, existing stack, familiarity
with the candidates). "Must handle 10K rps" and "we ship in two weeks" change the answer, so they
come from the user, never invented — ask them, or list them in «Открытые вопросы»; minor details go
to «Допущения».

## Design artifact

Written with `specification` as the section «Дизайн» of the feature spec in `docs/specs/`, or as a
standalone `docs/specs/YYYY-MM-DD_<slug>-design.md` when no feature spec accompanies it.
Translate these example section names into the project language: «Зачем», «Числа», «Модель данных», «Согласованность», «Модули и швы»,
«Отказы», «Ключевые решения» (one line per fork: the choice and its ADR), «Что ломается на
10x», «Эксплуатация», «Допущения», «Открытые вопросы». Scale it — a small service gets one page
and one paragraph per section; an empty section is deleted, not filled.

## An accepted ADR is not re-litigated

Status Accepted means settled: agents work within it and never reopen the comparison because
they would have chosen differently. New facts that break it — a new constraint, a new load
profile, the technology behaving as documented but not as expected — get a NEW ADR, and a
`Superseded by ADR-[M]` line goes into the old one. Never edit the old decision in place: why we
once chose otherwise is the point. Work contradicting an accepted ADR without superseding it is
flagged to the lead, never shipped quietly.
