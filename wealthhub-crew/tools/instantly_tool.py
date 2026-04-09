import os
import requests
from typing import Optional


class InstantlyPusher:
    """Push leads to an Instantly campaign."""

    BASE_URL = "https://api.instantly.ai/api/v1"

    def __init__(self):
        self.api_key = os.getenv("INSTANTLY_API_KEY")
        self.campaign_id = os.getenv("INSTANTLY_CAMPAIGN_ID")
        if not self.api_key:
            raise ValueError("INSTANTLY_API_KEY not set")
        if not self.campaign_id:
            raise ValueError("INSTANTLY_CAMPAIGN_ID not set")

    def add_lead(self, email: str, first_name: str, last_name: str, company: str, custom_vars: dict | None = None) -> dict:
        """Add a single lead to the Loki's Leads campaign."""
        payload = {
            "api_key": self.api_key,
            "campaign_id": self.campaign_id,
            "skip_if_in_workspace": True,
            "leads": [
                {
                    "email": email,
                    "first_name": first_name,
                    "last_name": last_name,
                    "company_name": company,
                    **(custom_vars or {}),
                }
            ],
        }
        resp = requests.post(
            f"{self.BASE_URL}/lead/add",
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    def push_prospects(self, prospects: list[dict]) -> list[dict]:
        """Push a list of prospects to the campaign. Returns per-lead results."""
        results = []
        for p in prospects:
            try:
                r = self.add_lead(
                    email=p.get("email", ""),
                    first_name=p.get("first_name", ""),
                    last_name=p.get("last_name", ""),
                    company=p.get("company", ""),
                    custom_vars=p.get("custom_vars"),
                )
                results.append({"prospect": p.get("company"), "status": "added", "response": r})
                print(f"  [Instantly] Added {p.get('company')} — {p.get('email')}")
            except Exception as e:
                results.append({"prospect": p.get("company"), "status": "error", "error": str(e)})
                print(f"  [Instantly] Failed {p.get('company')}: {e}")
        return results
