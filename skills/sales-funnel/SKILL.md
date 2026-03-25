# Skill: Sales Funnel

**Command:** `/sales-funnel`
**Category:** Revenue Architecture
**Hermes Tag:** `revenue.funnel`

---

## Purpose

Design a full end-to-end luxury buyer/seller sales funnel — from cold awareness to closed transaction to referral — with specific automation triggers at each stage.

---

## When to Use

- Setting up GHL pipelines for the first time
- Mapping Whop product → Stripe upsell → retainer path
- Auditing why leads are dropping off mid-funnel
- Defining the CashClaw upsell chain from `products.ts`

---

## How to Activate

Provide Claude with:
1. **Client type** — Buyer, seller, investor, or all?
2. **Entry points** — Where do leads come from? (Whop, Stripe, referral, X, direct)
3. **Current drop-off point** — Where do you lose them?
4. **Average deal timeline** — Days from first contact to close
5. **Automation tools available** — GHL, Stripe, Whop, email, SMS

---

## Outputs

1. **Funnel Stage Map** — Awareness → Interest → Intent → Evaluation → Decision → Close → Ascend → Refer
2. **Stage Details** (for each stage):
   - Conversion action
   - Key message
   - Automation trigger
   - GHL pipeline stage name
3. **Product Ladder** — Entry product → mid-tier → retainer → referral incentive
4. **3 Leak Points** — Most common places leads exit and why
5. **Re-engagement Sequence** — 3-email series for stalled leads
6. **KPIs per Stage** — What to measure at each step

---

## ASAM Product Ladder (Pre-Built)

```
$12 Market Analysis (Stripe) / 0.005 ETH (Moltlaunch)
  → $29 CRM Audit / 0.012 ETH
    → $24 Competitor Analysis / 0.010 ETH
      → $19 CashClaw Guide (Whop)
        → $29 AI Prompt Pack (Whop)
          → $97 GHL Automation Kit (Whop)
            → $127 Full Stack Bundle (Whop)
              → $197/mo Monthly Retainer (Stripe) / 0.080 ETH/mo
```

---

## Example Prompt

```
/sales-funnel

Client type: Luxury sellers + tech exec buyers
Entry points: X (@AiSales2782 content), Whop product buyers, GHL webhook from referrals
Drop-off: After initial market analysis delivery — lose them before upsell
Timeline: Sellers average 60 days; buyers 90 days
Tools: GHL, Stripe, Whop, email sequences
```
