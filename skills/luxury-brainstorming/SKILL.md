---
name: luxury-brainstorming
description: Use before starting any campaign, brand initiative, client acquisition strategy, or creative project — never after. Do not produce any output until this skill has been completed and approved.
version: 1.0.0
author: Tones and Bones
license: MIT
metadata:
  hermes:
    tags: [Luxury, Brainstorming, Strategy, Planning, Brand, Mandatory, Gate]
    related_skills: [luxury-positioning, ideal-client-profile, brand-story, sales-funnel]
---

<RIGID>
This skill is non-negotiable. No strategy, copy, campaign, or brand output may be created until this process is complete and the user has approved.
</RIGID>

## Core Principle

"Assumptions made before the brand context is understood become the mistakes you spend weeks correcting."

A luxury brand cannot afford generic output. Every campaign, every piece of copy, every strategic decision must be grounded in the specific position, client, and voice of this particular brand — not a template.

## The Brainstorming Gate

There is only one exit from this phase: **the user approves the strategic brief**.

Until then: no copy, no campaign, no content, no recommendations.

## The 9-Step Process

**Step 1: Explore Brand Context**
Before asking a single question, read what exists:
- `COMPANY.md` — mission, operating principles, core functions
- `AGENTS.md` — current agent roles and responsibilities
- Any existing positioning, client profiles, or brand story files
- Recent work or decisions in this session

**Step 2: Ask Clarifying Questions — One at a Time**
Never batch questions. Ask one. Wait for the answer. Let the answer inform the next question.

Questions to work through:
- What is the specific outcome this initiative needs to achieve?
- Who is the target client for this specific campaign (which archetype)?
- What trigger event is the client likely experiencing right now?
- What does success look like in 30 days? 90 days?
- Are there any constraints (tone, format, channel, timeline, budget)?
- What has been tried before, and what happened?

**Step 3: Identify the Core Fear to Address**
Every luxury initiative should speak to a specific identity-level fear without naming it explicitly. Identify it before producing any output.

**Step 4: Propose 2-3 Strategic Approaches**
Present options with trade-offs and a recommendation:
- Approach A: [what it is, why it works, what it risks]
- Approach B: [what it is, why it works, what it risks]
- Approach C (optional): [what it is, why it works, what it risks]
- **Recommendation:** [which approach and why, in one clear sentence]

**Step 5: Present the Strategic Brief in Sections**
Scale depth to complexity. For each section, seek approval before proceeding:

```
Section 1: Position Confirmation
  - The brand's current position as understood
  - The specific angle this initiative takes
  - Any tension or risk in the approach

Section 2: Target Client for This Initiative
  - Which archetype(s) are being addressed
  - The trigger event being spoken to
  - The core fear being quietly addressed

Section 3: Voice and Tone Constraints
  - What this must sound like
  - What it must never sound like
  - Any specific language to use or avoid

Section 4: Success Criteria
  - What "working" looks like for this initiative
  - How it will be measured
  - When to revisit or adjust
```

**Step 6: Write the Strategic Brief**
Save to `docs/briefs/YYYY-MM-DD-<initiative-name>.md` and commit to git.

Brief format:
```
# [Initiative Name] — Strategic Brief

Date: YYYY-MM-DD
Initiative: [one-sentence description]
Target client: [archetype + trigger event]
Core fear being addressed: [one sentence]
Approach selected: [which option and why]
Voice constraints: [3-5 bullet points]
Success criteria: [measurable outcomes]
Hard limits: [what this initiative must never do]
```

**Step 7: Self-Review the Brief**
Check for:
- [ ] Any placeholder language ("to be determined", "will be defined later")
- [ ] Any contradiction between the brand position and the proposed approach
- [ ] Any assumption about the client that hasn't been validated
- [ ] Any tone or language that conflicts with the luxury brand voice rules
- [ ] Any missing constraint that would cause a course-correction mid-execution

**Step 8: Present for Approval**
State explicitly: "This brief is ready for your approval. No work begins until you confirm."

**Step 9: On Approval — Invoke the Next Skill**
After approval, invoke the appropriate execution skill:
- Brand/copy work → `brand-story` or `luxury-positioning`
- New client initiative → `sales-funnel` or `ideal-client-profile`
- Client retention → `client-experience` or `referral-network`
- Revenue work → `pricing-strategy`
- Systems work → `automation-audit`

## Hard Limits for Luxury Brainstorming

These cannot appear in any brief or output from this skill:

- Urgency language ("limited time", "act now", "don't miss out")
- Discount framing ("affordable", "accessible pricing", "value offer")
- Generic social proof ("trusted by hundreds", "5-star rated")
- Volume claims ("reach thousands of clients")
- Competitive comparisons ("better than", "unlike our competitors")

If any of these appear in the brief, the brief is wrong. Revise before presenting.

## Anti-Patterns That Will Trigger This Skill

If you catch yourself thinking any of these, stop and restart the brainstorming process:

| Thought | Why it's wrong |
|---|---|
| "The brief seems obvious" | Obvious briefs produce generic output |
| "The client knows what they want" | Wants and needs diverge in luxury. Explore first. |
| "Let's just start with a draft" | Drafts without briefs become revision marathons |
| "This is a small initiative" | Small campaigns do the most brand damage when off-position |
| "We've done this type of work before" | Every brand's context is different |
| "The brief can come after" | It can't. That's not how this works. |
