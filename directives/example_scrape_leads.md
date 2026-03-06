# Directive: Scrape Leads

## Objective
Scrape potential luxury client leads from a target website and output structured data.

## Inputs
- `target_url`: The URL to scrape (passed as CLI argument)
- `SCRAPE_API_KEY`: API key for scraping service (from `.env`)

## Execution Script
`execution/scrape_leads.py`

## Steps
1. Load environment variables from `.env`
2. Send request to target URL via scraping API
3. Parse response HTML for contact information
4. Deduplicate results by email
5. Write structured output to `data/leads_YYYY-MM-DD.csv`

## Expected Output
- CSV file in `data/` with columns: `name, email, company, source_url, scraped_at`
- Log file in `logs/scrape_leads_YYYY-MM-DD.log`

## Edge Cases
- Rate limiting: If 429 received, wait 60s and retry (max 3 retries)
- Empty results: Log warning, do not create empty CSV
- Duplicate run same day: Append with dedup, don't overwrite

## Notes
- Respect robots.txt — skip pages that disallow scraping
- Max 100 leads per run to stay within API limits
