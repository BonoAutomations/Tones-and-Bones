import os
import json
from .base import BaseAgent


class PitchAgent(BaseAgent):
    """
    PITCH — Writes 2 personalized proposals for the top 2 prospects.
    Each proposal is a full-page document tailored to the prospect's pain point.
    """

    def run(self, prospects: list[dict]) -> list[dict]:
        print("\n📄 PITCH: Writing proposals...")
        top_two = prospects[:2]
        proposals = []

        system = (
            "You are a senior business development writer at WealthHub.llc.\n"
            "Write a compelling, concise 1-page proposal for a wealth management firm.\n"
            "Structure:\n"
            "1. Executive Summary (2 sentences — lead with ROI)\n"
            "2. Their Challenge (name their specific pain point)\n"
            "3. Our Solution (WealthHub's AI automation approach)\n"
            "4. Deliverables (3–5 bullet points, specific and tangible)\n"
            "5. Investment (monthly retainer, value justification)\n"
            "6. Next Step (single clear CTA)\n"
            "Tone: confident, data-driven, no fluff. Address the decision-maker by name."
        )

        for p in top_two:
            prompt = (
                f"Write a proposal for:\n"
                f"Company: {p.get('company')}\n"
                f"Contact: {p.get('first_name')} {p.get('last_name')}, {p.get('title')}\n"
                f"Pain Point: {p.get('pain_point')}\n"
                f"Why Now: {p.get('why_now')}\n"
                f"Service: {self.service}\n"
                f"Monthly Investment: ${self.price}/mo\n\n"
                "Write the full proposal in clean Markdown."
            )
            content = self.ask(system, prompt, max_tokens=1200)
            proposal = {
                "company": p.get("company"),
                "contact": f"{p.get('first_name')} {p.get('last_name')}",
                "email": p.get("email"),
                "content": content,
            }
            proposals.append(proposal)

            # Save individual proposal
            fname = p.get("company", "proposal").replace(" ", "_").lower()
            self.save(f"output/proposals/{fname}_proposal.md", content)
            print(f"  ✅ Proposal written for {p.get('company')}")

        return proposals
