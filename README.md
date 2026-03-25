# Tones-and-Bones

> Luxury Real Estate Sales & Marketing Automation — Autonomous Revenue Engine
> Built by Bono G | San Diego County | Part of the 46-Agent ASAM Brain Series

---

## What This Is

Tones-and-Bones is an autonomous 3-agent system that runs 24/7 to:
- **Earn ETH** by executing marketplace tasks on Moltlaunch (Agent 32180)
- **Sell digital products** via Whop (`whop.com/real-estate-automations`) and Stripe
- **Qualify and nurture leads** through GoHighLevel CRM (no scraping — webhook + purchase ingest)
- **Generate content** daily: tweet threads, LinkedIn posts, blog outlines, email subjects
- **Report to PaperClip Pantheon** — the 9-agent executive layer (Hermes, Apollo, Prometheus, Artemis)

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd Tones-and-Bones
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, MOLTLAUNCH_API_KEY, STRIPE_SECRET_KEY,
#          WHOP_API_KEY, X credentials, GHL credentials

# 3. Build
npm run build

# 4. Start the agent
npm start

# Dashboard live at http://localhost:3777
```

---

## Architecture

```
Tones-and-Bones/
├── src/
│   ├── agent.ts              # Main orchestrator — CashClawAgent class
│   ├── config.ts             # AGENT_CONFIG (claude-opus-4-6, max 3 concurrent)
│   ├── types.ts              # Core TypeScript interfaces
│   ├── marketplace/
│   │   └── client.ts         # Moltlaunch REST API client
│   ├── tasks/
│   │   ├── executor.ts       # Agentic loop (streaming, adaptive thinking)
│   │   └── safety.ts         # Decline keywords + specialty matching
│   ├── pricing/
│   │   └── calculator.ts     # Complexity-based ETH pricing
│   ├── revenue/
│   │   ├── products.ts       # Dual-channel product catalog
│   │   ├── whop.ts           # READ-ONLY Whop orders + upsell triggers
│   │   └── stripe.ts         # Stripe checkout + monthly revenue
│   ├── leads/
│   │   └── pipeline.ts       # GHL webhook ingest + Claude AI scoring
│   ├── wallet/
│   │   └── eth.ts            # ETH wallet (ethers.js v6) + balance monitoring
│   ├── social/
│   │   └── poster.ts         # X auto-poster (@Bono_1033, @AiSales2782)
│   ├── content/
│   │   └── brief.ts          # Daily content brief generator (4 Claude streams)
│   ├── learning/
│   │   └── study.ts          # Learning module — 8 ASAM topics, every 30min
│   ├── pantheon/
│   │   └── client.ts         # PaperClip Pantheon bridge (Hermes/Apollo/etc.)
│   ├── scaling/
│   │   └── phases.ts         # 5-phase scaling roadmap + KPI tracker
│   ├── dashboard/
│   │   └── server.ts         # Express dashboard — Wealth Command Center UI
│   └── utils/
│       └── logger.ts         # Winston structured logging
├── public/
│   ├── index.html            # Wealth Command Center (Tailwind dark UI)
│   └── app.js                # Frontend: polls /api/metrics, SSE events, journal
├── skills/                   # 8 Hermes-compatible skill advisors
├── projects/                 # Project templates for Paperclip
├── COMPANY.md                # Company manifest + product catalog
├── AGENTS.md                 # 3-agent org chart + Pantheon bridge
└── .env.example              # Environment template
```

---

## Revenue Stack

| Channel | Products | Mode |
|---|---|---|
| Moltlaunch (ETH) | Market Analysis, CRM Audit, Competitor Analysis | LIVE |
| Whop | GHL Kit ($97), AI Pack ($29), Guide ($19), Bundle ($127) | LIVE (read-only) |
| Stripe | Same 4 services + Monthly Retainer ($197/mo) | Test → switch to Live |

---

## Dashboard

The Wealth Command Center at `http://localhost:3777` includes:
- **Live Event Stream** — SSE-powered real-time agent activity
- **CashClaw section** — task stats, revenue channels, Pantheon bridge status
- **Lead Pipeline** — ingest sources, AI scoring totals, GHL sync
- **Scaling Phases** — KPI progress bar, open milestones, 5-phase roadmap
- **Research Cards** — market themes, crypto structuring, betting edges
- **Idea Journal** — persistent entry capture with localStorage + server backup
- **File Summarizer** — upload any doc, Claude Haiku returns key insights

**Legacy ops view:** `http://localhost:3777/ops` (auto-refresh panel)

---

## Skills

8 Hermes-compatible skill advisors available as slash commands via `.claude-plugin/plugin.json`:

| Skill | Command | Focus |
|---|---|---|
| Luxury Positioning | `/luxury-positioning` | Brand differentiation for premium listings |
| Ideal Client Profile | `/ideal-client-profile` | ICP definition + targeting |
| Brand Story | `/brand-story` | Narrative for agents + properties |
| Sales Funnel | `/sales-funnel` | End-to-end luxury buyer journey |
| Client Experience | `/client-experience` | White-glove service systems |
| Pricing Strategy | `/pricing-strategy` | Premium pricing + anchor framing |
| Referral Network | `/referral-network` | Partner + affiliate ecosystem |
| Automation Audit | `/automation-audit` | CRM + workflow gap analysis |

---

## Key Constraints

- **WHOP is READ-ONLY** — never call `syncProducts()`, manage products at `whop.com/real-estate-automations`
- **No lead scraping** — Apify removed; ingest only via GHL webhooks, Whop purchases, referrals, manual
- **Stripe in test mode** — switch `STRIPE_SECRET_KEY` to `sk_live_*` and set `STRIPE_MODE=live`
- **X API depleted** — add credits at `developer.x.com` to re-enable auto-posting
- **Bundle product** — `asam-bundle` ($127) needs to be created in Whop dashboard, then update `whopProductId` in `src/revenue/products.ts`

---

## Environment Variables

See `.env.example` for all required variables. Key ones:

```env
ANTHROPIC_API_KEY=          # Required — powers all AI (tasks, scoring, content, summarization)
MOLTLAUNCH_API_KEY=         # Required — marketplace authentication
MOLTLAUNCH_AGENT_ID=32180   # Live agent ID
WHOP_API_KEY=               # Read-only Whop access
WHOP_COMPANY_ID=biz_5KCxJ8AxaVhU8R
STRIPE_SECRET_KEY=          # Use sk_live_* + set STRIPE_MODE=live when ready
PANTHEON_URL=http://localhost:3100
PANTHEON_COMPANY_ID=d08afd51-83c7-4505-8669-436e382e0939
```
