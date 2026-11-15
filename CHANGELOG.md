# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows
[SemVer](https://semver.org/).

## [0.2.0] — 2026-11-15
V1: the incident, narrated — guided mode, instant replay and a second scenario
on top of the 5-act MVP.

### Added
- **S08 — Guided mode.** Five auto-advancing milestones exposed in
  `/api/lab/state` drive the panel's guided checklist — the recommended way to
  run this demo for recruiters: nothing to memorize, no way to get lost.
- **S08 — Incident reset.** `POST /api/lab/reset` restores the exact act-1
  seed (12 legit entries, original active key, clean timeline/audit/flags)
  without restarting the process — the demo is replayable end to end. Writes
  authenticated before a reset that would land after the re-seed are rejected
  with `409 stale_write` (TOCTOU fix, QA V1 M-3); the lab console also rejects
  non-JSON bodies outright (QA V1 L-7).
- **S08 — Scenario 2: valid key, no scope.** A second lab for the
  least-privilege story: an authentic, active key without `write:entries` —
  every POST bounces `403 insufficient_scope` and lands in the audit log while
  the DB stays clean. Gated behind hardening.

## [0.1.0] — 2026-11-14
MVP / V0: the complete incident, live — a leaked API key story in 5 acts
(normal → attack → detection → rapid response → hardening), 100% local.

### Added
- **S01 — Sandbox.** Express API + SQLite (`node:sqlite`) bound to `127.0.0.1`
  only; fixed seed (12 legit entries), live timeline, leaked config served
  read-only from the simulated versioned repo. 2-command run, no env vars.
- **S02 — Defender console + docs.** Vanilla-JS panel (polling 1 s): state,
  timeline, leak viewer. Bilingual README (EN/ES). Secrets gate (`gitleaks`,
  0 findings by design — all keys fake).
- **S03 — Attack + detection.** In-process bot (4 req/s) abuses the leaked key
  against `POST /api/entries`; per-key anomaly detection (>30 req / 10 s
  sliding window) fires a critical alert with masked key and reason.
- **S04 — Rapid response.** Kill switch (`403`), key rotation (`401`, masked
  new key), rate limit 10 req/10 s per key (`429` + `Retry-After`).
- **S05 — Hardening.** Keys at rest migrated to `sha256` (plaintext column
  NULL), write scope `write:entries` enforced, audit log of every blocked
  attempt; re-attack with the leaked key bounces 100% with zero new garbage.
- **S06 — Closure.** Professional incident postmortem (EN, linked from panel
  and READMEs), end-to-end regression test of the 5 acts, changelog, MIT
  license, v0.1.0.
