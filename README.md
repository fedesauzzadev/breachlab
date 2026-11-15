# BreachLab

Interactive, 100% local sandbox that recreates a classic security incident end to end: an **API key leaked in a versioned config file**, abused by an attacker to flood the database, detected by anomaly monitoring, contained with a kill switch / key rotation / rate limit, and finally hardened (hashed keys, scopes, audit log).

You watch the incident unfold from the **defender console** — a web panel with a live timeline of what the API sees.

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

## Security notes (read this)

- **Every key in this repo is fake.** Demo keys use the `sk_breachlab_demo_` prefix and are *FAKE BY DESIGN* — no real third-party secret is ever included. The repo ships a secrets gate (`npm run scan:secrets`) that must report **0 findings**.
- **Loopback only.** The server binds exclusively to `127.0.0.1` and makes zero network calls to external hosts. "Vulnerable by design" applies *inside the sandbox only*.

## Troubleshooting

| Problem | Fix |
|---|---|
| Startup error / missing `node:sqlite` | You need Node ≥ 24. Check: `node --version`. |
| Port 3000 already in use | `PORT=3001 npm start` (Windows PowerShell: `$env:PORT=3001; npm start`). |

---

[README en español](README.es.md)
