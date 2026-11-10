# Security and data handling

Workteam is a collection of local instructions and executable hooks. Review the hooks
before trusting them. It has no hosted backend, account, telemetry endpoint or bundled
credentials. Your Claude Code or Codex account handles model requests independently.

Hooks read project instructions, Git metadata and tool events. Some gates read the local
host transcript to check whether an interview decision cites the user's actual words.
They store run events, reasons, relative filenames and audit artifacts under `.workteam/`
inside the project. Those records can contain project-sensitive information; onboarding
adds `.workteam/` to `.gitignore`. Do not publish it or attach raw transcripts to issues.
Deleting that directory removes those local records; host-managed logs have their own lifecycle.

The blind audit runner creates a temporary copy of product files without Git history or
process state and invokes the user's selected host. The model may read those copied files.
Temporary copies are removed when the runner exits normally. Review the inputs before
running an audit on a repository containing sensitive files.

The staged-file scanner catches some credential patterns and sensitive filenames. It is
an early check, not a comprehensive secret detector or access-control boundary. Host sandbox,
approval and account policies continue to apply. Model output still needs verification.

To report a vulnerability, use this repository's private vulnerability reporting feature
under Security → Report a vulnerability. Include a minimal synthetic reproduction and
affected version. Do not put live credentials, private repositories or personal data in a
public issue. If private reporting is unavailable, open an issue asking for a private channel
without disclosing the vulnerability details.
