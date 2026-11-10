---
description: Прогнать critic по артефакту — непроверенные допущения, молчаливые развилки, где ломается
argument-hint: [путь к спеке / архитектурному документу / плану / ресёрчу]
---

Artifact to review: $ARGUMENTS

Dispatch the `critic` agent on the project review tier, raised for consequential risk.

The dispatch prompt carries exactly two things: the artifact path and the ORIGINAL task
contract — what the user asked for, the constraints, the facts already gathered, and the
interview record (`.workteam/briefs/<slug>-interview.md`) when one exists. The
SubagentStart hook gives `critic` the plugin root its skills resolve from. It carries
NONE of your own reading of the artifact and no verdict of yours: a reviewer told what to think
reviews your opinion instead of the document.

When the findings come back:
- Adjudicate each one yourself. Fix through the author (the lead may be the author); recheck changed arguments independently.
- Record each ruling with evidence; report material disagreements and unresolved risks to the user,
  plus a one-line «dismissed: <finding> — <reason>» per finding you ruled against.
- What the artifact cannot close goes to the user under «Допущения» (with the cost of being
  wrong) or «Открытые вопросы» (when only they can decide).
- Zero findings is a valid outcome — report it as such, with what `critic` verified.
