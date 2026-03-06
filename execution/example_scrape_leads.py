"""
Scrape Leads — Execution Script
Directive: directives/example_scrape_leads.md

Scrapes a target URL for luxury client leads and outputs structured CSV.

Usage:
    python execution/example_scrape_leads.py <target_url>
"""

import csv
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure project root imports work
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = PROJECT_ROOT / "logs"
DATA_DIR = PROJECT_ROOT / "data"


def setup_logging():
    """Configure logging to file and console."""
    LOG_DIR.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = LOG_DIR / f"scrape_leads_{today}.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger(__name__)


def load_env():
    """Load environment variables. Requires SCRAPE_API_KEY."""
    api_key = os.getenv("SCRAPE_API_KEY")
    if not api_key:
        raise EnvironmentError("SCRAPE_API_KEY not set in environment / .env")
    return api_key


def scrape(target_url, api_key, max_retries=3):
    """
    Scrape the target URL for leads.

    Returns a list of dicts: [{name, email, company, source_url, scraped_at}]
    """
    logger = logging.getLogger(__name__)

    # --- Replace this block with your actual scraping logic ---
    logger.info(f"Scraping: {target_url}")
    leads = []
    # Example placeholder:
    # response = requests.get(target_url, headers={"Authorization": f"Bearer {api_key}"})
    # leads = parse_leads(response.text)
    logger.info(f"Found {len(leads)} leads")
    # -----------------------------------------------------------

    return leads


def deduplicate(leads):
    """Remove duplicate leads by email."""
    seen = set()
    unique = []
    for lead in leads:
        if lead["email"] not in seen:
            seen.add(lead["email"])
            unique.append(lead)
    return unique


def write_csv(leads):
    """Write leads to CSV in data/ directory."""
    DATA_DIR.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    output_path = DATA_DIR / f"leads_{today}.csv"

    fieldnames = ["name", "email", "company", "source_url", "scraped_at"]
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(leads)

    return output_path


def main():
    logger = setup_logging()

    if len(sys.argv) < 2:
        logger.error("Usage: python execution/example_scrape_leads.py <target_url>")
        sys.exit(1)

    target_url = sys.argv[1]
    api_key = load_env()

    leads = scrape(target_url, api_key)

    if not leads:
        logger.warning("No leads found. Skipping CSV output.")
        return

    leads = deduplicate(leads)
    output_path = write_csv(leads)
    logger.info(f"Wrote {len(leads)} leads to {output_path}")


if __name__ == "__main__":
    main()
