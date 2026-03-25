# Project: Pricing Overhaul

**Type:** Revenue Architecture → Product Redesign
**Phase:** Phase 1 → Phase 2 transition
**Estimated Duration:** 3–7 days
**Agents:** CashClaw (Stripe sync), Sentinel (dashboard monitoring)

---

## Objective

Restructure the ASAM product pricing for maximum conversion velocity and revenue per customer — using psychological anchor framing and the full upsell ladder.

---

## Success Criteria

- [ ] Stripe switched to live mode (`STRIPE_MODE=live`, `sk_live_*` key)
- [ ] All 4 Stripe products synced with updated prices and descriptions
- [ ] Whop Bundle product created ($127) and `whopProductId` added to `products.ts`
- [ ] Upsell sequences triggered in GHL after each product purchase
- [ ] Monthly Retainer conversion rate tracked (target: 10% of product buyers)

---

## Pre-Work

Before changing any prices, run `/pricing-strategy` to validate the architecture:

```
/pricing-strategy

Product: Full ASAM product catalog
Current prices: $12, $19, $24, $29, $97, $127, $197/mo
Competitors: RE marketing agencies ($500–$3k/mo), Fiverr ($50–$200 one-time)
Client outcome: 10+ hrs/week saved, automated lead pipeline, AI content
Objections: "I don't need automation", "Can't I just use ChatGPT?", "Too expensive"
```

---

## Checklist

### Stripe Migration to Live
- [ ] Copy `sk_test_*` → use for dev only
- [ ] Get `sk_live_*` from Stripe dashboard → set in `.env`
- [ ] Set `STRIPE_MODE=live` in `.env`
- [ ] Run `npm start` — `stripe.syncProducts()` will create live Price objects
- [ ] Test checkout with a real $1 transaction
- [ ] Set `STRIPE_WEBHOOK_SECRET` to live webhook secret

### Whop Bundle Product
- [ ] Create bundle in Whop dashboard: "ASAM Full Stack Bundle — $127"
- [ ] Include: GHL Automation Kit + AI Prompt Pack + CashClaw Guide
- [ ] Set access: all 3 product feeds
- [ ] Copy the new `whopProductId` and `whopPlanId`
- [ ] Update `src/revenue/products.ts` lines 83–84 with real IDs
- [ ] Commit and push

### Upsell Automation (GHL)
- [ ] Trigger 1: Market Analysis purchase → CRM Audit offer (48h delay)
- [ ] Trigger 2: CRM Audit → Competitor Analysis offer (24h delay)
- [ ] Trigger 3: Any Whop product → GHL Kit offer (72h delay)
- [ ] Trigger 4: GHL Kit purchase → Monthly Retainer offer (7d delay, personalized email)
- [ ] Trigger 5: Bundle purchase → Monthly Retainer (immediate, high intent)

### Pricing Copy Updates
- [ ] Update Whop product descriptions to match new positioning
- [ ] Update Stripe product metadata (used in checkout page)
- [ ] Update X bio with current price anchor ("From $12 →")
- [ ] Update Moltlaunch gig descriptions if pricing changes

---

## Key Metrics to Track

| Metric | Current | Target |
|---|---|---|
| Entry product conversion | — | 3% of visitors |
| Upsell rate (entry → mid) | — | 25% |
| Retainer conversion | — | 10% of all buyers |
| Monthly recurring revenue | $0 | $197+ |
| ETH per month (Moltlaunch) | 0 | 0.050+ |

---

## Resources

- Skills: `/pricing-strategy`, `/sales-funnel`, `/automation-audit`
- Products: `src/revenue/products.ts`
- Stripe: `src/revenue/stripe.ts`
- Dashboard: `http://localhost:3777` → Revenue Snapshot (sidebar)
