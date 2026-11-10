# Codex model settings

Workteam's generated role files omit `model` and `model_reasoning_effort`; roles inherit
the parent session settings. Choose from the models available to the signed-in user.
Keep explicit project overrides in project-owned role files registered in `.codex/config.toml`.
The audit runner accepts `--model MODEL` and `--effort EFFORT`; when omitted it uses the
Codex configuration. A separate audit process does not inherit a parent session's CLI flags.

For a model or effort change, consult the current host model picker and official references:
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/config-file/config-reference

Use the tier table in `SKILL.md` to choose capability for the task. Record what actually ran;
do not infer availability, pricing or performance from a model name.
