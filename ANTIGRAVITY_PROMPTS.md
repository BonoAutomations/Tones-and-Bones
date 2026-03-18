# Antigravity Agent-Driven Development Prompts

Battle-tested prompts for agent-driven development, tuned for use right after installing Antigravity.

---

## 1. First-Time Setup & Understanding the Codebase

### Onboard the agent to your project

> "You are my lead engineer working inside this repo.
>  1) Scan the entire project structure.
>  2) Create or update `README.md` explaining the architecture, key technologies, and how to run dev and tests.
>  3) List any obvious issues or smells you notice (missing env vars, scripts, configs).
>  Do all planning in an Artifact first; wait for my approval before editing files."

### Create a living project map

> "Analyze this project and generate three Artifacts:
>  - `ARCHITECTURE.md`: high-level architecture and data flow.
>  - `ROUTES.md`: all API routes or main app screens and what they do.
>  - `TASKS_TODO.md`: a prioritized list of technical debt and small improvements.
>  Only after I approve these Artifacts, propose the top 3 safest tasks you can implement autonomously."

---

## 2. Safe Agent-Driven Feature Work

Use these when you want the agent to drive, but with guardrails.

### Implement a small feature end-to-end

> "You are acting as a senior full-stack engineer.
>  Goal: [describe feature very clearly].
>  Constraints:
>  - Do not change auth or billing logic.
>  - Always create a plan Artifact before coding.
>  - For every code change, also add or update at least one test.
>  Steps:
>  1) Draft a detailed plan Artifact listing files you'll touch and tests you'll run.
>  2) Wait for my approval.
>  3) Implement the changes, run tests in the terminal, then summarize the diff and test results.
>  Ask for confirmation before running any destructive commands."

### Small, scoped refactor

> "Identify ONE small refactor that improves this codebase without changing behavior (e.g., remove duplication, improve naming, extract a helper).
>  1) Propose 3 candidate refactors and their risk level.
>  2) After I pick one, create a plan Artifact.
>  3) Apply the refactor, run tests, and show me the diff with explanations."

---

## 3. Debugging & Troubleshooting Prompts

### Guided bug hunt

> "I'm getting this error:
>  ```
>  [paste stack trace / error]
>  ```
>  1) Locate the most likely root cause across the codebase.
>  2) Propose at least two different fixes in an Artifact (with pros/cons).
>  3) After I choose, apply the fix, run the relevant tests or repro command, and summarize what changed and why the bug happened."

### "Find what broke" across recent commits

> "Something broke in the last few commits.
>  1) Analyze git history for the last 10 commits focusing on [file(s)/area].
>  2) Identify the most likely commit that introduced the bug and explain why.
>  3) Suggest either a minimal fix or a small revert plan.
>  4) After I approve, implement it and run tests."

---

## 4. Tests, Docs, and Cleanup

### Turn specs into tests

> "Given the current code and docs, create a new test file (or update an existing one) that:
>  - Covers the main happy path of [feature].
>  - Adds at least one negative test for an edge case you find.
>  Explain what each test case is asserting in plain English.
>  Draft the tests in an Artifact first, then implement after I approve."

### Comment and document critical paths

> "Find the 3 most critical files for [feature/domain].
>  For each file:
>  - Add clear docstrings / comments for public functions and complex logic.
>  - If documentation is missing, update `ARCHITECTURE.md` or create `FEATURE_[NAME].md` describing how this part works.
>  Avoid changing behavior; this is doc-only unless you find obvious bugs."

---

## 5. Meta Prompt: Session Behavior Steering

Drop this at the top of any big session to steer agent behavior:

> "You are my senior engineer inside Antigravity.
>  - Always create a plan in an Artifact before touching code.
>  - Always list the exact files you intend to edit.
>  - Prefer small, reversible changes.
>  - Ask for confirmation before running commands that modify data or the environment.
>  - After each task, summarize: what changed, why, and how to roll it back.
>  If my request is vague, ask clarifying questions before acting."

---

## Sources

- [Getting Started with Google Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)
- [Best Prompts for Coding Inside Antigravity (Top 50) - Skywork.ai](https://skywork.ai/blog/agent/best-prompts-antigravity/)
- [How to Set Up and Use Google Antigravity - Codecademy](https://www.codecademy.com/article/how-to-set-up-and-use-google-antigravity)
- [Tips for Agent Driven Development - Reddit](https://www.reddit.com/r/google_antigravity/comments/1rm401s/tips_for_agent_driven_development_not_quota/)
- [Google Antigravity: 20 Game-Changing Prompts - HackerNoon](https://hackernoon.com/google-antigravity-20-game-changing-prompts-for-complete-automation)
- [Google Antigravity Prompts - GitHub Gist](https://gist.github.com/CypherpunkSamurai/f16e384ed1629cc0dd11fea33e444c17)
- [My Experience with Google Antigravity - Domenico Tenace](https://domenicotenace.dev/blog/how-i-refactored-easy-kit-utils-with-ai-agents/)
