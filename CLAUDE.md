# CLAUDE.md — Tones and Bones

This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**Tones and Bones** is a Luxury Sales and Marketing Automation platform (V1). The repository is in early initialization — currently contains only a README. All scaffolding and feature development is yet to be done.

- **Repository:** BonoAutomations/Tones-and-Bones
- **Purpose:** Luxury brand sales and marketing automation
- **Stage:** Pre-development / fresh initialization

---

## Repository State (as of 2026-02-18)

The repository contains:

```
Tones-and-Bones/
├── README.md       # Project title and one-line description
└── CLAUDE.md       # This file
```

No source code, dependencies, configuration, or tooling has been added yet. When scaffolding begins, update this file to reflect the chosen stack.

---

## Git Workflow

### Branches

| Branch | Purpose |
|--------|---------|
| `main` / `master` | Stable production branch |
| `claude/*` | AI-assisted development branches |

### Branch Naming

- Feature branches: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`
- AI-assisted work: `claude/<task-description>-<session-id>`

### Commit Conventions

Use clear, imperative commit messages:

```
Add user authentication module
Fix email template rendering bug
Refactor campaign scheduler for reliability
```

Do not use vague messages like `update`, `changes`, or `misc`.

### Push Instructions

Always push with upstream tracking:

```bash
git push -u origin <branch-name>
```

Branches used by Claude Code must start with `claude/`.

---

## Development Conventions (to be established)

As the project is scaffolded, document the following here:

### Technology Stack

> To be defined. Likely candidates for a luxury marketing automation platform:
> - **Backend:** Node.js / Python / Go
> - **Frontend:** React / Next.js / Vue
> - **Database:** PostgreSQL / MongoDB
> - **Automation:** n8n, custom workflow engine
> - **Messaging/Email:** SendGrid, Mailgun, or similar

### Coding Style

> To be defined once the stack is chosen. Update this section with:
> - Language-specific linting rules (ESLint, Pylint, etc.)
> - Formatter configuration (Prettier, Black, etc.)
> - File naming conventions

### Testing

> To be defined. Update this section with:
> - Test framework (Jest, Vitest, pytest, etc.)
> - Coverage requirements
> - How to run tests: `npm test` / `pytest` / etc.

### Environment Variables

> To be defined. Create a `.env.example` file and document required variables here when the project is scaffolded.

---

## Instructions for AI Assistants

### When Starting Work

1. Read this file first to understand the project state.
2. Check the current branch — development should happen on `claude/<task>-<id>` branches.
3. Review recent git log for context on work already done: `git log --oneline -20`
4. Avoid introducing code without understanding the intended architecture.

### Code Quality Rules

- Do not add code without a clear purpose tied to the current task.
- Do not over-engineer — prefer simple, direct implementations.
- Do not add unused imports, dead code, or placeholder stubs unless explicitly requested.
- Do not introduce security vulnerabilities (SQL injection, XSS, command injection, etc.).
- Validate user input only at system boundaries (API endpoints, form inputs).

### File Operations

- Prefer editing existing files over creating new ones.
- Do not create documentation files (README, CHANGELOG, etc.) unless explicitly asked.
- Never commit `.env` files or secrets.

### When Scaffolding the Project

When the stack is decided and scaffolding begins, update this CLAUDE.md with:

1. Actual directory structure
2. Exact commands for running development server, tests, linter, and build
3. Environment variable requirements (reference `.env.example`)
4. Database migration commands
5. Deployment process

---

## Quick Reference (update as project grows)

```bash
# Placeholder — replace with actual commands once stack is chosen

# Install dependencies
# npm install  |  pip install -r requirements.txt

# Run development server
# npm run dev  |  python main.py

# Run tests
# npm test  |  pytest

# Lint
# npm run lint  |  flake8 .

# Build for production
# npm run build
```

---

## Contact / Ownership

- **Org:** BonoAutomations
- **Initial commit author:** trex.n8n@gmail.com
