# BreachLab

<!-- BADGES (uncomment after the first push — see docs/PUBLISHING.md):
[![CI](https://github.com/fedesauzzadev/breachlab/actions/workflows/ci.yml/badge.svg)](https://github.com/fedesauzzadev/breachlab/actions/workflows/ci.yml)
[![gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue)](https://github.com/gitleaks/gitleaks-action)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
-->

Interactive, 100% local sandbox that recreates a classic security incident end to end: an **API key leaked in a versioned config file**, abused by an attacker to flood the database, detected by anomaly monitoring, contained with a kill switch / key rotation / rate limit, and finally hardened (hashed keys, scopes, audit log).

**Why it exists:** a professional demonstration of incident response. Not a tutorial, not a CTF — a portfolio piece showing how a leaked credential gets exploited, detected, contained and structurally fixed, watched live from the defender's console.

One Node.js process, bound to `127.0.0.1`. Nothing leaves your machine.

## Run it (2 commands)

```bash
npm install
npm start
```

Open **http://127.0.0.1:3000** — no configuration, no env vars, no build step. Requires [Node.js ≥ 24](https://nodejs.org) (native `node:sqlite` module).

## What you'll see — the incident in 5 acts

| Act | The story |
|-----|-----------|
| **1 · Normal** | The API serves legit traffic; the timeline shows normal requests. The leak is already sitting in a "versioned" config file — press "Ver el leak" to find it. |
| **2 · Attack** | A bot hammers the API **using the leaked key** and fills the DB with garbage. |
| **3 · Detected** | Volume crosses the anomaly threshold → red alert with time, masked key and reason. |
| **4 · Contained** | You fight back: kill switch, key rotation, rate limit. The feed shows real 403/401/429 responses. |
| **5 · Hardened** | Keys move to sha256 hashes, scopes get enforced, blocked attempts land in the audit log. Re-attack bounces. |

You drive the whole response from the panel; the 401/403/429 you see are real HTTP responses produced by the middlewares — not UI effects.

**New in v0.3.0:** BreachLab is now a **series of labs** — choose how the key leaked
(versioned config · exposed server error log · legacy frontend bundle) and replay the
same 5-act incident on that vector, each with its own leak evidence and narration.
Then **export the evidence**: one markdown file with the complete timeline, the audit
log and the postmortem summary, generated server-side and downloaded locally — a third
party reconstructs the incident without running anything. **v0.2.0:** guided mode with
auto-advancing milestones (the recommended way to demo this in front of recruiters),
instant incident reset, and a second scenario telling the least-privilege story.

**Read the full story after the run: [Incident postmortem](docs/postmortem.md)** — timeline, impact, root cause, rapid response and long-term fixes, written as a professional incident report.

## Security notes (read this)

- **Every key in this repo is fake.** Demo keys use the `sk_breachlab_demo_` prefix and are *FAKE BY DESIGN* — no real third-party secret is ever included. The repo ships a secrets gate (`npm run scan:secrets`) that must report **0 findings**.
- **Loopback only.** The server binds exclusively to `127.0.0.1` and makes zero network calls to external hosts. "Vulnerable by design" applies *inside the sandbox only*.

## Tech stack (deliberately tiny)

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 24 — native `node:sqlite`, no native compilation |
| HTTP | **Express — the only runtime dependency** |
| UI | Vanilla HTML/CSS/JS served by Express — zero build step |
| Tests | `node:test` + native `fetch` — zero devDependencies |
| CI | GitHub Actions: tests + coverage + gitleaks on every push/PR |

## Development

```bash
npm ci                 # reproducible install from package-lock.json
npm test               # suite: unit + HTTP integration on loopback
npm run test:coverage  # line coverage report for src/
npm run scan:secrets   # gitleaks — must report 0 findings
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Startup error / missing `node:sqlite` | You need Node ≥ 24. Check: `node --version`. |
| Port 3000 already in use | `PORT=3001 npm start` (Windows PowerShell: `$env:PORT=3001; npm start`). |

## License

[MIT](LICENSE) — free to use, study and fork.

---

[README en español](README.es.md)
