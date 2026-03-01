# CLAUDE.md — Tones-and-Bones

## Project Overview

**Tones-and-Bones** is a luxury sales and marketing automation platform (V1). It uses a multi-agent architecture with a thin orchestrator that hands off tasks to specialized agents, maintains shared execution history in Firestore, and callbacks to n8n when work completes.

**Status:** Early-stage / greenfield. Architecture is defined; implementation is in progress.

## Architecture

### System Topology

```
n8n (external) → Orchestrator (public) → Agents (private)
                        ↕
                    Firestore
```

- **Orchestrator** — Thin FastAPI service. Receives tasks from n8n, dispatches to agents, tracks execution state. The only internet-facing service.
- **SERAPHINA** — Specialized agent (private service).
- **OPUS** — Specialized agent (private service).
- **VEGA** — Specialized agent (private service).

Agents communicate only with the orchestrator over the private network. They are never exposed to the public internet.

### Tech Stack

| Layer         | Technology                     |
|---------------|--------------------------------|
| Framework     | FastAPI (Python)               |
| Server        | Uvicorn                        |
| Database      | Firestore (Google Cloud)       |
| Deployment    | Render (web + private services)|
| Workflows     | n8n (external trigger/callback)|

## Firestore Schema

Events are stored as subcollections, not arrays inside a single document. This avoids the 1 MiB document limit, reduces write contention, and follows Firestore best practices for append-only history.

```
execution_threads/{job_id}
  job_id
  task_id
  workflow_id
  status
  current_agent
  created_at
  updated_at
  callback_url

execution_threads/{job_id}/events/{event_id}
  agent
  step
  status        # running | done | failed
  result
  error
  attempt
  timestamp

execution_threads/{job_id}/steps/{agent_step}
  agent
  step
  status
  idempotency_key
  input_checksum
  started_at
  finished_at
  last_error

tasks/{task_id}
  task_id
  job_id
  workflow_id
  input
  callback_url
  status
  created_at
  updated_at
```

**Key principles:**
- Append-only event history (new docs with auto-generated IDs)
- Idempotency keys on steps to enable safe retry/replay
- Input checksums to detect duplicate work
- Clean separation between execution threads, events, and task definitions

## Render Deployment

### Service Topology

| Service       | Type            | Visibility | Notes                              |
|---------------|-----------------|------------|------------------------------------|
| Orchestrator  | Web Service     | Public     | Only public-facing service         |
| SERAPHINA     | Private Service | Internal   | Reachable via Render private network|
| OPUS          | Private Service | Internal   | Reachable via Render private network|
| VEGA          | Private Service | Internal   | Reachable via Render private network|

### Startup Commands

**Orchestrator (public):**
```bash
uvicorn orchestrator:app --host 0.0.0.0 --port $PORT
```

**Agent services (private):**
```bash
uvicorn <agent_module>:app --host 0.0.0.0 --port $PORT
```

All services must bind to `0.0.0.0` and use the `$PORT` environment variable provided by Render.

### Health Checks

Every service must expose a `GET /health` endpoint. Wire this path into Render's health check configuration for each service.

## Development Guidelines

### Git Workflow

- **Default branch:** `main`
- **Feature branches:** Use descriptive prefixes (e.g., `feature/`, `fix/`, `claude/`)
- **Commits:** Clear, concise messages describing *why* the change was made
- **PRs:** All changes go through pull requests against `main`

### Code Conventions

- Python with FastAPI — follow standard FastAPI patterns (dependency injection, Pydantic models, async endpoints)
- Keep the orchestrator thin — it dispatches, tracks state, and callbacks. Business logic lives in the agents.
- Each agent is a self-contained FastAPI app with its own module
- Use Pydantic models for all request/response schemas and Firestore document shapes
- Prefer async functions for I/O-bound operations

### Environment Variables

Never commit secrets. Use Render's environment variable management. Expected variables include:
- `PORT` — provided by Render
- `GOOGLE_APPLICATION_CREDENTIALS` or equivalent Firestore auth
- `N8N_CALLBACK_URL` — base URL for n8n webhook callbacks
- Agent-specific configuration as needed

## Conventions for AI Assistants

1. **Read before editing.** Always read a file before modifying it. Understand existing patterns first.
2. **Stay focused.** Only make changes that are directly requested. Do not refactor, add comments, or "improve" surrounding code.
3. **Don't over-engineer.** No speculative features, no premature abstractions, no hypothetical future-proofing.
4. **Respect the topology.** The orchestrator is the only public service. Agents are private. Events go in subcollections, not arrays.
5. **Don't create unnecessary files.** Prefer editing existing files. Don't create documentation unless asked.
6. **Confirm before destructive actions.** Never force-push, delete branches, or drop data without explicit approval.
7. **Keep Firestore writes safe.** Always use subcollection documents (not array fields) for events and steps. Include idempotency keys on step records.
8. **Test health endpoints.** When adding or modifying a service, ensure `/health` returns 200.
