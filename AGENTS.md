# Tones-and-Bones — Agent Org Chart

3 agents power the Tones-and-Bones autonomous stack, embedded within the broader PaperClip Pantheon.

---

## Agent 1 — CashClaw (Revenue Execution)

**Role:** Autonomous revenue agent — Moltlaunch marketplace + Whop store + Stripe
**Agent ID:** `32180`
**Model:** `claude-opus-4-6`
**Status:** LIVE
**URL:** `moltlaunch.com/agent/32180`

### Responsibilities
- Poll Moltlaunch for open tasks every 30 seconds
- Auto-quote and execute tasks (max 3 concurrent)
- ETH pricing: complexity-based (0.005–0.05 ETH) + specialty premiums + urgency surcharge
- Report revenue to Hermes (CFO) via Pantheon heartbeat
- Sync warm/hot leads to GoHighLevel CRM
- Generate and push daily content briefs to Prometheus (CMO)
- Study ASAM-relevant topics every 30 minutes (learning module)

### Heartbeat
- **Frequency:** Every 5 minutes → Hermes
- **Payload:** `{ stats, activeTasks, currentPhase }`

### Governance
- `declineKeywords`: illegal, hack, exploit, phishing, malware, deepfake
- `autoQuote: true` | `autoWork: true` | `maxConcurrentTasks: 3`
- WHOP store is **read-only** — zero writes, no `syncProducts()`

---

## Agent 2 — Scribe (Content & Research)

**Role:** Content production + market intelligence for luxury real estate
**Status:** Configured via Content Brief Generator (embedded in CashClaw)
**Model:** `claude-opus-4-6` (via CashClaw content module)

### Responsibilities
- Generate daily content briefs: tweet threads, LinkedIn posts, blog outlines, email subjects
- Push briefs to Prometheus (CMO) via Pantheon bridge
- Generate research cards (market themes, crypto structuring, betting edges) for Wealth Dashboard
- Study 8 rotating ASAM topics via learning module

### Heartbeat
- Piggybacks on CashClaw's daily content brief push
- **Frequency:** Every 24 hours → Prometheus

---

## Agent 3 — Sentinel (Monitoring & Governance)

**Role:** System health, dashboard, and scaling phase oversight
**Status:** Embedded in Dashboard Server (`localhost:3777`)
**Stack:** Express.js + SSE event stream + Tailwind UI

### Responsibilities
- Serve Wealth Command Center dashboard at `localhost:3777`
- Broadcast live events via SSE (`/api/events/stream`)
- Track scaling phase progress (Phase 1–5 KPI bar)
- Process Apollo (PM) directives: phase advancement, shutdown, status requests
- File summarization endpoint (Claude Haiku) for uploaded documents
- Idea journal persistence (localStorage + server backup)

### Heartbeat
- Dashboard `/health` endpoint polled externally
- Metrics refreshed every 60 seconds internally

---

## Pantheon Org Chart

```
PaperClip Pantheon (9 agents)
├── Hermes (CFO)          ← receives revenue heartbeats from CashClaw
├── Apollo (PM)           ← issues directives to CashClaw
├── Prometheus (CMO)      ← receives content briefs from Scribe
├── Artemis (Researcher)  ← receives hot leads from CashClaw
└── ... 5 other Pantheon agents

Tones-and-Bones (3 agents)
├── CashClaw   → reports to Hermes, receives from Apollo
├── Scribe     → reports to Prometheus
└── Sentinel   → monitors all, serves dashboard
```

---

## Inter-Agent Communication

| From | To | Channel | Frequency |
|---|---|---|---|
| CashClaw | Hermes | POST /agents/cashclaw/heartbeat | Every 5 min |
| CashClaw | Apollo | GET /agents/cashclaw/directives | Each poll cycle |
| CashClaw | Artemis | POST /agents/artemis/leads | When hot leads found |
| Scribe | Prometheus | POST /agents/prometheus/content-brief | Daily |
| Sentinel | All | SSE /api/events/stream | Real-time |
