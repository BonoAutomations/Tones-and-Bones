#!/usr/bin/env python3.11
"""
WealthHub Agency Crew — main.py
Runs 7 sequential agents: SCOUT → PITCH → ONBOARD → DELIVER → REPORT → INVOICE → CLOSE
Sends a Telegram summary to @Macabe_bot on completion.

Usage:
    python3.11 main.py
    python3.11 main.py > /tmp/crew_daily.log 2>&1
"""
import sys
import os
import time
import traceback
from pathlib import Path
from dotenv import load_dotenv

# Load .env from crew directory
load_dotenv(Path(__file__).parent / ".env")

# Ensure local imports work regardless of cwd
sys.path.insert(0, str(Path(__file__).parent))

from agents import (
    ScoutAgent, PitchAgent, OnboardAgent,
    DeliverAgent, ReportAgent, InvoiceAgent, CloseAgent,
)
from tools import TelegramNotifier


def validate_env() -> list[str]:
    """Check required env vars. Returns list of missing keys."""
    required = ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"]
    return [k for k in required if not os.getenv(k)]


def main() -> int:
    print("=" * 60)
    print("  🏦 WealthHub Agency Crew — Starting Run")
    print("=" * 60)

    start = time.time()
    run_data = {}

    # ── Env validation ─────────────────────────────────────────
    missing = validate_env()
    if missing:
        print(f"\n❌ Missing required environment variables: {', '.join(missing)}")
        print("   Copy .env.example → .env and fill in your keys.")
        return 1

    # ── 1. SCOUT ────────────────────────────────────────────────
    try:
        prospects = ScoutAgent().run()
        run_data["prospects"] = prospects
    except Exception as e:
        print(f"\n❌ SCOUT failed: {e}")
        traceback.print_exc()
        return 1

    # ── 2. PITCH ────────────────────────────────────────────────
    try:
        proposals = PitchAgent().run(prospects)
        run_data["proposals_written"] = len(proposals)
    except Exception as e:
        print(f"\n❌ PITCH failed: {e}")
        traceback.print_exc()
        proposals = []
        run_data["proposals_written"] = 0

    # ── 3. ONBOARD ──────────────────────────────────────────────
    try:
        OnboardAgent().run(prospects)
    except Exception as e:
        print(f"\n⚠️  ONBOARD failed (non-fatal): {e}")

    # ── 4. DELIVER ──────────────────────────────────────────────
    try:
        DeliverAgent().run(prospects)
    except Exception as e:
        print(f"\n⚠️  DELIVER failed (non-fatal): {e}")

    # ── 5. REPORT ───────────────────────────────────────────────
    try:
        ReportAgent().run(prospects, proposals)
    except Exception as e:
        print(f"\n⚠️  REPORT failed (non-fatal): {e}")

    # ── 6. INVOICE ──────────────────────────────────────────────
    try:
        invoice_sent = InvoiceAgent().run()
        run_data["invoice_sent"] = invoice_sent
    except Exception as e:
        print(f"\n⚠️  INVOICE failed (non-fatal): {e}")
        run_data["invoice_sent"] = False

    # ── 7. CLOSE ────────────────────────────────────────────────
    try:
        sequences, instantly_results = CloseAgent().run(prospects)
        run_data["sequences"] = sequences
        run_data["instantly_results"] = instantly_results
    except Exception as e:
        print(f"\n⚠️  CLOSE failed (non-fatal): {e}")
        traceback.print_exc()
        run_data["instantly_results"] = []

    # ── Summary ─────────────────────────────────────────────────
    duration = time.time() - start
    run_data["duration_seconds"] = duration

    print("\n" + "=" * 60)
    print("  ✅ WealthHub Agency Crew — Run Complete")
    print(f"  ⏱  Duration: {duration:.1f}s")
    print(f"  🔍 Prospects: {len(run_data.get('prospects', []))}")
    print(f"  📄 Proposals: {run_data.get('proposals_written', 0)}")
    instantly_results = run_data.get("instantly_results", [])
    added = sum(1 for r in instantly_results if r.get("status") == "added")
    print(f"  📤 Pushed to Instantly: {added}/{len(run_data.get('prospects', []))}")
    print("=" * 60)

    # ── Telegram summary ────────────────────────────────────────
    try:
        TelegramNotifier().send_summary(run_data)
        print("\n📱 Telegram summary sent to @Macabe_bot")
    except Exception as e:
        print(f"\n⚠️  Telegram notification failed: {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
