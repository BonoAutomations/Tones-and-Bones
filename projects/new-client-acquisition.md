# Project: New Client Acquisition

**Type:** Revenue → Lead → Close
**Phase:** Phase 1 — Lock San Diego
**Estimated Duration:** 30–60 days
**Agents:** CashClaw (execution), Scribe (content), Sentinel (monitoring)

---

## Objective

Acquire 3 new paying clients (Whop + Stripe + retainer) within 30 days using the ASAM product ladder as the entry mechanism.

---

## Success Criteria

- [ ] 3 new Whop product sales (any tier)
- [ ] At least 1 CRM Audit or Competitor Analysis delivered via Moltlaunch
- [ ] 1 client upselled to Monthly Retainer
- [ ] 10+ leads entered into GHL pipeline
- [ ] All leads AI-scored by CashClaw

---

## Phases

### Week 1 — Setup
- [ ] Confirm GHL pipeline: Lead → Contacted → Qualified → Proposal → Closed
- [ ] Activate Whop webhook → GHL contact creation
- [ ] Set `STRIPE_MODE=live` — switch Stripe to live keys
- [ ] Fund X API credits and enable auto-posting (@AiSales2782)
- [ ] Run `/automation-audit` to identify quick wins

### Week 2 — Content Blitz
- [ ] Use `/brand-story` to write new LinkedIn About section
- [ ] Use `/luxury-positioning` to define current market position
- [ ] Generate 5 days of content via CashClaw content brief
- [ ] Post to X + LinkedIn (both accounts)
- [ ] DM 5 potential referral partners (see `/referral-network`)

### Week 3 — Conversion
- [ ] Follow up on all Whop purchasers via GHL sequence
- [ ] Identify hot leads from AI scoring → personal outreach
- [ ] Deliver at least 1 market analysis via Moltlaunch
- [ ] Present retainer offer to most engaged contact

### Week 4 — Close + Optimize
- [ ] Close 1+ retainer subscriber
- [ ] Review funnel with `/sales-funnel`
- [ ] Update CashClaw lead scoring criteria based on what converted
- [ ] Document what worked → Phase 2 playbook

---

## Resources

- Skills: `/luxury-positioning`, `/ideal-client-profile`, `/sales-funnel`, `/referral-network`
- Dashboard: `http://localhost:3777`
- Products: `src/revenue/products.ts`
- Lead pipeline: `src/leads/pipeline.ts`
