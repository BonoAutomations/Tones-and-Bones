import json
import re
import os
from .base import BaseAgent
from tools import BraveSearch


class ScoutAgent(BaseAgent):
    """
    SCOUT — Finds 5 real B2B prospects in the wealth management / financial services niche.
    Uses Brave Search to discover companies, then enriches each with Claude.
    """

    def run(self) -> list[dict]:
        print("\n🔍 SCOUT: Finding B2B prospects...")
        brave = BraveSearch()
        raw = brave.find_b2b_prospects(self.niche, count=10)
        print(f"  Found {len(raw)} raw results from Brave Search")

        system = (
            "You are a B2B sales intelligence analyst for WealthHub.llc, a marketing automation agency "
            "specializing in wealth management, financial advisory, and fintech firms.\n"
            "Your job: given raw search results, extract and enrich the 5 BEST prospect companies.\n"
            "Rules:\n"
            "- Only real companies (not aggregators, directories, or news sites)\n"
            "- Focus on RIAs, wealth managers, financial advisors, family offices, fintech startups\n"
            "- Infer a plausible business contact email if not explicitly listed (use domain pattern)\n"
            "- Return ONLY valid JSON: a list of 5 objects with keys: "
            "company, domain, first_name, last_name, email, title, pain_point, why_now\n"
            "- pain_point: their specific growth/retention challenge WealthHub can solve\n"
            "- why_now: a timely hook (market trend, regulation, competitor pressure)"
        )
        raw_text = json.dumps(raw, indent=2)
        prompt = (
            f"Here are raw Brave Search results for '{self.niche}' B2B prospects:\n\n"
            f"{raw_text}\n\n"
            "Extract and enrich the 5 best prospects. Return ONLY a JSON array — no markdown, no explanation."
        )

        response = self.ask(system, prompt, max_tokens=1500)

        # Extract JSON from response
        match = re.search(r"\[.*\]", response, re.DOTALL)
        if not match:
            raise ValueError(f"SCOUT: Could not parse JSON from response:\n{response[:500]}")

        prospects = json.loads(match.group())
        print(f"  ✅ Enriched {len(prospects)} prospects")
        for p in prospects:
            print(f"     • {p.get('company')} — {p.get('email')}")

        # Save
        out_path = "output/prospects/prospects.json"
        self.save(out_path, json.dumps(prospects, indent=2))
        return prospects
