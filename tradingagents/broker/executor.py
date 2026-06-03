"""TradeExecutor — runs TradingAgentsGraph analysis and routes the signal to a broker."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from tradingagents.broker.alpaca_broker import AlpacaBroker

logger = logging.getLogger(__name__)


class TradeExecutor:
    """One-stop shop: analyse a ticker with the agent graph, then execute via Alpaca.

    Usage (paper trading, default)::

        executor = TradeExecutor.from_env()
        result = executor.run("AAPL")
        print(result["signal"], result["order"])

    Set ``dry_run=True`` to analyse without placing any orders.
    """

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        broker: AlpacaBroker | None = None,
    ):
        from tradingagents.default_config import DEFAULT_CONFIG

        self.config = config or DEFAULT_CONFIG.copy()
        self.broker = broker

        # Lazy-import to avoid circular imports at module load time.
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        self.graph = TradingAgentsGraph(debug=False, config=self.config)

    @classmethod
    def from_env(cls, config: dict[str, Any] | None = None) -> "TradeExecutor":
        """Build an executor with Alpaca credentials read from environment variables.

        Environment variables used:
            ALPACA_API_KEY      — required
            ALPACA_SECRET_KEY   — required
            ALPACA_PAPER        — "true" (default) or "false" for live trading
        """
        paper_raw = os.environ.get("ALPACA_PAPER", "true").strip().lower()
        paper = paper_raw not in ("false", "0", "no")

        broker = AlpacaBroker(paper=paper)
        return cls(config=config, broker=broker)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def run(
        self,
        ticker: str,
        trade_date: str | None = None,
        position_pct: float | None = None,
        asset_type: str = "stock",
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Analyse ``ticker`` and optionally execute the resulting signal.

        Args:
            ticker:       Ticker symbol, e.g. "AAPL" or "BTC/USD".
            trade_date:   Analysis date as "YYYY-MM-DD". Defaults to today.
            position_pct: Portfolio fraction to deploy on a Buy signal.
                          Falls back to ``alpaca_position_pct`` in config (5 %).
            asset_type:   "stock" (default) or "crypto".
            dry_run:      Analyse but skip order submission.

        Returns:
            dict with keys: ticker, trade_date, signal, final_decision, order.
        """
        if trade_date is None:
            trade_date = datetime.today().strftime("%Y-%m-%d")

        if position_pct is None:
            position_pct = float(self.config.get("alpaca_position_pct", 0.05))

        logger.info("Running analysis: %s  date=%s  asset_type=%s", ticker, trade_date, asset_type)
        state, signal = self.graph.propagate(ticker, trade_date, asset_type=asset_type)

        result: dict[str, Any] = {
            "ticker": ticker,
            "trade_date": trade_date,
            "signal": signal,
            "final_decision": state.get("final_trade_decision", ""),
            "order": None,
        }

        if dry_run:
            logger.info("[dry-run] Signal=%s  no order placed for %s", signal, ticker)
            return result

        if self.broker is None:
            logger.info("No broker configured — signal=%s  skipping order for %s", signal, ticker)
            return result

        order = self.broker.execute_signal(ticker, signal, position_pct, asset_type)
        result["order"] = order
        return result
