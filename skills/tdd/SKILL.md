---
name: tdd
description: Use when implementing behaviour in testable code — a feature, or the regression test that closes a bug fix — or recovering an implementation written before its tests
---

# Test-driven development

For new behavioural code, write a focused failing check before implementing. Run it and
confirm it fails because the behaviour is missing, then make it pass. Discover the repo's
actual commands from its manifest, wrappers and CI; run them from the target repo's root.

## Scope

Test behaviour at public boundaries. Trust boundaries, data-loss paths, security,
accessibility and explicitly requested behaviours need checks. Trivial forwarding/getters,
static content, generated output and changes with no behavioural impact do not need new tests.
Use existing tools; no new framework or elaborate fixture layer for a small check.
A throwaway feasibility spike needs only the experiment that answers its question. A bug fix
starts in `systematic-debugging`; the failing test of its Phase 4 is written here.

## New implementation

1. Name the behaviour and the production defect that would make its test fail.
2. Write one minimal check with independently derived expected values; run it RED for the
   right reason, not a syntax error or broken environment.
3. Implement the smallest change, then run the focused check GREEN.
4. Refactor only where it clarifies the solution; run affected checks after changes.
5. Run the repo's required broader checks at the meaningful integration boundary. Do not
   rerun an unchanged green suite merely for reassurance.

One behaviour at a time. Mock only external/slow boundaries when needed; assert observable
outcomes, not the presence of your mock. Tests must distinguish an incorrect implementation
from the desired result, rather than mirror the implementation's calculations.

## Recovery when implementation already exists

Preserve useful code and user changes. Do not delete/rewrite implementation to recreate the
order of TDD. Derive checks from the contract independently, then demonstrate their sensitivity
with a safe isolated baseline or temporary targeted mutation when feasible. Restore your own
mutation and run the final checks. Never claim test-first history that did not happen.
If no sensitivity check is feasible, say what was verified and what remains uncertain.

## Evidence

Report the command, relevant observed result and inspected revision. An immediate GREEN test
may cover existing behaviour; confirm it detects the intended defect before relying on it.
Only new failures, changed inputs/code/environment or an uncovered risk justify more runs.
