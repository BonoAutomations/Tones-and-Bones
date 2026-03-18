# Tones-and-Bones

Risk-aware market intelligence workspace for researching equities, crypto, macro themes, and sports-betting ideas.

## What this build does

- Provides a browser dashboard backed by a lightweight Node server.
- Exposes backend APIs for research content, file summarization, journal persistence, and service health.
- Lets you upload local notes, CSV, JSON, and text files so they can be summarized into the session context.
- Stores saved research notes in `data/journal.json`.
- Explicitly avoids claiming guaranteed returns, "sure things," or bulletproof strategies.

## Run locally

```bash
npm start
```

Then visit `http://localhost:8000`.

## Available backend endpoints

- `GET /api/health` — basic health probe.
- `GET /api/research` — research cards for markets, crypto, betting, and wallet readiness.
- `GET /api/journal` — fetch saved idea-journal entries.
- `POST /api/journal` — save an idea-journal entry with `name`, `thesis`, and `risk`.
- `POST /api/uploads/summarize` — summarize uploaded file contents sent as JSON.

## Safety stance

This project is for education, research, and structured idea review only. It is **not** financial advice, betting advice, or a guarantee of outcomes.
