import os
import json
from .base import BaseAgent
from tools import InstantlyPusher


class CloseAgent(BaseAgent):
    """
    CLOSE — Writes 3-touch follow-up sequences for all 5 prospects
    and pushes them to the Instantly 'Loki's Leads' campaign.
    """

    def run(self, prospects: list[dict]) -> tuple[list[dict], list[dict]]:
        print("\n🎯 CLOSE: Writing sequences & pushing to Instantly...")

        sequences = []
        for p in prospects:
            seq = self._write_sequence(p)
            sequences.append({"company": p.get("company"), "sequence": seq})
            fname = p.get("company", "prospect").replace(" ", "_").lower()
            self.save(f"output/sequences/{fname}_sequence.md", seq)
            print(f"  ✅ Sequence written for {p.get('company')}")

        # Push to Instantly
        instantly_results = self._push_to_instantly(prospects)
        return sequences, instantly_results

    def _write_sequence(self, prospect: dict) -> str:
        system = (
            "You are a world-class cold email copywriter for WealthHub.llc.\n"
            "Write a 3-touch email sequence (Touch 1 → Touch 2 day 3 → Touch 3 day 7).\n"
            "Rules:\n"
            "- Subject lines: under 50 chars, no spam words, no 'just checking in'\n"
            "- Touch 1: cold intro, lead with their pain point, one CTA\n"
            "- Touch 2: add value (insight, stat, or case study), soft bump\n"
            "- Touch 3: breakup email — short, direct, offers easy out\n"
            "- No attachments mentioned, no generic phrases\n"
            "- Each email: Subject, Body (3–5 sentences max), Signature\n"
            "Format each touch clearly. Use the prospect's first name."
        )
        prompt = (
            f"Prospect: {prospect.get('first_name')} {prospect.get('last_name')}, "
            f"{prospect.get('title')} at {prospect.get('company')}\n"
            f"Pain Point: {prospect.get('pain_point')}\n"
            f"Why Now: {prospect.get('why_now')}\n"
            f"Our Service: {self.service}\n"
            f"Our Price: ${self.price}/mo\n\n"
            "Write the 3-touch sequence."
        )
        return self.ask(system, prompt, max_tokens=1200)

    def _push_to_instantly(self, prospects: list[dict]) -> list[dict]:
        print("  📤 Pushing prospects to Instantly 'Loki's Leads' campaign...")
        try:
            pusher = InstantlyPusher()
            results = pusher.push_prospects(prospects)
            added = sum(1 for r in results if r.get("status") == "added")
            print(f"  ✅ {added}/{len(prospects)} prospects added to Instantly")
            return results
        except ValueError as e:
            print(f"  ⚠️  Instantly config missing: {e}")
            print("  ℹ️  Set INSTANTLY_API_KEY and INSTANTLY_CAMPAIGN_ID to enable")
            return [{"prospect": p.get("company"), "status": "skipped", "error": str(e)} for p in prospects]
        except Exception as e:
            print(f"  ⚠️  Instantly push failed: {e}")
            return [{"prospect": p.get("company"), "status": "error", "error": str(e)} for p in prospects]
