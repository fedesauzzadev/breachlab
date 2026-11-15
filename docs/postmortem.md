# Postmortem: Leaked API Key Incident (BreachLab Reference Run)

> **This is a laboratory simulation** of a real-world incident pattern (leaked API
> key → endpoint abuse → DB pollution) in a fully isolated loopback sandbox. Every
> key here is **100% fake** (`sk_breachlab_demo_`, FAKE BY DESIGN). See final note.

## Summary

A long-lived API key was committed in plaintext to a versioned config file
(`repo-sim/config.json`). An automated client obtained it and started hammering
`POST /api/entries` at 4 req/s, writing garbage rows under a perfectly valid
credential. Per-key anomaly detection fired after **31 authenticated requests
inside a 10 s sliding window** (~8 s of abuse). The responder contained the
incident in three moves (kill switch, key rotation, rate limit) and then hardened
the system (sha256-hashed keys at rest, write scopes, audit log). A re-attack
with the original leaked key bounced 100%: **zero new writes, every attempt audited.**

## Impact

- **Integrity:** ~30 garbage rows persisted to the database before containment.
  100% of attacker writes succeeded pre-containment — the credential was valid,
  so every request was a first-class 201. Legitimate rows: untouched (12/12).
- **Confidentiality:** no data was exfiltrated in this run — the abuse observed
  was write-only. But the leaked key granted **read access too**; nothing but the
  attacker's choice prevented enumeration of `/api/entries`.
- **Availability:** no outage at this scale, but the attack was unbounded: at
  4 req/s the DB grows ~345k rows/day, with no natural stop. Blast radius: one
  API, one shared key. Nothing catastrophic happened — but nothing prevented it
  either; the same credential in a billing or deletion path would have been a
  different postmortem.

## Timeline (relative to attack start, T+0)

| Time | Event |
|---|---|
| Background | API key lives in plaintext inside a versioned config file. Single active key, no scopes, no rotation. It works like any legit credential — silently. |
| **T+0:00** | Attacker (automated bot, 4 req/s) starts firing `POST /api/entries` with the leaked key and garbage payloads (`SPAM-N`). Act 2. |
| **T+0:08** | **Detection:** 31 authenticated requests from one key inside the 10 s sliding window (>30 threshold) → critical alert `anomalous volume`, key masked `sk_b…3a9c`, 15 s alert cooldown. ~30 garbage rows already written, all first-class 201s. Act 3. |
| **T+0:09** | **Rapid response begins (act 4).** Kill switch disables the compromised key → every request with it now returns `403 key_disabled`. Malicious write path: dead. |
| T+0:10 | Key rotation: leaked key revoked (`401 invalid_api_key`), new key issued (masked only). Rate limit on: 10 req / 10 s per key → `429 rate_limited` + `Retry-After`. **DB garbage frozen** (~30 rows). |
| **T+0:12** | **Hardening.** Keys at rest migrated plaintext → `sha256` (plain column NULL); write scope `write:entries` enforced — only the new legit key holds it; audit log records every blocked attempt (ts, masked key, endpoint, reason). Act 5. |
| **T+0:13** | **Re-attack with the original leaked key:** 100% bounced (`403 key_disabled` / `429 rate_limited`; `401` where rotation alone applies). Zero new garbage rows. |
| T+0:15 | Incident closed. System hardened, audit trail complete, legit traffic unaffected. |

## Root Cause

The leak was not a breach of the API itself — it was **credential hygiene**:

1. **Plaintext, long-lived secret in version control.** Anyone with repo read
   access held a valid credential, forever.
2. **No scopes.** The single key could read and write everything; compromise of
   any consumer = compromise of the whole API.
3. **No per-key usage limits.** Nothing capped an automated client at 4 req/s —
   or 4,000.
4. **No anomaly detection on auth events.** Until the volume counter existed,
   the attack was indistinguishable from traffic.

## What Went Well

- Detection fired **~8 s after the first malicious request** (hit 31), with a
  masked key and a reason in the timeline — forensics were trivial.
- One kill switch stopped 100% of malicious writes: single-key blast radius cut
  both ways.
- Legit data integrity: zero legitimate rows lost or modified.
- The whole incident narrative (traffic, alert, actions) lived in one timeline,
  which is what made this postmortem possible at all.

## What Went Wrong

- The credential sat in a versioned file in plaintext — the bomb was planted
   long before T+0, and nobody was watching the fuse.
- No audit trail before hardening: rejections during containment left
  **no trace** — the audit table stayed empty until hardening was on.
- Detection only counts **authenticated volume per key**: a low-and-slow
  attacker staying under 30 req/10 s is invisible to it.
- Rate limit existed but was opt-in, not a default posture.

## Rapid Response (containment, act 4)

| Lever | Effect | Code |
|---|---|---|
| Kill switch | Compromised key `disabled`; each request with it rejected | `403 key_disabled` |
| Key rotation | Leaked key `revoked`; new key issued (masked only) | `401 invalid_api_key` |
| Rate limit | 10 req / 10 s per key, fixed window | `429 rate_limited` + `Retry-After` |

## Long-term Fixes (hardening, act 5)

- **Hashed keys at rest:** DB stores `sha256(key)`, plaintext column NULL. A
  future DB dump leaks hashes, not credentials.
- **Scopes:** writes require `write:entries`; the leaked key — even if still
  "active" — has no scope and bounces with `403 insufficient_scope`.
- **Audit log:** every blocked attempt recorded with timestamp, masked key,
  endpoint and reason — the next incident leaves a trail by default.
- **Keep the detector:** >30 req / 10 s per key, 15 s alert cooldown. It proved
  itself at T+0:08. Recommended addition: alert on sustained low-rate anomalies.

## Lessons Learned

- A leaked key is not an attack signature — it's **valid traffic** until you
  watch per-key behavior. Volume-per-key is the cheapest signal you can add.
- Containment and hardening are different jobs: the kill switch stopped the
  bleeding in seconds, but only hashing, scopes and auditing made the *next*
  leak survivable.
- The scariest part of the real-world story this lab recreates: nothing bad
  happened *by luck* of the attacker's goals. Write access + no scope + no
  limit is a postmortem waiting to be written.

---

> **Simulation notice.** BreachLab is a self-contained educational sandbox: one
> Node.js process bound to `127.0.0.1`, an in-process bot, and keys that are
> **100% fake** (`sk_breachlab_demo_` prefix, allowlisted in the secrets gate).
> No real service, credential or third-party host is involved at any point.
> Run it yourself: `npm install && npm start` → http://127.0.0.1:3000 ·
> [README](../README.md) · [CHANGELOG](../CHANGELOG.md) · [LICENSE](../LICENSE).
