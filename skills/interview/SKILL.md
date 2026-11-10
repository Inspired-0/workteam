---
name: interview
description: >-
  Use before building anything non-trivial on the Standard or Full route — a
  feature, a behaviour change, a spec, a design, a technology or architecture
  choice, research meant to drive a decision — the mandatory interview that
  settles what the user wants, why, and which way to build it, before the
  spec, a design or code. Triggers: «сделай …», «добавь …», «нужна фича»,
  «нужна спека», «спроектируй», «хочу, чтобы …».
---

# Interview before building

The team is good at building, and builds what it believes the user wants — a belief usually
thinner than it feels. The interview finds out what the user actually wants, why, and which way
to build it, before anything is built: knowing the why lets the team make the hundred unmentioned
decisions the way the user would. The lead runs it personally; subagents do not talk to the user.
Adapted from superpowers' brainstorming.

## When it applies

- **Light** — everything that matters is in the request (a clear, reversible, local change): no
  interview, and the decision line is `Interview: light — <what you understood>`. Light is a route,
  not a pass: a change to auth, personal data, money or a boundary is never light.
- **Standard and Full** — mandatory, before the spec, before any design and before product code.

It closes without waiting when a document the user named — a spec, a plan, an accepted ADR — or
the request itself already settles what to build: the playback (§3) opens the reply and the work
starts in the same turn, with `Interview: settled — <that document>` or `Interview: settled —
«<their words that settle it>»`; the route, and with it the spec, tester and audit, stays as
assessed. It also closes when the user opts out («без
вопросов», «делай как сказал»): state each significant choice made for them in one line, still
show the forks of §4 with their defaults, and carry `Interview: opted out — «<their words>»`.
Never re-ask what an earlier answer, the spec or an ADR settled.

The decision line goes into every `developer` brief and, before your own first
product edit, into the session file `.workteam/interview/<session id>.md` that the SessionStart
hook names — a file you write, because the gate reads files, not your messages.

## 1. Look before you ask

Read what the user pointed at, `docs/INDEX.md`, `docs/CURRENT_STATE.md`, the specs and ADRs of the
area; for code, dispatch the `researcher` subagent for a digest — where it lives, what similar
exists, nearby tests, contracts that must not break. Keep going until you can explain how the
relevant part works today and what the change would touch. Never ask what the code or the docs
answer.

## 2. The first message

About 200 words, in the project's user-facing language:

- **Что я понял** — the request in your own words: what, for whom, why, as far as they said.
- **Что нашёл** — how the relevant part works today and what the change touches.
- **Что смущает** — a constraint, a conflict or a cheaper path that would change the request, and
  each consequential fork it leaves open — personal data or secrets leaving the system, an external
  contract, money, data that is hard to undo — one line each with your default and its за / против,
  so the user sees it even if the conversation stops here; or «возражений нет» — an honest none
  beats an invented doubt.
- One line inviting corrections, then **one question**: what the request leaves open whose answer
  would most change what gets built, with what the answer would change. One decision, not two
  joined by «и»: the second waits for the next message.

«Сделай X» is often a diagnosis: when the why is missing, the first question is what led to X.

## 3. The conversation

One question per message, one sentence, specific to their project, built on their last answer
or on something you found — the consequence or the case they may have missed. Open questions
first; a short menu only when they are stuck; «на твоё усмотрение» gets a concrete proposal. A
proposal they can correct, with your reason, often beats a question. Find out early which choices
(platform, storage, libraries, rollout) they want to make and which they hand to you; a choice you
make is recorded as yours, never as theirs.

Ground to cover — territory, not a script: what this is and why now; what success looks like;
goals, non-goals and anti-goals (what would make it a failure even if it works); constraints
(deadline, load, budget, existing stack); what exists and what was tried; the details they care
about; for design work, the numbers of step 1 in `architecture`'s method.

**Play back** each part as soon as you understand it: 100–200 words, their words marked as
theirs, what you filled in marked as your proposal with its reason, ending with «что не так или
чего не хватает?». Playback and questions alternate until every part is covered.

## 4. The approaches

Once the what is settled and before anything is written, in a message of its own: the two or
three real ways to build it, each grounded in what the project already does and each with its
trade-off; your recommendation and why; then which way they want. One sensible way → say so and
why the others do not fit. Every fork that is expensive to reverse or spans components — where
state lives, sync or async, the integration boundary, reuse or new, the technology, migration and
rollout — gets the same block: options, за / против in a line each, your recommendation. The user
decides; «ок по всем» applies the recommendations.

## 5. The result

When the interview had questions or forks, write `.workteam/briefs/<slug>-interview.md` in
Project language: intent and why; goals, non-goals, anti-goals; constraints; the approaches, the chosen
one and why; decisions, each marked «решение заказчика» or «решение лида» with its reason; what
is left to the spec or the implementer; open items with the cost of being wrong. Show it and
ask for confirmation; when the user confirms, add the line `Confirmed: «<their words>»`.

- **Standard** — the record is the short contract; the audit's contract is built from it. The
  `developer` brief, or the session file before your own first edit, carries `Interview: <record>`.
- **Full** — you write the spec with `specification`; the decisions go verbatim into its «Ключевые
  решения»; a new fork you find while writing goes back to the user in the block of §4 before the
  critic pass. Later `developer` briefs carry the same line, or
  `Interview: settled — <the approved spec>` once it is committed.

A decision worth remembering past the task becomes an ADR (`architecture`).

## The gate

Nothing is built until the user confirms the record, opts out, or a document settles it.
Building includes product code, scaffolding, installing dependencies and dispatching the
a developer or a general-purpose agent; reading and exploring are fine, and the
`researcher` is not gated. A question left unanswered is asked once more; still open →
«Допущения» with the cost of being wrong, and the chain starts. A fork surfaced mid-chain stops
the chain and goes to the user in the block of §4.

The `interview-gate` hook enforces this in both hosts: it refuses those dispatches, and your own
edits outside `docs/`, `.workteam/`, host folders and `*.md`, until the brief — for your own
edits, the session file — carries one line:

| Line | Accepted when |
|---|---|
| `Interview: light — <what you understood>` | always: the route is your call, made in the open |
| `Interview: <record>` | the record exists, appeared in this session, and its `Confirmed: «…»` words are in a user message written after that |
| `Interview: settled — <doc>` | the document exists, and the user named it or it is committed |
| `Interview: settled — «<their words>»` | the words are in a user message |
| `Interview: opted out — «<their words>»` | the words are in a user message |

Only what the user typed counts — not tool output, subagent reports or summaries — and a line
the user typed is checked the same way. A record from an earlier session needs their
confirmation again, or `settled` once its spec is committed. A subagent's own edits passed at
its dispatch. Shell writes are not seen, and the session file covers your own edits for the rest
of the session: the gate stops a skipped interview, not a determined bypass.
`WORKTEAM_SKIP=interview-gate` turns it off.

## Red flags

| Thought | Reality |
|---|---|
| "Too simple to need this" | Then it is Light. Standard or Full means the interview runs. |
| "I'll ask everything at once" | One question; its answer shapes the next. |
| "I'll fill in sensible defaults" | Say them; a default they never heard is one they could not reject. |
| "They said «звучит хорошо»" | That approves what you showed, not a result you have not written. |
| "The spec will work out the goal" | The spec records the goal; the goal is settled here, with the user. |
| "I'll mark it light" | Light is a route named in the open; Standard work marked light is the skipped interview. |
