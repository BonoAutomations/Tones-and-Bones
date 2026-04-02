---
name: repomix
description: Use before any task requiring full company or codebase context — when executing an automation audit, onboarding to a new client project, or preparing a repository for AI-assisted analysis. Do not read files one by one when repomix can load everything at once.
version: 1.0.0
author: Tones and Bones
license: MIT
metadata:
  hermes:
    tags: [Repomix, Context, Codebase, AI, Analysis, Audit, Repository]
    related_skills: [automation-audit, luxury-brainstorming]
---

You are loading full repository context using repomix before beginning any task that requires understanding a codebase, company structure, or technical infrastructure.

## Core Principle

"One command loads everything. Reading files one by one loses the relationships between them."

Repomix packs an entire repository into a single AI-friendly file. Use it instead of exploring files manually whenever the task requires understanding the whole rather than one part.

## When to Use This Skill

- **Before an automation audit** — pack the company repo to understand every system in context
- **Before a client codebase review** — pack their repo before making recommendations
- **When onboarding to a new project** — get full context in one pass
- **When a task touches more than 3 files** — pack first, then act
- **Before dispatching subagents** — give each subagent the packed output as context

## Quick Reference

```bash
# Pack current directory (uses repomix.config.json if present)
npx repomix@latest

# Pack to markdown (most readable for analysis)
npx repomix@latest --style markdown

# Pack a remote GitHub repository
npx repomix@latest --remote owner/repo

# Pack a specific subdirectory
npx repomix@latest path/to/directory

# Pack only specific file types
npx repomix@latest --include "**/*.md,**/*.json"

# Pack with compression (reduces token count for large repos)
npx repomix@latest --compress

# Check token count without generating output
npx repomix@latest --token-count-only
```

## Packing the Tones and Bones Company Repo

The repo includes a pre-configured `repomix.config.json`. Running repomix from the repo root produces `repomix-output.md` containing:
- `COMPANY.md` — mission and operating principles
- `AGENTS.md` — org chart and heartbeat schedules
- `README.md` — product description and install instructions
- All 10 `SKILL.md` files
- All 3 project templates

```bash
cd /path/to/tones-and-bones
npx repomix@latest
# Output: repomix-output.md
```

Pass `repomix-output.md` as context to any agent before a strategy or automation task.

## Packing a Client Repository for Audit

```bash
# Pack their GitHub repo directly (no clone needed)
npx repomix@latest --remote client-org/their-repo --style markdown

# Or pack a local clone
npx repomix@latest /path/to/client-repo --style markdown --include "**/*.md,**/*.json,**/*.yml,**/*.yaml"
```

Use this before running `/automation-audit` on a client's tech stack.

## Using Repomix as an MCP Server

Repomix can run as an MCP server, giving agents direct tool access to pack repositories on demand:

```bash
# Add to claude_desktop_config.json or hermes MCP config:
{
  "mcpServers": {
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

MCP tools available once connected:
- `pack_codebase` — pack a local directory
- `pack_remote_repository` — pack a remote GitHub repo
- `read_repomix_output` — read a previously generated output file

## Output Format Guide

| Format | Use when... |
|---|---|
| `markdown` | Feeding to a conversational AI for analysis or strategy |
| `xml` | Programmatic processing or structured extraction |
| `json` | Integrating with automation pipelines |

## After Packing

Once the output file is generated:
1. Read it fully before beginning the task
2. Note the directory structure section — it reveals what kind of project this is
3. Note the file summary section — it shows what's most recently changed
4. Pass the output file path as context to any subagents you dispatch

## Token Awareness

Repomix reports estimated token count. Before passing to a model:
- Under 100K tokens: safe for most models including claude-sonnet-4-6
- 100K–200K tokens: use `--compress` to reduce, or narrow with `--include`
- Over 200K tokens: pack subdirectories separately, or use `--include` to target

```bash
# Check token count first
npx repomix@latest --token-count-only

# Compress if needed
npx repomix@latest --compress --style markdown
```

## .repomixignore

Add a `.repomixignore` file to any repo to control what repomix excludes — same syntax as `.gitignore`. For Tones and Bones, the `repomix.config.json` handles this; for client repos, create one before packing:

```
node_modules/
.env
*.key
dist/
build/
repomix-output.*
```
