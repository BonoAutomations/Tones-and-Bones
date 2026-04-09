import os
from .base import BaseAgent


class DeliverAgent(BaseAgent):
    """
    DELIVER — Designs the automation workflow for client delivery.
    Produces a technical workflow document with trigger → action → output chains.
    """

    def run(self, prospects: list[dict]) -> str:
        print("\n⚙️  DELIVER: Designing automation workflow...")

        system = (
            "You are WealthHub.llc's lead automation architect.\n"
            "Design a complete AI automation workflow for a wealth management firm's client acquisition pipeline.\n"
            "Use this structure for each workflow:\n"
            "  TRIGGER → [condition] → ACTION → OUTPUT → NOTIFICATION\n\n"
            "Include 5 automation workflows covering:\n"
            "1. Prospect Discovery & Enrichment (daily automated search + CRM sync)\n"
            "2. Personalized Email Outreach Sequence (3-touch with AI personalization)\n"
            "3. Website Lead Capture → CRM → Nurture Sequence\n"
            "4. Client Retention Alert (AUM change / engagement drop detection)\n"
            "5. Weekly Performance Dashboard Delivery\n\n"
            "For each workflow specify:\n"
            "- Tools/platforms used (Be specific: Apollo, HubSpot, Instantly, Make.com, etc.)\n"
            "- Data flow diagram (text-based)\n"
            "- Setup time estimate\n"
            "- Expected outcome/metric\n"
            "Format in clean Markdown."
        )
        prompt = (
            f"Design automation workflows for {prospects[0].get('company', 'a wealth management firm')} "
            f"using {self.service}."
        )
        workflow = self.ask(system, prompt, max_tokens=2500)
        self.save("output/workflows/automation_workflow.md", workflow)
        print("  ✅ Automation workflow designed")
        return workflow
