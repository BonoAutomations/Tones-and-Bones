# Agent Instructions — Tones & Bones

You operate within a 3-layer architecture that separates
responsibilities to maximize reliability. LLMs are probabilistic,
while most business logic is deterministic and requires
consistency. This system solves that problem.

## 3-Layer Architecture

### Layer 1: Directive (What to do)
- SOPs written in Markdown, living in `directives/`
- They define objectives, inputs, tools/scripts to use, outputs, and edge cases
- Natural-language instructions, like you'd give to a mid-level employee
- Each directive is a self-contained task specification

### Layer 2: Orchestration (Decisions)
- Your job: intelligent routing
- Read the directives, call execution tools in the right order,
  handle errors, ask clarifying questions, update directives with what you learn
- You are the glue between intent and execution
  - Example: you don't try to scrape websites yourself — you read
    `directives/scrape_leads.md`, define inputs/outputs, then run
    `execution/scrape_leads.py`
- When a directive is unclear, ask. When a script fails, diagnose and fix.

### Layer 3: Execution (Doing the work)
- Deterministic Python scripts in `execution/`
- Environment variables, API tokens, etc. are stored in `.env`
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast
- Use scripts instead of manual work
- Well-commented with clear input/output contracts

**Why it works:**
If you do everything yourself, errors compound.
90% accuracy per step = ~59% success over 5 steps.
The solution is to push complexity into deterministic code so you
focus only on decision-making.

---

## Operating Principles

1. **Read before you act.** Always check the relevant directive before starting a task.
2. **Never hardcode secrets.** All keys, tokens, and credentials go in `.env`.
3. **Fail loudly.** If a script errors, surface the full traceback — don't swallow it.
4. **One script, one job.** Each execution script does exactly one thing well.
5. **Log everything.** Every API call, every decision, every retry — write it to `logs/`.
6. **Idempotent by default.** Running a script twice should not create duplicate data.
7. **Ask, don't assume.** If a directive is ambiguous, ask the user before proceeding.
8. **Update directives.** When you learn something new (rate limits, API changes, edge cases), update the relevant directive so future runs benefit.

---

## Project Context

**Tones & Bones** is a luxury sales and marketing automation platform.

### Domain
- High-end / luxury product sales
- Marketing campaign automation
- Lead generation and nurturing
- CRM integration and outreach

### Tech Stack
- **Language:** Python 3.11+
- **Environment:** `.env` for secrets, `requirements.txt` for dependencies
- **Structure:**
  - `directives/` — Markdown SOPs (Layer 1)
  - `execution/` — Python scripts (Layer 3)
  - `logs/` — Runtime logs
  - `data/` — Input/output data files
  - `tests/` — Unit tests for execution scripts

---

## Workflow

When given a task:

1. **Check** — Is there a directive in `directives/` for this task?
   - Yes → Read it, follow it exactly
   - No → Ask if one should be created, or proceed with best judgment
2. **Plan** — Identify which execution scripts are needed. Check if they exist.
   - Exists → Use them
   - Missing → Write them in `execution/`, following the patterns of existing scripts
3. **Execute** — Run the scripts with proper inputs. Capture outputs and errors.
4. **Verify** — Check the output matches the directive's expected results.
5. **Log** — Record what happened in `logs/`.
6. **Update** — If you learned something, update the directive or script.

---

## File Naming Conventions

- Directives: `directives/<task_name>.md` (e.g., `directives/scrape_leads.md`)
- Scripts: `execution/<task_name>.py` (e.g., `execution/scrape_leads.py`)
- Logs: `logs/<task_name>_YYYY-MM-DD.log`
- Data: `data/<descriptive_name>.csv` or `.json`

---

## Error Handling

When something fails:
1. **Read the error.** Don't retry blindly.
2. **Check the directive** for known edge cases.
3. **Fix the root cause** in the execution script.
4. **Update the directive** with the new edge case.
5. **Re-run** only after the fix is confirmed.

---

## Adding New Capabilities

To add a new automation:
1. Create a directive: `directives/<new_task>.md`
2. Create an execution script: `execution/<new_task>.py`
3. Add any new dependencies to `requirements.txt`
4. Add any new env vars to `.env.example`
5. Write a test in `tests/test_<new_task>.py`
