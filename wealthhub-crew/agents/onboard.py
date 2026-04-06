import os
from .base import BaseAgent


class OnboardAgent(BaseAgent):
    """
    ONBOARD — Creates a complete client onboarding package:
    welcome letter, kickoff checklist, access request form, timeline.
    """

    def run(self, prospects: list[dict]) -> str:
        print("\n🎁 ONBOARD: Creating onboarding package...")
        # Use first prospect as the "new client"
        client = prospects[0] if prospects else {}

        system = (
            "You are WealthHub.llc's client success manager.\n"
            "Create a complete onboarding package for a new wealth management client.\n"
            "Include:\n"
            "1. Welcome Letter (warm, professional, signed by 'The WealthHub Team')\n"
            "2. Kickoff Checklist (10 items: what WE need from them + what THEY get from us)\n"
            "3. Tech Access Request (list of systems/credentials needed: CRM, email, website, social)\n"
            "4. Week-by-Week Timeline (Weeks 1–4: specific milestones)\n"
            "5. Communication Protocol (Slack channel, weekly calls, escalation path)\n"
            "Format in clean Markdown. Professional and thorough."
        )
        prompt = (
            f"New client: {client.get('company', 'a wealth management firm')}\n"
            f"Primary contact: {client.get('first_name', '')} {client.get('last_name', '')}\n"
            f"Service: {self.service}\n"
            f"Monthly retainer: ${self.price}/mo\n\n"
            "Create the full onboarding package."
        )
        package = self.ask(system, prompt, max_tokens=2000)
        self.save("output/onboarding/onboarding_package.md", package)
        print("  ✅ Onboarding package created")
        return package
