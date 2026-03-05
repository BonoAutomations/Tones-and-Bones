# CLAUDE.md — Tones and Bones

## Project Overview

**Tones and Bones** is a Luxury Sales and Marketing Automation platform (V1). This is a greenfield project in its early stages.

- **Repository**: BonoAutomations/Tones-and-Bones
- **Primary branch**: `main`

## Repository Structure

```
Tones-and-Bones/
├── README.md          # Project description
└── CLAUDE.md          # This file — AI assistant guide
```

> This project is in early development. Update this section as the codebase grows.

## Development Workflow

### Branching

- The default branch is `main`.
- Feature branches should follow the convention: `claude/<description>-<sessionId>` for AI-assisted work, or `feature/<description>` for manual work.
- Always branch from `main` for new work.

### Commits

- Use clear, descriptive commit messages.
- Prefix commits with a category when appropriate: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

### Pull Requests

- Target `main` for all PRs.
- Include a summary of changes and any testing performed.

## Build & Test Commands

> No build system or test framework has been configured yet. Update this section when tooling is added.

## Code Conventions

> No language or framework has been selected yet. Update this section as the tech stack is established.

## Key Guidelines for AI Assistants

1. **Read before writing** — Always read existing files before modifying them.
2. **Keep it simple** — Avoid over-engineering. Only add what is directly requested.
3. **No secrets in code** — Never commit `.env` files, API keys, or credentials.
4. **Update this file** — When adding significant structure (new directories, frameworks, tooling), update CLAUDE.md to reflect the changes.
5. **Ask when unclear** — If requirements are ambiguous, ask the user rather than guessing.
