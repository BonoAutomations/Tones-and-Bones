import os
import requests
from typing import Optional


class BraveSearch:
    """Brave Search API client for B2B prospect discovery."""

    BASE_URL = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self):
        self.api_key = os.getenv("BRAVE_API_KEY")
        if not self.api_key:
            raise ValueError("BRAVE_API_KEY not set")
        self.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.api_key,
        }

    def search(self, query: str, count: int = 10) -> list[dict]:
        """Run a search query and return results."""
        params = {"q": query, "count": min(count, 20), "search_lang": "en"}
        resp = requests.get(self.BASE_URL, headers=self.headers, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for item in data.get("web", {}).get("results", []):
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "description": item.get("description", ""),
            })
        return results

    def find_b2b_prospects(self, niche: str, count: int = 5) -> list[dict]:
        """Find B2B prospects in a specific niche."""
        queries = [
            f'"{niche}" company "contact us" site:linkedin.com/company',
            f'"{niche}" B2B firm "schedule a call" -site:linkedin.com',
            f'"{niche}" advisory firm email "info@" OR "hello@"',
        ]
        all_results = []
        for q in queries:
            try:
                results = self.search(q, count=10)
                all_results.extend(results)
            except Exception as e:
                print(f"  [Brave] Query failed: {e}")
        # Deduplicate by domain
        seen_domains = set()
        unique = []
        for r in all_results:
            domain = r["url"].split("/")[2] if "/" in r["url"] else r["url"]
            if domain not in seen_domains:
                seen_domains.add(domain)
                unique.append(r)
        return unique[:count]
