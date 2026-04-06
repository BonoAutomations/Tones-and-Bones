import os
from datetime import date, timedelta
from .base import BaseAgent


class ReportAgent(BaseAgent):
    """
    REPORT — Generates a weekly performance report summarizing agency activity,
    pipeline value, outreach metrics, and next-week priorities.
    """

    def run(self, prospects: list[dict], proposals: list[dict]) -> str:
        print("\n📊 REPORT: Generating weekly report...")

        week_end = date.today()
        week_start = week_end - timedelta(days=6)
        pipeline_value = len(prospects) * int(self.price) * 12  # annual value

        system = (
            "You are WealthHub.llc's agency director writing the weekly internal performance report.\n"
            "Format:\n"
            "# Weekly Report — [Date Range]\n"
            "## Executive Summary (3 bullet points)\n"
            "## Pipeline Activity\n"
            "## Outreach Metrics\n"
            "## Proposals & Deals\n"
            "## This Week's Wins\n"
            "## Blockers & Risks\n"
            "## Next Week Priorities (top 5)\n"
            "## KPIs Dashboard (table: Metric | Target | Actual | Status)\n\n"
            "Be specific with numbers. Use emoji sparingly for scannability."
        )

        prospect_summary = "\n".join(
            f"- {p.get('company')} ({p.get('email')}) — Pain: {p.get('pain_point', 'N/A')}"
            for p in prospects
        )
        proposal_summary = "\n".join(
            f"- {p.get('company')} proposal sent to {p.get('contact')}"
            for p in proposals
        )

        prompt = (
            f"Week: {week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}\n\n"
            f"Prospects found this week ({len(prospects)}):\n{prospect_summary}\n\n"
            f"Proposals written ({len(proposals)}):\n{proposal_summary}\n\n"
            f"Estimated pipeline value: ${pipeline_value:,} ARR\n"
            f"Service: {self.service}\n\n"
            "Generate the full weekly report."
        )

        report = self.ask(system, prompt, max_tokens=2000)
        self.save(f"output/reports/weekly_report_{week_end.isoformat()}.md", report)
        print("  ✅ Weekly report generated")
        return report
