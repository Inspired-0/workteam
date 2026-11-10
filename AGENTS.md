# Working on Workteam

- Agent prompt sources are `agents/<role>.md`. After changing one, run
  `node scripts/build-codex-agents.js` and commit the generated Codex files too.
- Keep each role's skill registry in its On-demand skills table. No `skills:` frontmatter.
- Process skills live in `skills/`; optional engineering skills live in `library/`.
  Skills must work in both hosts. Use routine / standard / strong / strongest tiers and
  Critical / Important / Minor severity. Preserve upstream licenses and attribution.
- Repository writing guidance is mirrored in `.agents/skills/` and `.claude/skills/`.
  Keep the two copies identical; do not replace them with symlinks.
- Keep project state in `docs/` and private scratch in ignored `.workteam/`.
  Release exports contain only the reviewed paths in `.public-files.json`.
- Work on a branch in an isolated worktree. Test a development plugin with
  `claude --plugin-dir <worktree>` so installed releases remain stable.
- Hooks use dependency-free Node.js; entry points stay at most 60 lines. Keep
  `WORKTEAM_SKIP` as the hook override. Codex PreToolUse hooks deny or stay silent.
- Verify with `node scripts/check.js`. For a distribution, also run
  `node scripts/check-public.js` and a secret scanner over files and Git history.
- Versions in both host manifests, the marketplace and the
  contract marker must agree. Follow `docs/releasing.md` before publishing.
