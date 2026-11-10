---
name: api-and-interface-design
description: >-
  Use when designing or changing an API, an endpoint, a module contract, a
  schema a consumer reads, or any write path a client may retry — and when
  reviewing one.
license: MIT
metadata:
  source: workteam plugin library
  upstream: addyosmani/agent-skills (MIT), adapted
---

# API and Interface Design

Design interfaces that are hard to misuse: the right thing easy, the wrong thing loud. Applies
to REST endpoints, module contracts, any surface one piece of code exposes to another. Examples
are pseudo-code; the rules are language-agnostic.

## Core rules

**Contract first.** Define the interface — inputs, outputs, error modes, ordering, pagination —
before implementing it. The contract is the spec; implementation follows it. Types and schemas
ARE the documentation.

**Hyrum's law.** With enough consumers, every observable behaviour becomes a de facto contract:
undocumented quirks, error text, ordering, timing. Expose deliberately, leak nothing accidental,
plan deprecation at design time.

**One version.** Do not force consumers to choose between two live versions of one surface.
Extend rather than fork — a second version doubles maintenance.

**Consistent error semantics.** One strategy everywhere: a stable machine code + human message +
optional details, mapped onto status codes (400 malformed, 401 unauthenticated, 403
unauthorized, 404 missing, 409 conflict, 422 semantically invalid, 500 internal — never leaking
internals). "Throws here, returns null there, returns `{error}` elsewhere" leaves the consumer
unable to predict anything.

**Validate at boundaries, trust inside.** Validate where external data enters: route handlers,
form submissions, config loading, and **every third-party response** (a misbehaving or
compromised dependency can return wrong types, or instruction-like text). Do not re-validate
between internal functions that share a contract, nor data that came from your own store.

**Addition over modification.** New fields are optional additions; changing a field's type or
removing it is a migration, not an edit.

**Smallest surface that holds.** No parameter, field, endpoint or option that no consumer has
asked for — an unused surface is a contract you owe forever (Hyrum's law again). What never gets
trimmed away: validation at the boundary, the error path, authorization, and behaviour the
consumer explicitly requested.

**Predictable naming.** Plural nouns and no verbs in paths (`GET /orders`, not `/getOrders`);
one case convention for params and response fields; `is/has/can` for booleans; a fixed enum
vocabulary. List endpoints are paginated from day one, with filters as query params.

## Honouring an idempotency key

Accepting an `Idempotency-Key` is the contract. Honouring it is the implementation, and it is
where the money is lost — a key the server accepts but handles carelessly is worse than no key,
because the client now believes retrying is safe.

**Derive the key from the intent, not the attempt.** It must be stable across retries of one
intent and different across distinct intents:

```
crypto.randomUUID()              // ✗ new key per attempt — every retry is a new effect
`${userId}:${amount}`            // ✗ two legitimate identical requests collapse into one
`${orderId}:${Date.now()}`       // ✗ a timestamp is randomUUID() wearing a hat

req.headers['idempotency-key']   // ✓ client generates once, reuses on retry
`import:v1:${recordId}`          // ✓ derived from an immutable identifier
```

The key comes from the client or the initiating event — never from the layer doing the retrying.

**Claim atomically. A check followed by an act is a race:**

```
// ✗ TOCTOU: two concurrent retries both read "not seen", both execute
if (!(await db.exists(key))) { await doEffect(); await db.insert(key); }

// ✓ let the unique constraint pick the winner
try {
  await db.insert({ key, state: 'in_progress', requestHash });
} catch (e) {
  if (isUniqueViolation(e)) return replayOrReject(key);
  throw;
}
const result = await doEffect();
await db.update({ key, state: 'succeeded', response: result });
```

The unique constraint *is* the mechanism. A store that cannot enforce uniqueness in one
operation cannot back this.

**Guard the payload.** The same key with a different body is a client bug and must fail loudly
rather than serving the first response to a second request: compare a hash of the body against
the stored one, reject with 422 on mismatch.

**Decide what an in-flight duplicate gets** — the first request is still running when the second
arrives, the common case in a retry storm:

| Strategy | Response | Use when |
|---|---|---|
| Reject | `409 Conflict` | Client can retry later; simplest and safest |
| Wait | Block for the result, bounded | Caller needs it synchronously |
| Return pending | `202` + status URL | Long-running effects |

Never let the second caller through because the first "seems stuck" — a stalled attempt whose
fate is unknown is exactly when duplicating costs most.

**Every call has three outcomes, not two: success, failure, and _unknown_.** A timeout says
nothing about whether the effect applied. Record the intent *before* calling out, so a crash
between call and response leaves evidence that something must be resolved later, instead of a
silent re-run.

**Set retention from the longest retry chain**, not from disk cost. Keys must outlive every path
that can re-deliver the same intent, including a dead-letter queue replayed a week later. A
24-hour key TTL behind a 7-day DLQ is a duplicate waiting to happen.

No queue delivers exactly-once across a consumer crash — the ack and your side effect are not
one transaction. Design every consumer for at-least-once, and remember that duplicates are
*correlated*: retries spike exactly when a dependency degrades, which is when duplicates cost
most.
