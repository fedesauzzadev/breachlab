# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows
[SemVer](https://semver.org/).

## [0.3.1] — 2026-11-15
Debt closure: five minor QA findings closed (L-6, L-8, L-9, L-10, L-11 — ADR D-0007).

### Changed
- **Anomaly detection counts writes only (L-9).** The sliding-window detector no longer
  counts authenticated `GET`s: a deliberate flood of legitimate reads can no longer
  fire a false alert or degrade a hardened lab from act 5 back to act 3. Reads still
  authenticate exactly as before — they just don't feed the >30-writes/10 s window.
- **Panel recovers from external resets (L-8).** `/api/lab/state` now exposes the lab
  `epoch`; the panel compares it between polls and automatically re-arms its
  timeline/audit cursors when a reset or scenario switch happens outside its own click
  (curl, another tab) — no more frozen feed until the old cursor is surpassed.
- **Evidence export escapes table pipes (L-10).** Cells carrying variable data (audit
  key mask, endpoint, reason; timeline message) escape `|` as `\|`: a loopback
  adversary can no longer break the markdown table structure of the exported file.
- **Concurrent scenario switches answer honestly (L-11).** `POST /api/lab/scenarios/:id`
  responds with the scenario that is actually active after the re-seed, not the one it
  was asked for — two simultaneous switches both see the winner.

### Fixed
- **Re-encoded brain nodes N-0001..N-0004 (L-6).** The double-encoded mojibake
  (UTF-8 read as Windows-1252) was reverted byte-exact; the kit's brain validator now
  parses all node frontmatter (previously "acceptance_criteria empty" on four nodes).

## [0.3.0] — 2026-11-15
V2: from a single demo to a series of labs — plus shareable evidence.

### Added
- **S09 — Leak-vector series.** BreachLab is now a *series of labs*: pick how the
  key leaked from the panel's scenario selector and replay the same 5-act incident
  on that vector. Three concrete vectors, each with its own fake key, read-only leak
  evidence and act-1 timeline narration: the original **versioned config** (base),
  an **exposed server error log** (crash stack trace with a full environment dump —
  `/leak/error.log`), and a **legacy frontend bundle** with the key hardcoded in the
  JS served to every visitor (`/leak/legacy-bundle.js`). Selecting a vector reseeds
  the incident for that story; the attack/detection/response/hardening engine is
  unchanged. `GET /api/lab/scenarios` + `POST /api/lab/scenarios/:id`.
- **S09 — Evidence export.** One button, one file: `GET /api/lab/export` generates
  a markdown report server-side (Content-Disposition attachment) with the lab state,
  the **complete timeline**, the **audit log** and the postmortem summary — a third
  party reconstructs the incident chronology without running anything. Nothing
  leaves the machine.

## [0.2.1] — 2026-11-15
G3 feedback fix: the attacker is no longer an endless loop.

### Changed
- **Attacker gives up (ADR D-0006).** After 20 consecutive bounces (any
  non-2xx: 401/403/429), the bot stops on its own and the timeline narrates
  `El atacante dejó de intentar (20 rebotes consecutivos) · N bloqueados en
  total`. Any 2xx resets the streak, so a successful attack (201s) never
  stops by itself — the act-2/3 story is unchanged.
- **Scenario 2 is now a finite burst.** `POST /api/lab/scenario/scopeless-key`
  fires exactly 10 requests (`requests_planned: 10` in the 202 response) and
  the bot stops on its own, closing with a timeline event: `Escenario 2
  completado · 10 intentos · 10 rechazados (403 insufficient_scope) · 0
  escrituras`. No leftover process.
- **Panel speaks while everything bounces.** While the bot runs and every
  request bounces, the attack section shows "El atacante sigue probando —
  todo rebota (N bloqueados)" with the pedagogical note (the attacker
  doesn't know his key is dead). The stop button stays enabled for any
  running bot (attack or scenario), and the scenario button labels its
  10-request burst.

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
