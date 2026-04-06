import os
import requests


class TelegramNotifier:
    """Send messages to a Telegram chat via Bot API."""

    BASE_URL = "https://api.telegram.org"

    def __init__(self):
        self.token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = os.getenv("TELEGRAM_CHAT_ID")
        if not self.token:
            raise ValueError("TELEGRAM_BOT_TOKEN not set")
        if not self.chat_id:
            raise ValueError("TELEGRAM_CHAT_ID not set")

    def send(self, message: str, parse_mode: str = "Markdown") -> dict:
        """Send a message to the configured chat."""
        url = f"{self.BASE_URL}/bot{self.token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "parse_mode": parse_mode,
        }
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def send_summary(self, run_data: dict) -> None:
        """Send a formatted WealthHub crew run summary."""
        prospects = run_data.get("prospects", [])
        proposals = run_data.get("proposals_written", 0)
        instantly_results = run_data.get("instantly_results", [])
        invoice_sent = run_data.get("invoice_sent", False)
        duration = run_data.get("duration_seconds", 0)

        added = sum(1 for r in instantly_results if r.get("status") == "added")
        failed = sum(1 for r in instantly_results if r.get("status") == "error")

        prospect_lines = "\n".join(
            f"  • {p.get('company', 'Unknown')} — {p.get('email', 'no email')}"
            for p in prospects[:5]
        )

        msg = (
            f"🏦 *WealthHub Agency Crew — Run Complete*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"⏱ Duration: {duration:.0f}s\n\n"
            f"🔍 *SCOUT* — {len(prospects)} prospects found\n"
            f"{prospect_lines}\n\n"
            f"📄 *PITCH* — {proposals} proposals written\n"
            f"🎁 *ONBOARD* — Package created\n"
            f"⚙️ *DELIVER* — Automation workflow designed\n"
            f"📊 *REPORT* — Weekly report generated\n"
            f"💰 *INVOICE* — {'Sent ✅' if invoice_sent else 'Skipped ⚠️'}\n"
            f"🎯 *CLOSE* — {added}/{len(prospects)} pushed to Instantly Loki's Leads"
            + (f" ({failed} failed)" if failed else "")
            + f"\n\n✅ All agents complete."
        )
        self.send(msg)
