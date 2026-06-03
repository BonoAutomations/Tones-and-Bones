"""trade.py — analyse a ticker and execute the signal via Alpaca.

Quick start
-----------
1. Copy .env.example to .env and fill in your API keys:
      ANTHROPIC_API_KEY / OPENAI_API_KEY   (for the LLM)
      ALPACA_API_KEY + ALPACA_SECRET_KEY   (free at alpaca.markets)
      ALPACA_PAPER=true                    (paper trading — safe default)

2. Run:
      python trade.py AAPL
      python trade.py AAPL --date 2024-05-10 --position-pct 0.03
      python trade.py AAPL --dry-run          # analyse only, no order
      python trade.py BTC/USD --asset crypto  # crypto support

Signal mapping
--------------
  Buy / Overweight  → market buy  (~position_pct % of portfolio)
  Hold              → no order
  Sell / Underweight → close existing position (no short selling)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger("trade")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run TradingAgents analysis and execute via Alpaca",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("ticker", help="Ticker symbol, e.g. AAPL or BTC/USD")
    parser.add_argument(
        "--date",
        default=None,
        help="Analysis date YYYY-MM-DD (default: today)",
    )
    parser.add_argument(
        "--position-pct",
        type=float,
        default=None,
        help="Portfolio fraction to deploy on a Buy signal, e.g. 0.05 for 5%% (default: from config)",
    )
    parser.add_argument(
        "--asset",
        choices=["stock", "crypto"],
        default="stock",
        help="Asset type (default: stock)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyse without placing any orders",
    )
    parser.add_argument(
        "--no-broker",
        action="store_true",
        help="Skip broker entirely (analysis only, no Alpaca connection required)",
    )
    args = parser.parse_args()

    trade_date = args.date or datetime.today().strftime("%Y-%m-%d")

    # ----------------------------------------------------------------
    # Build executor
    # ----------------------------------------------------------------
    from tradingagents.default_config import DEFAULT_CONFIG
    config = DEFAULT_CONFIG.copy()

    if args.no_broker or args.dry_run:
        from tradingagents.broker.executor import TradeExecutor
        executor = TradeExecutor(config=config, broker=None)
    else:
        alpaca_key = os.environ.get("ALPACA_API_KEY", "")
        alpaca_secret = os.environ.get("ALPACA_SECRET_KEY", "")
        if not alpaca_key or not alpaca_secret:
            logger.warning(
                "ALPACA_API_KEY / ALPACA_SECRET_KEY not set — running in analysis-only mode. "
                "Add them to your .env file to enable order execution."
            )
            from tradingagents.broker.executor import TradeExecutor
            executor = TradeExecutor(config=config, broker=None)
        else:
            from tradingagents.broker.executor import TradeExecutor
            executor = TradeExecutor.from_env(config=config)

    # ----------------------------------------------------------------
    # Run
    # ----------------------------------------------------------------
    logger.info("=" * 60)
    logger.info("Ticker      : %s", args.ticker)
    logger.info("Date        : %s", trade_date)
    logger.info("Asset type  : %s", args.asset)
    logger.info("Dry run     : %s", args.dry_run or args.no_broker)
    logger.info("=" * 60)

    result = executor.run(
        ticker=args.ticker,
        trade_date=trade_date,
        position_pct=args.position_pct,
        asset_type=args.asset,
        dry_run=args.dry_run,
    )

    # ----------------------------------------------------------------
    # Print summary
    # ----------------------------------------------------------------
    print("\n" + "=" * 60)
    print(f"  TICKER  : {result['ticker']}")
    print(f"  DATE    : {result['trade_date']}")
    print(f"  SIGNAL  : {result['signal']}")
    print("-" * 60)
    if result["order"]:
        print("  ORDER PLACED:")
        print(json.dumps(result["order"], indent=4))
    else:
        print("  No order placed.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
