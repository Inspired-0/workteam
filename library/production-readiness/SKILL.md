---
name: production-readiness
description: >-
  Use before something ships to production or runs there: instrumenting a feature
  (logs, metrics, traces, alerts), preparing a release or a deploy with database
  migrations or feature flags, writing the rollback plan, or after an incident the
  telemetry could not explain. Triggers: «задеплоить», «выкатить релиз», «чеклист
  перед деплоем», «добавить логи, метрики, алерты».
license: MIT
metadata:
  source: workteam plugin library, merged from deploy-checklist and observability-and-instrumentation
  upstream: addyosmani/agent-skills (MIT), adapted
---

# Production readiness

Code you cannot observe is code you cannot operate, and a deploy you cannot roll back is a bet.
Instrumentation is written alongside the feature, like tests — not after the first incident.
The deploy checklist is a working document: every box is checked with evidence (command output,
CI status, test result), never from memory. Diagnosing a failure happening right now is
`systematic-debugging`; this skill is what makes that fast.

## Who does what

- **Lead**: reads the deploy configuration and settled decisions, asks only for missing
  consequential inputs, builds the checklist, tracks it.
- **tester**: runs the verifiable items — tests, smoke checks, key flows, the telemetry checks
  of §1. Not run = not verified.
- **developer**: fixes what the checklist catches; writes the rollback plan if there is none.
- Items unverifiable in our environment (production monitoring, canary) stay as manual steps for
  the user — never dropped, never marked done by an agent.

## 1. Telemetry: questions first

Before adding a signal, write 2–4 questions the person on call will ask about this feature
("did the volume jump versus its own baseline?", "why does a fetch fail permanently?", "is the
upstream slow, or are we?"). Every signal answers one of them; no questions, no instrumentation —
you would log everything and learn nothing.

| Signal | Answers | Cost |
|---|---|---|
| Structured log | What happened in this case? | Per event, grows with traffic |
| Metric | How often, how fast, in aggregate? | Fixed per series, cheap to query |
| Trace | Where did the time go across components? | Per request, usually sampled |

Metrics say **that** something is wrong, traces say **where**, logs say **why**. If the framework
already emits request metrics and traces, wire them up before hand-rolling counters.

- **Logs are events, not prose**: a stable event name plus fields (`{event: "fetch_failed",
  jobId, attempt, errorCode}`), levels `error` (invariant broken, investigate) / `warn` (degraded
  but handled) / `info` (business event) / `debug` (off in production). A correlation id from the
  system boundary goes on every log line, span and outbound call.
- **Never log secrets, tokens or full personal data**: allowlist fields, do not dump bodies.
- **Metrics**: RED (rate, errors, duration as a histogram) on every endpoint and external
  dependency, USE (utilization, saturation, errors) on queues, pools, workers. Labels come from
  small fixed sets — never a user id, order id, request id, full URL or error text; percentiles,
  never averages.
- **Alert on symptoms, not causes**: error rate, p99 latency, queue age, throughput outside its
  baseline page; CPU, a restarted worker, disk at 70% stay on a dashboard. Every alert is
  actionable, links a runbook (what it means, first query, whom to escalate to), has a threshold
  and duration justified by an SLO or history, and is either *page* or *ticket* — two severities.
- **Verify the telemetry itself**: force an error and find it by correlation id; send test
  traffic and see the series with the expected labels; follow one request end-to-end; test-fire
  every new alert once. The strongest check: induce a failure and locate it from telemetry alone.

## 2. The deploy checklist

```markdown
## Deploy checklist: [service / release] — [date]
### Pre-deploy
- [ ] Tests pass (command + result attached)
- [ ] Change reviewed; no known critical bugs
- [ ] Migrations tested on a copy of production data; `down` path run
- [ ] Feature flags: default state and kill switch verified
- [ ] Rollback plan written (§4); on-call notified if applicable
### Deploy
- [ ] Staging deploy verified, smoke tests run
- [ ] Production deploy (canary if available)
- [ ] Error rate and latency watched for 15 min; key user flows verified
### Post-deploy
- [ ] Metrics nominal; release notes, stakeholders, tickets updated
### Rollback triggers
- [thresholds from §4]
```

Scale it: a script on one VPS needs no canary or monitoring blocks — cut what does not apply and
say so instead of leaving dead checkboxes. No staging → a local verification plan (what `tester`
runs, with which inputs). A breaking API change adds consumer notification and deprecation steps.
A checklist that will be reused lives at `docs/runbooks/<service>-deploy.md`, in the project language, with its
`INDEX.md` line; a one-off run stays in the chat or `.workteam/`.

## 3. Database migrations: expand / contract

A schema change is the one part of a deploy that reverting the code does not undo, so it never
ships as an in-place edit. Migrate in additive phases — **expand** (new nullable column or table
beside the old one) → **dual-write** → **backfill** (throttled batches, not one table-locking
`UPDATE`) → **switch reads** (keep writing both, let it bake) → **contract** (stop writing the
old shape, drop it in a separate later deploy). Old and new code are valid at every phase, which
is what makes rollback possible at each. Adds are safe in any deploy; drops and renames get their
own deploy once no code references the old shape; a migration with no tested `down` is a deploy
you cannot roll back; a risky cutover is decoupled by a feature flag.

## 4. Rollback criteria and the plan

Decide when to roll back BEFORE deploying. Thresholds come from the user or current baselines —
never invented; no baselines → "any regression in [critical flow]" plus a manual decision point.
Defaults to PROPOSE, confirmed before they enter the checklist: error rate > 2× baseline, P95
latency > 50% above baseline, new client-side errors > 0.1% of sessions, key business metric
down > 5%, with a hold-and-investigate band at about half of each. A staged rollout (internal →
5% → 25/50/100%) is worth it only if each stage has a metric and a number deciding advance, hold
or roll back.

The plan states: trigger conditions; the steps in order (kill the flag or `git revert <commit>`
and redeploy → health check → notify); what happens to data the new code wrote and whether the
migration's `down` was tested; the time to roll back per route (flag seconds, redeploy minutes,
database longest). A route nobody exercised is a plan on paper: dry-run it where the environment
allows, and say plainly when it was not.

## Two standing rules

1. **Run the checklist before every deploy**, routine ones included, and **a checked box needs
   evidence**. A checklist of unverified checkmarks is worse than none.
2. **The monitoring window presumes the telemetry of §1 exists.** Without it, that block is not
   a checkbox: replace it with the manual check the user can run, and say the deploy is unobserved.
