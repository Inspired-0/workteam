# Claude Code model settings

Workteam roles use `model: inherit`. They use the model selected in the parent session,
unless an explicit project override is supplied. The audit runner accepts `--model MODEL`;
when omitted, its separate Claude process uses the user's configured default.

Before changing a mapping, inspect the models available to the current account and consult:
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/sub-agents

Use the tier table in `SKILL.md` and the user's cost constraints. Verify optional effort
settings against the installed host. Model names and access change; avoid hard-coded IDs
in shared project configuration unless the project explicitly requires them.
