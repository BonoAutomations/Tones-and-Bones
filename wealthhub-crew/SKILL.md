---
name: wealthhub-crew
description: Run the WealthHub Agency Crew — 7 sequential AI agents that find prospects, write proposals, onboard clients, design automation workflows, generate reports, send invoices, write email sequences, and push leads to Instantly.
---

```bash
python3 telemetry/version_check.py 2>/dev/null || true
python3 telemetry/telemetry_init.py 2>/dev/null || true
```

## WealthHub Agency Crew

Production AI crew for **WealthHub.llc** — runs 7 sequential agents daily.

### When to Use

- Run the full daily agency pipeline end-to-end
- Find new B2B prospects in wealth management/fintech
- Generate proposals, onboarding docs, and automation workflows
- Send invoices and push leads to Instantly Loki's Leads campaign
- Get a Telegram summary of all activity

### Commands

| Command | Description |
|---------|-------------|
| `/wealthhub-crew run` | Run all 7 agents sequentially |
| `/wealthhub-crew scout` | Run SCOUT only — find 5 prospects |
| `/wealthhub-crew pitch` | Run PITCH only — write 2 proposals |
| `/wealthhub-crew close` | Run CLOSE only — push leads to Instantly |
| `/wealthhub-crew invoice` | Run INVOICE only — generate + send PDF invoice |
| `/wealthhub-crew status` | Show last run output summary |

### Agents

1. **SCOUT** — Brave Search + Claude → 5 enriched B2B prospects
2. **PITCH** — 2 personalized proposals (MD format)
3. **ONBOARD** — Complete onboarding package (welcome, checklist, timeline)
4. **DELIVER** — 5-workflow automation blueprint
5. **REPORT** — Weekly KPI report
6. **INVOICE** — PDF invoice via ReportLab + Gmail send
7. **CLOSE** — 3-touch sequences + Instantly Loki's Leads push → Telegram summary

### Configuration

Set in `wealthhub-crew/.env`:

| Variable | Required |
|----------|----------|
| `ANTHROPIC_API_KEY` | ✅ |
| `BRAVE_API_KEY` | ✅ |
| `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` | For INVOICE |
| `INSTANTLY_API_KEY` + `INSTANTLY_CAMPAIGN_ID` | For CLOSE |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | For summary |

### Dependencies

- anthropic>=0.39.0
- requests>=2.31.0
- reportlab>=4.0.0
- google-api-python-client>=2.100.0
- python-dotenv>=1.0.0
