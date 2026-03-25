# Skill: Automation Audit

**Command:** `/automation-audit`
**Category:** Systems & Operations
**Hermes Tag:** `ops.automation-audit`

---

## Purpose

Audit the current CRM and marketing automation stack, identify gaps, and produce a prioritized action plan with specific GHL workflow recommendations.

---

## When to Use

- Before scaling from Phase 1 → Phase 2
- When leads are falling through the cracks
- When Stripe/Whop revenue isn't flowing into GHL
- Before building any new workflow or automation

---

## How to Activate

Provide Claude with:
1. **Current tools** — GHL, Stripe, Whop, X, email provider, etc.
2. **Current workflows** — Which automations are live? (even if rough descriptions)
3. **Known gaps** — What's manual that shouldn't be?
4. **Volume** — How many leads/month? How many clients active?
5. **Pain point** — The one thing taking the most time/causing the most stress

---

## Outputs

1. **Automation Score** — 0–100 rating with breakdown by category
2. **Stack Map** — Visual description of current tool connections + gaps
3. **Gap Analysis** — Top 10 missing automations ranked by impact
4. **Priority Fix List** — 30-day action plan: what to build first, second, third
5. **GHL Workflow Blueprints** — Specific trigger → action → condition specs for top 3 fixes
6. **Quick Wins** — 3 automations buildable in under 1 hour
7. **Dependency Map** — What needs to be set up before advanced workflows work
8. **Monthly Automation Savings** — Estimated hours saved per month post-implementation

---

## ASAM Automation Checklist

- [ ] GHL webhook from Whop purchase → contact created + tag applied
- [ ] Stripe payment webhook → GHL pipeline stage update
- [ ] New Moltlaunch task completion → GHL activity log
- [ ] Lead score (hot/warm/cold) → GHL tag + pipeline routing
- [ ] Monthly retainer subscriber → welcome sequence trigger
- [ ] Inactive lead (30d no response) → re-engagement sequence
- [ ] Post-close 30-day → review request + referral ask
- [ ] Content brief delivery → social post queue
- [ ] Daily ETH earnings → revenue log in GHL custom field

---

## Example Prompt

```
/automation-audit

Tools: GHL (basic setup), Stripe (test mode), Whop (live), X (manual posting)
Current workflows: None fully automated — some manual email sequences
Known gaps: Whop buyers not going into GHL, no lead scoring, no follow-up sequences
Volume: 5–10 leads/month, 2–3 active clients
Pain point: Following up manually with everyone is eating all my time
```
