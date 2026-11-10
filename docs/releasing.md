# Releasing Workteam

1. Work in an isolated branch. Update version fields in both compatibility manifests and
   the marketplace, and update the `templates/AGENTS.md` contract marker.
   Regenerate Codex roles after prompt edits.
2. Review `.public-files.json` explicitly. Add public source, tests and docs by exact path.
   Never add personal configuration, transcripts, real project cases, private notes or keys.
3. Run `node scripts/check.js`. Export to a new directory with
   `node scripts/export-public.js NEW_DIRECTORY --repository Inspired-0/workteam`.
   The exporter also supports a `distribution/public/` documentation overlay when present.
4. Run `node scripts/check.js`, `node scripts/check-public.js` and `claude plugin validate .`
   inside the export. Run Gitleaks with redaction over both files and the public Git history.
   A private identity denylist may be passed as the second argument to `check-public.js`
   after the export path; keep that denylist outside the public repository.
5. Inspect all changed content, URL/email references, image metadata and Git author metadata. The binary icon is pinned to its reviewed SHA-256
   in `scripts/check-public.js`; review any replacement before changing that digest.
   Use a project pseudonym and a no-reply address for public commits when maintaining privacy.
   Do not copy development Git history into a new public repository.
6. Test installation, onboarding, update and removal with disposable client profiles. Test
   hook trust in the normal host flow; do not disable sandbox or approval protections.
7. Update the changelog. Publish reviewed files, wait for CI, then tag the verified commit
   and create its release. Archive only the explicit file list, never the working directory.

The checks cannot establish an absolute absence of secrets or vulnerabilities. A passing
scan reports what was examined; review remains part of every release.
