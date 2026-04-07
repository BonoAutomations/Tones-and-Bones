import os
import requests


class BraveSearch:
    """
    Web search client for B2B prospect discovery.
    Supports Google Custom Search API (preferred) or Brave Search API.
    Set GOOGLE_API_KEY + GOOGLE_CSE_ID to use Google, otherwise falls back to BRAVE_API_KEY.
    """

    GOOGLE_URL = "https://www.googleapis.com/customsearch/v1"
    BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self):
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        self.google_cse_id = os.getenv("GOOGLE_CSE_ID")
        self.brave_api_key = os.getenv("BRAVE_API_KEY")

        if self.google_api_key and self.google_cse_id:
            self._backend = "google"
        elif self.brave_api_key:
            self._backend = "brave"
        else:
            raise ValueError(
                "No search API configured. Set either:\n"
                "  GOOGLE_API_KEY + GOOGLE_CSE_ID  (Google Custom Search)\n"
                "  BRAVE_API_KEY                   (Brave Search)"
            )
        print(f"  [Search] Using backend: {self._backend}")

    def search(self, query: str, count: int = 10) -> list[dict]:
        """Run a search query and return normalised results."""
        if self._backend == "google":
            return self._google_search(query, count)
        return self._brave_search(query, count)

    def _google_search(self, query: str, count: int) -> list[dict]:
        """Google Custom Search JSON API — 100 free queries/day."""
        results = []
        # Google returns max 10 per request; page if needed
        for start in range(1, min(count, 20) + 1, 10):
            params = {
                "key": self.google_api_key,
                "cx": self.google_cse_id,
                "q": query,
                "num": min(10, count - len(results)),
                "start": start,
            }
            resp = requests.get(self.GOOGLE_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("items", []):
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("link", ""),
                    "description": item.get("snippet", ""),
                })
            if len(results) >= count:
                break
        return results[:count]

    def _brave_search(self, query: str, count: int) -> list[dict]:
        """Brave Search API fallback."""
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.brave_api_key,
        }
        params = {"q": query, "count": min(count, 20), "search_lang": "en"}
        resp = requests.get(self.BRAVE_URL, headers=headers, params=params, timeout=15)
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
                print(f"  [Search] Query failed: {e}")

        # Deduplicate by domain
        seen_domains = set()
        unique = []
        for r in all_results:
            domain = r["url"].split("/")[2] if "/" in r["url"] else r["url"]
            if domain not in seen_domains:
                seen_domains.add(domain)
                unique.append(r)
        return unique[:count]
