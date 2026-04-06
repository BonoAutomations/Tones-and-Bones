# WealthHub Agency Crew

Production AI agent crew for WealthHub.llc — runs 7 sequential agents to find, pitch, onboard, deliver, report, invoice, and close B2B wealth management clients every day.

## Agents

| # | Agent | What It Does |
|---|-------|--------------|
| 1 | **SCOUT** | Finds 5 real B2B prospects via Brave Search + Claude enrichment |
| 2 | **PITCH** | Writes 2 personalized proposals for top prospects |
| 3 | **ONBOARD** | Creates full client onboarding package (welcome, checklist, timeline) |
| 4 | **DELIVER** | Designs 5-workflow automation blueprint for client delivery |
| 5 | **REPORT** | Generates weekly performance report with KPI dashboard |
| 6 | **INVOICE** | Generates PDF invoice and sends via Gmail |
| 7 | **CLOSE** | Writes 3-touch follow-up sequences + pushes all 5 to Instantly Loki's Leads |

Telegram summary sent to `@Macabe_bot` on completion.

## Quickstart

```bash
# 1. Install deps
python3.11 -m pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, BRAVE_API_KEY, GMAIL_*, INSTANTLY_*, TELEGRAM_*

# 3. Run
python3.11 main.py

# 4. Run daily (log to file)
python3.11 main.py > /tmp/crew_daily.log 2>&1
```

## Output Files

```
output/
├── prospects/     prospects.json          (5 enriched B2B prospects)
├── proposals/     {company}_proposal.md   (2 personalized proposals)
├── onboarding/    onboarding_package.md   (full onboarding doc)
├── workflows/     automation_workflow.md  (5-workflow blueprint)
├── reports/       weekly_report_YYYY-MM-DD.md
├── invoices/      invoice_WH-YYYYMM-XXXX.pdf
└── sequences/     {company}_sequence.md   (3-touch email per prospect)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key |
| `BRAVE_API_KEY` | ✅ | Brave Search API key |
| `GMAIL_CLIENT_ID` | For INVOICE | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | For INVOICE | Gmail OAuth secret |
| `GMAIL_REFRESH_TOKEN` | For INVOICE | Gmail OAuth refresh token |
| `GMAIL_SENDER` | For INVOICE | Sender email (default: hello@wealthhub.llc) |
| `INSTANTLY_API_KEY` | For CLOSE | Instantly API key |
| `INSTANTLY_CAMPAIGN_ID` | For CLOSE | Loki's Leads campaign ID |
| `TELEGRAM_BOT_TOKEN` | For summary | Telegram bot token |
| `TELEGRAM_CHAT_ID` | For summary | @Macabe_bot chat ID |
| `INVOICE_RECIPIENT_EMAIL` | For INVOICE | Client billing email |
| `INVOICE_RECIPIENT_NAME` | For INVOICE | Client name on invoice |
| `WEALTHHUB_PRICE` | Optional | Monthly retainer (default: 2500) |

## Architecture

```
main.py
  ├── SCOUT    → BraveSearch + Claude → prospects.json
  ├── PITCH    → Claude → {company}_proposal.md
  ├── ONBOARD  → Claude → onboarding_package.md
  ├── DELIVER  → Claude → automation_workflow.md
  ├── REPORT   → Claude → weekly_report.md
  ├── INVOICE  → ReportLab PDF + Gmail API → sent to client
  ├── CLOSE    → Claude sequences + Instantly API → Loki's Leads
  └── NOTIFY   → Telegram → @Macabe_bot
```

## Gmail OAuth Setup

```bash
# 1. Create OAuth credentials at console.cloud.google.com
# 2. Enable Gmail API
# 3. Get refresh token (one-time):
python3.11 -c "
from google_auth_oauthlib.flow import InstalledAppFlow
flow = InstalledAppFlow.from_client_secrets_file('credentials.json', ['https://www.googleapis.com/auth/gmail.send'])
creds = flow.run_local_server(port=0)
print('REFRESH_TOKEN:', creds.refresh_token)
"
```
