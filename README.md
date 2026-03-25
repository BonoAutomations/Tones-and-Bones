# Tones and Bones

**The operating system for luxury service businesses.**

Tones and Bones is an autonomous sales and marketing intelligence system built for premium service brands. It replaces a fractional CMO, sales consultant, and client success manager — running 24/7 as governed AI agents, guided by luxury-specific frameworks that understand why high-net-worth clients buy (and why they walk away).

---

## What It Does

8 interconnected skills cover the full lifecycle of a luxury service business:

| Skill | What It Produces |
|---|---|
| `/luxury-positioning` | Your positioning statement, exclusivity signal, and singular promise |
| `/ideal-client-profile` | HNW client archetypes by identity, trigger events, and core fears |
| `/brand-story` | A 150-word origin narrative that converts skeptics into believers |
| `/sales-funnel` | A 5-stage funnel designed to attract rather than pursue |
| `/client-experience` | A 7-moment white-glove journey map that generates referrals |
| `/pricing-strategy` | Premium pricing models with scripts for defending your rates |
| `/referral-network` | A 3-type referral ecosystem built on trust, not incentives |
| `/automation-audit` | An 8-area audit of your sales and marketing systems |

Skills interlock by design. Positioning informs pricing. Pricing informs the funnel. The funnel feeds the client experience. The experience generates referrals.

---

## Who It's For

**Luxury service solopreneurs and boutique firms** — stylists, executive coaches, interior designers, wealth advisors, photographers, bespoke consultants. Exceptional at the craft. Ready to build the business around it.

**ASAM stack operators** — running Paperclip + Hermes and need a luxury vertical with real domain intelligence, not generic business advice.

**Agencies serving luxury clients** — who need AI systems that respect the brand standard and won't generate generic, mass-market output.

---

## Install as a Claude Code Plugin

Use the skills directly in any Claude Code session:

```bash
# Skills activate automatically when this repo is a Claude Code plugin.
# Then use any skill:
/luxury-positioning
/sales-funnel
/pricing-strategy
```

---

## Import into Paperclip (ASAM Stack)

```bash
# With Paperclip running at localhost:3100
npx companies.sh add bonoautomations/tones-and-bones \
  --provider paperclip \
  --connection custom-url \
  --api-base http://127.0.0.1:3100 \
  -y
```

This creates the **Tones and Bones** company (`/TON/dashboard`) with all 8 skills imported. Then hire the three agents defined in `AGENTS.md` — CMO, Sales Director, and Client Experience Director — each with a heartbeat schedule and monthly budget cap.

---

## Install into Hermes Agent

```bash
for skill in luxury-positioning ideal-client-profile brand-story sales-funnel \
             client-experience pricing-strategy referral-network automation-audit; do
  mkdir -p ~/.hermes/workspace/skills/$skill
  cp skills/$skill/SKILL.md ~/.hermes/workspace/skills/$skill/SKILL.md
done
hermes gateway restart && hermes skills list
```

---

## Stack

Built for the Agentic Stack v3:

- **Paperclip** — company OS, org chart, heartbeat scheduling, governance, budget caps
- **Hermes Agent** — self-improving worker runtime with persistent memory
- **Claude Code** — primary reasoning engine (claude-sonnet-4-6)
- **ClawTeam** — swarm orchestration for parallel research tasks

---

## Agent Org Chart

See `AGENTS.md` for the full structure:

- **CMO** — brand, positioning, referral network (Monday 07:00 heartbeat)
- **Sales Director** — pipeline, funnel, pricing compliance (Tue + Fri 08:00 heartbeat)
- **Client Experience Director** — active clients, onboarding, post-project follow-up (Wed 09:00 heartbeat)

---

## License

MIT — built by Tones and Bones, powered by the [agentskills.io](https://agentskills.io) open standard.
