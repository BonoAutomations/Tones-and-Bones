"""Alpaca brokerage integration — translates agent signals into real orders."""

from __future__ import annotations

import logging
import os
from typing import Optional

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.trading.requests import ClosePositionRequest, MarketOrderRequest

logger = logging.getLogger(__name__)


class AlpacaBroker:
    """Wraps the Alpaca Trading API to execute orders from agent signals.

    Paper trading is the default. Set paper=False (or ALPACA_PAPER=false)
    only when you are ready to trade with real money.
    """

    def __init__(
        self,
        api_key: str | None = None,
        secret_key: str | None = None,
        paper: bool = True,
    ):
        self.api_key = api_key or os.environ.get("ALPACA_API_KEY", "")
        self.secret_key = secret_key or os.environ.get("ALPACA_SECRET_KEY", "")
        if not self.api_key or not self.secret_key:
            raise ValueError(
                "Alpaca credentials missing. Set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        self.paper = paper
        self.client = TradingClient(self.api_key, self.secret_key, paper=self.paper)
        mode = "paper" if self.paper else "LIVE"
        logger.info("AlpacaBroker connected (%s)", mode)

    # ------------------------------------------------------------------
    # Account helpers
    # ------------------------------------------------------------------

    def get_equity(self) -> float:
        """Return total portfolio equity in USD."""
        return float(self.client.get_account().equity)

    def get_position_qty(self, symbol: str) -> float:
        """Return the current held quantity for symbol, or 0 if none."""
        try:
            return float(self.client.get_open_position(symbol).qty)
        except Exception:
            return 0.0

    # ------------------------------------------------------------------
    # Order execution
    # ------------------------------------------------------------------

    def execute_signal(
        self,
        ticker: str,
        signal: str,
        position_pct: float = 0.05,
        asset_type: str = "stock",
    ) -> dict | None:
        """Translate a portfolio signal into an Alpaca order.

        Args:
            ticker:       Symbol recognised by Alpaca (e.g. "AAPL", "BTC/USD").
            signal:       One of Buy / Overweight / Hold / Underweight / Sell
                          (case-insensitive). Hold is a no-op.
            position_pct: Fraction of current portfolio equity to deploy per
                          buy signal (e.g. 0.05 = 5 %). Ignored for sells.
            asset_type:   "stock" or "crypto" — controls time-in-force.

        Returns:
            Order dict on success, None when the signal is Hold or there is
            nothing to sell.
        """
        normalised = signal.strip().lower()

        if normalised in ("buy", "overweight"):
            return self._place_buy(ticker, position_pct, asset_type)
        elif normalised in ("sell", "underweight"):
            return self._place_sell(ticker)
        else:
            logger.info("Signal '%s' → no order for %s", signal, ticker)
            return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _place_buy(self, ticker: str, position_pct: float, asset_type: str) -> dict:
        equity = self.get_equity()
        notional = round(equity * position_pct, 2)
        if notional < 1.0:
            raise ValueError(
                f"Notional ${notional:.2f} is below Alpaca's $1 minimum. "
                "Increase position_pct or fund the account."
            )

        # Crypto uses GTC; stocks use DAY (market hours only).
        tif = TimeInForce.GTC if asset_type == "crypto" else TimeInForce.DAY

        req = MarketOrderRequest(
            symbol=ticker,
            notional=notional,
            side=OrderSide.BUY,
            time_in_force=tif,
        )
        order = self.client.submit_order(req)
        logger.info(
            "BUY %s — $%.2f (~%.0f%% of portfolio). Order %s accepted.",
            ticker, notional, position_pct * 100, order.id,
        )
        return _order_to_dict(order)

    def _place_sell(self, ticker: str) -> dict | None:
        qty = self.get_position_qty(ticker)
        if qty <= 0:
            logger.info("No long position in %s to sell — skipping.", ticker)
            return None

        order = self.client.close_position(ticker)
        logger.info("SELL all %s shares of %s. Order %s accepted.", qty, ticker, order.id)
        return _order_to_dict(order)


# ------------------------------------------------------------------
# Utility
# ------------------------------------------------------------------

def _order_to_dict(order) -> dict:
    def _val(v):
        return v.value if hasattr(v, "value") else str(v)

    return {
        "id": str(order.id),
        "symbol": order.symbol,
        "side": _val(order.side),
        "qty": str(order.qty) if order.qty else None,
        "notional": str(order.notional) if order.notional else None,
        "status": _val(order.status),
        "type": _val(order.order_type),
        "time_in_force": _val(order.time_in_force),
    }
