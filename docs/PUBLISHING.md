# Publishing BreachLab to GitHub

This is a **human-gated step** (decision D-0005): the owner creates the repo and pushes with
their own account. Nothing here is done by automation.

## Prerequisites

- `gh auth status` → logged in as **fedesauzzadev** (already configured; git identity comes
  from this login).
- Clean working tree on `main` (all S07 work committed).

## Create the repo & push

Public (recommended — this is a portfolio piece):

```bash
gh repo create breachlab --public --source . --push
```

Private first, flip to public later:

```bash
gh repo create breachlab --private --source . --push
# when ready: gh repo edit fedesauzzadev/breachlab --visibility public
```

`--source . --push` adds the remote, sets it as origin and pushes the current branch.

## What to expect from the first CI run

The `CI` workflow (`.github/workflows/ci.yml`) triggers on the initial push:

- **test (Node 24)** — `npm ci` → `npm test` (37 tests) → coverage report.
- **secrets scan (gitleaks)** — runs with the versioned `.gitleaks.toml` (fake demo keys
  allowlisted; expected result: 0 findings).

Expected outcome: both jobs green. The suite is 37/37 locally on the same Node major (24);
if a job fails on the first run, check the Actions log — it is the real gate, not this doc.

Note: `gitleaks-action@v3` needs no license key for **personal accounts**. If the repo is
ever moved to an organization, add a `GITLEAKS_LICENSE` secret (free at gitleaks.io).

## After the first green run

1. **Enable the badge**: uncomment the HTML badge block at the top of `README.md`
   (and `README.es.md`). The URLs already point to
   `https://github.com/fedesauzzadev/breachlab`.
2. **Optional**: add the `repository` field to `package.json` now that the URL exists:
   `"repository": "https://github.com/fedesauzzadev/breachlab"`.

## Pre-push checklist

- [ ] Repo name: `breachlab`
- [ ] Description (suggested):
      `Interactive, 100% local sandbox of an API key leak incident — attack, detection, containment, hardening. Portfolio demo.`
      (`gh repo edit --description "..."`)
- [ ] Topics (suggested):
      `gh repo edit --add-topic security --add-topic incident-response --add-topic portfolio --add-topic demo`
- [ ] First CI run is green on both jobs
- [ ] Badges uncommented in both READMEs
