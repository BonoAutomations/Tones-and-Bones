# Tones-and-Bones — AI Context

## Project Identity

**Name:** Tones-and-Bones  
**Domain:** Luxury Sales and Marketing Automation  
**Mission:** Automate and elevate the end-to-end luxury sales and marketing workflow — from prospect intelligence to campaign execution — delivering white-glove precision at scale.

## How to Work

### Mode Selection

Before every task, classify it and select a mode:

| Mode | When to Use |
|------|-------------|
| **MINIMAL** | Obvious, single-step tasks. Execute directly. |
| **NATIVE** | Moderate tasks requiring judgment. Use Claude's native reasoning. |
| **ALGORITHM** | Complex, multi-stakeholder, or high-stakes tasks. Run all 7 phases. |

Default to MINIMAL. Escalate only when complexity demands it.

---

## The Algorithm (v6.3.0)

For ALGORITHM-mode tasks, work through all seven phases in sequence. Show your work.

```
OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN
```

### Phase Definitions

**1. OBSERVE** — Gather context. What do we know? What's the current state? What's missing?  
**2. THINK** — Analyze patterns. What are the root causes? What are the constraints? What are the risks?  
**3. PLAN** — Design the approach. Sequence steps. Identify dependencies. Anticipate blockers.  
**4. BUILD** — Create the output. Code, copy, strategy, or artifact.  
**5. EXECUTE** — Deliver or deploy. Make it real.  
**6. VERIFY** — Test and validate. Does it meet the criteria? What's the delta from ideal?  
**7. LEARN** — Capture insights. What worked? What didn't? What do we update?

---

## ISA (Ideal State Artifact)

Every significant project or campaign begins with an ISA — a hard-to-vary description of what "done" looks like. Use `/isa` to create one.

**12 ISA Sections:**
1. **Problem** — What's wrong or missing right now?
2. **Vision** — What does the ideal outcome look like?
3. **Out of Scope** — What are we explicitly NOT doing?
4. **Principles** — What values guide decisions when trade-offs arise?
5. **Constraints** — What are the hard limits (time, budget, tech, brand)?
6. **Goal** — One-sentence statement of success.
7. **Criteria** — Measurable conditions that confirm the goal is met.
8. **Test Strategy** — How will we verify the criteria are satisfied?
9. **Features** — What capabilities or deliverables does this require?
10. **Decisions** — Key choices made and why.
11. **Changelog** — How has the ISA evolved?
12. **Verification** — Final sign-off checklist.

---

## Memory System

| File | Purpose |
|------|---------|
| `.claude/MEMORY/WORK.md` | Active tasks, current focus, sprint state |
| `.claude/MEMORY/KNOWLEDGE.md` | Domain knowledge, luxury market facts, brand guides |
| `.claude/MEMORY/LEARNING.md` | Patterns learned, what worked, what didn't |
| `.claude/MEMORY/CLIENTS.md` | Client and prospect intelligence |
| `.claude/MEMORY/CAMPAIGNS.md` | Active and archived campaign tracking |

**Session start:** Always read WORK.md first.  
**Session end:** Update WORK.md with current state and LEARNING.md with any new insights.

---

## Domain Context

### Luxury Sales Principles
- **Scarcity over abundance** — Luxury is defined by what it excludes, not what it includes.
- **Story before specification** — Lead with narrative and aspiration; specs follow.
- **Relationship over transaction** — The sale is a byproduct of the relationship.
- **Precision over volume** — One perfectly placed touchpoint beats ten generic ones.
- **Aesthetic consistency** — Every artifact must match the brand's visual and tonal register.

### Tones-and-Bones Stack
- **Tones** = Brand voice, narrative, emotional register, copywriting
- **Bones** = Structure, data, automation, CRM logic, workflow

Both must be present in every output. Tones without Bones is beautiful but useless. Bones without Tones is functional but cold.

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/algorithm` | Run the 7-phase Algorithm on a problem |
| `/isa` | Create an Ideal State Artifact for a project |
| `/sales-package` | Generate a full sales narrative + talking points |
| `/prospect-research` | Deep research a prospect or account |
| `/campaign-brief` | Create a campaign brief with ISA |
| `/first-principles` | Break a problem down to first principles |
| `/thinking` | Run structured multi-mode analysis |

---

## Code and Output Standards

- **No filler content** — Every word earns its place.
- **No placeholder copy** — Deliver real, production-ready artifacts.
- **Brand voice** — Elevated, precise, warm but never casual, authoritative but never arrogant.
- **Data integrity** — If you don't know a number, say so. Never fabricate.
- **Format for the medium** — Email ≠ deck ≠ CRM field. Adapt format to destination.
