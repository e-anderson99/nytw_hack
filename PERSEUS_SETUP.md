# Setting up perseus

This repo uses [perseus](https://perseus.computer) for code search. One-time setup:

## 1. Install

```bash
curl -fsSL https://perseus.computer/install.sh | sh
```

Make sure `~/.local/bin` is on your `PATH`. Verify with `perseus --version`.

## 2. Log in

```bash
perseus login
```

Opens a browser to sign in and saves a JWT to `~/.config/perseus/token`.

## 3. Index this repo

From the repo root:

```bash
perseus index
```

Uploads your local working tree (including uncommitted edits) to the hosted
index. **Re-run `perseus index` after changing code** so queries reflect your
edits, not a stale snapshot.

## 4. Query

```bash
perseus query --no-summary --json "auth enforcement on the query route" | jq
```

That's it. See [CLAUDE.md](CLAUDE.md) for how to phrase good queries.
