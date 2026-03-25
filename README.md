# Tones-and-Bones

Risk-aware market intelligence workspace for researching equities, crypto, macro themes, and sports-betting ideas.

## What this build does

- Provides a browser dashboard backed by a lightweight Node server.
- Exposes backend APIs for research content, file summarization, journal persistence, and service health.
- Lets you upload local notes, CSV, JSON, and text files so they can be summarized into the session context.
- Stores saved research notes in `data/journal.json`.
- Explicitly avoids claiming guaranteed returns, "sure things," or bulletproof strategies.

## Copy-paste run commands

### 1) Install and start

```bash
cd /workspace/Tones-and-Bones
npm start
```

Then open `http://localhost:8000`.

### 2) Basic health check

```bash
curl -s http://127.0.0.1:8000/api/health
```

### 3) Fetch the research payload

```bash
curl -s http://127.0.0.1:8000/api/research
```

### 4) Save a journal entry

```bash
curl -s -X POST http://127.0.0.1:8000/api/journal \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "BTC breakout watch",
    "thesis": "Price holds above resistance with improving momentum",
    "risk": "Break back below support invalidates the setup"
  }'
```

### 5) Summarize uploaded research text through the backend

```bash
curl -s -X POST http://127.0.0.1:8000/api/uploads/summarize \
  -H 'Content-Type: application/json' \
  -d '{
    "files": [
      {
        "name": "notes.txt",
        "content": "Fed pause odds rising, BTC liquidity improving, stay risk-aware"
      }
    ]
  }'
```

### 6) Run the included smoke test script

```bash
./scripts/smoke-test.sh
```


## OpenClaw bot/build integration

This repository now includes copy-paste commands to clone and build OpenClaw (`https://github.com/openclaw/openclaw.git`) as part of the local build workflow.

### Build OpenClaw

```bash
npm run build:openclaw
```

### Run OpenClaw (after build)

```bash
npm run run:openclaw
```

### Manual one-liner (no npm wrapper)

```bash
./scripts/build-openclaw.sh
```

> Notes:
> - OpenClaw may require system packages (SDL2/OpenGL/audio libs) depending on your OS.
> - Source is cloned into `third_party/openclaw` and is gitignored by default.

## Available backend endpoints

- `GET /api/health` — basic health probe.
- `GET /api/research` — research cards for markets, crypto, betting, and wallet readiness.
- `GET /api/journal` — fetch saved idea-journal entries.
- `POST /api/journal` — save an idea-journal entry with `name`, `thesis`, and `risk`.
- `POST /api/uploads/summarize` — summarize uploaded file contents sent as JSON.

## Safety stance

This project is for education, research, and structured idea review only. It is **not** financial advice, betting advice, or a guarantee of outcomes.
