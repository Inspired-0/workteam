---
name: prompting-models
description: Use when choosing a model tier or per-model behaviour (Claude, OpenAI), troubleshooting a brief, or helping the user formulate a task
---

# Model choice and briefs

Optimize successful task cost, including retries and human intervention. A role name does
not determine difficulty. Read the host's current model catalogue before changing model IDs;
verify vendor documentation for version-dependent settings. Do not load a model catalogue
or this skill for every routine dispatch when the project already specifies the mapping.

## Tiers

| Tier | Suitable work | Escalate when |
|---|---|---|
| routine | Mechanical transformation, collecting files or reporting a command result | Correctness requires interpretation |
| standard | Clear bounded implementation, focused checks, read-only digest | An unresolved mechanism or integration crosses the brief |
| strong | Integration, debugging, test design, independent review | Targeted attempts fail or consequences require deeper analysis |
| strongest | Consequential architecture, ambiguous high-risk failure, difficult audit | Break into verifiable questions; expense alone is not quality |

Roles inherit the host's selected model and effort until a project supplies a mapping.
Use available models and the user's cost constraints to map the tiers; do not invent model IDs
or assume access to a model. Preserve explicit project overrides and use supported effort values.
Read current official documentation when changing mappings; record capability limitations.

## Anatomy of a brief (any model)

Five parts, in this order. A brief missing one of them is the usual cause of a wrong result.

| Part | What goes in | Missing it produces |
|---|---|---|
| **Goal** | What must be true when the task is done, in one or two sentences. The WHY behind it — models generalise from motivation better than from rules. | Solving the wrong problem well. |
| **Context** | File paths to read first, facts already established (as facts, not as questions), references already searched ("references already searched — do not re-search"), the project's conventions that matter here. For an agent outside the workteam roles, the `Plugin root:` line, so it can read matching skills. | Re-discovery at your expense, or fiction where a fact was missing. |
| **Constraints** | Scope in both directions (do / do not touch), style rules, what to do when a detail is missing (resolve technical unknowns by inspection or a bounded experiment; return only missing product intent as a question). State constraints as what TO do; "do not use X" works worse than "use Y". | Scope creep, refactors nobody asked for, invented details. |
| **Done when** | A check the agent can run: the test that goes green, the command and its expected exit, the diff shape. "Show the evidence, not the claim." Plus the stops you DO want: when to come back and ask. | "Looks done" as the only stop signal — or a stop at the first decision. |
| **Output contract** | What comes back and how long: files written first, then a 5–12 line summary; findings ranked; open questions separate. | A 3-page restatement of the document it just wrote. |

Rules that hold across vendors:

- **Whole task in one message, finish line named, then leave it alone.** Both vendors now
  say the same thing: describe the destination and the stopping conditions, not the steps.
  Drip-feeding costs tokens and quality on every current model.
- **Explicit beats implied.** Current models follow instructions literally and do not generalise
  from one item to the next: "apply to every section, not only the first" has to be said.
  They also do not infer "above and beyond" — ask for it if you want it.
- **One instruction, once, no contradictions.** A repeated rule is noise; a contradictory
  pair costs reasoning tokens on reconciliation and produces a hedge. Contradictory instructions can impair task performance. Reread the brief for a
  rule that fights another.
- **Motivation over emphasis.** "The output is read by a text-to-speech engine, so no
  ellipses" outlasts "NEVER use ellipses". Capitals and MUST are for the one rule that keeps
  getting skipped, not for all of them — when everything is emphasised, nothing is.
- **Examples steer format.** One concrete example of the expected output shape beats three
  adjectives about it. Wrap it so it cannot be mistaken for the task (`<example>` or a fence).
  An example that does not change behaviour is a cut candidate.
- **Files, not descriptions.** Point at the file to read; do not paraphrase its content. Long
  material goes at the TOP of the brief, the instruction after it.
- **Reviewer briefs carry the artifact and its contract, never your opinion.** A reviewer told
  what to think reviews your opinion. Ask for gaps against stated criteria, ranked, each with
  file, line, why it is wrong and how to show it fails; say explicitly that style preferences
  are optional, or you will get ten of them.
- **Name the patterns, not the adjective.** "Avoid a generic look" swaps one default for
  another; a list of the specific patterns to avoid works (both vendors, design and prose).
- **For a blind audit** use the narrower `blind-audit` input/session contract.
- **Change one meaningful prompt group at a time** and compare outcomes; model/effort tuning needs task-level evidence.
- **Secrets never travel** in a brief — only a pointer to where they live.
- **Choose the model deliberately.** Use the tier table and project profile when available; otherwise inherit the selected host model. Account for cost before raising a tier.

## Per-model behaviour

Read only the file for the model the brief goes to, when choosing within a family or when a
model misbehaves: `claude-models.md` (Claude Code) and `openai-models.md` (Codex) in this directory. Each points to official sources; model
behaviour drifts between releases, so a rule there that contradicts what a model just did loses
to the run, and the file gets updated.

## Helping the user formulate a task

Mention only missing information that would change the outcome: goal, files/context,
constraints, completion criterion or delegated decisions. Clear requests need no compulsory
interview or lesson in prompting. Project-specific tiers and models live in the project's
«Workteam profile», written by `project-onboarding`.

## Anti-patterns — recognise, then rewrite

| Brief says | Model does | Rewrite |
|---|---|---|
| "Add tests for foo" | Writes the obvious happy-path test | "Test foo for the logged-out edge case; no mocks; run them" |
| "Fix the login bug" | Patches the symptom in the file it finds first | "Login fails after session timeout; check `src/auth/`, token refresh; write a failing repro test, then fix" |
| "Review this" | Ten style nits, one real gap buried | "Review the diff against these criteria; report gaps ranked, each with file, line, why, how to show it fails; style is optional" |
