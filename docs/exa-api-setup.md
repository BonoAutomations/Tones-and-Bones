# Exa API Setup

## Overview

Exa provides web search, content extraction, and research capabilities for the Tones-and-Bones AI application stack. It powers contextual search across our integrations: fal.ai/Stability AI (image generation), OpenRouter (LLM routing), ElevenLabs (voice synthesis), Dify.ai (chat interface), and CCBill/Epoch (payment processing).

## Quick Start

1. **Get your API key** from [dashboard.exa.ai/api-keys](https://dashboard.exa.ai/api-keys)

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set EXA_API_KEY
   ```

3. **Test the connection:**
   ```bash
   chmod +x scripts/exa-search.sh
   ./scripts/exa-search.sh "AI voice synthesis API"
   ```

## Shell Scripts

### Search (`scripts/exa-search.sh`)

```bash
./scripts/exa-search.sh "query" [num_results] [search_type]
```

- `num_results` — default: 10
- `search_type` — `auto` (default), `fast`, `deep`, or `deep-reasoning`

### Content Extraction (`scripts/exa-contents.sh`)

```bash
./scripts/exa-contents.sh "https://example.com/page1" "https://example.com/page2"
```

Extracts full text from known URLs. Requires `jq` installed.

## Search Types

| Type | Speed | Use Case |
|------|-------|----------|
| `fast` | ~200ms | Quick lookups, autocomplete |
| `auto` | ~1s | General queries (recommended) |
| `deep` | ~5s | Research, enrichment |
| `deep-reasoning` | ~10s+ | Complex multi-step research |

## cURL Examples

### Basic Search
```bash
curl -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "AI image generation best practices",
  "type": "auto",
  "num_results": 10,
  "contents": { "text": { "max_characters": 20000 } }
}'
```

### Category Search (News)
```bash
curl -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
  "query": "AI payment processing compliance",
  "category": "news",
  "type": "auto",
  "num_results": 5,
  "contents": { "text": { "max_characters": 20000 } }
}'
```

### Content Extraction
```bash
curl -X POST 'https://api.exa.ai/contents' \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
  "urls": ["https://docs.fal.ai/quickstart"],
  "text": { "max_characters": 20000 }
}'
```

## Devin MCP Integration

Add the Exa MCP server in [Devin Settings → MCP Marketplace](https://app.devin.ai/settings/mcp):

- **Command:** `npx`
- **Args:** `-y mcp-remote https://mcp.exa.ai/mcp?exaApiKey=YOUR_KEY`

To enable all tools, append:
```
&tools=web_search_exa,web_search_advanced_exa,get_code_context_exa,crawling_exa,company_research_exa,people_search_exa,deep_researcher_start,deep_researcher_check
```

## API Reference

- **Docs:** https://exa.ai/docs
- **Dashboard:** https://dashboard.exa.ai
- **Status:** https://status.exa.ai

## Common Mistakes

- `useAutoprompt` is deprecated — remove it
- Use `includeDomains`/`excludeDomains`, not `includeUrls`/`excludeUrls`
- `stream: true` is not supported on `/search` or `/contents`
- On `/search`, nest `text`/`highlights` inside `contents`; on `/contents` they are top-level
- Use `maxAgeHours` instead of deprecated `livecrawl` parameter
