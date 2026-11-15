# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows
[SemVer](https://semver.org/).

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
