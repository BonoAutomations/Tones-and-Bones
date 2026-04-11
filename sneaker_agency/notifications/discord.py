"""Discord webhook notifications for task outcomes."""
import asyncio
from dataclasses import dataclass
from typing import Optional

import httpx

from sneaker_agency.utils.logger import get_logger

log = get_logger("discord")


@dataclass
class CheckoutResult:
    task_id: str
    retailer: str
    product_name: str
    size: str
    price: str
    order_number: Optional[str]
    success: bool
    message: str
    image_url: Optional[str] = None


class DiscordNotifier:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    def _success_embed(self, result: CheckoutResult) -> dict:
        return {
            "embeds": [
                {
                    "title": "Checkout Success",
                    "color": 0x00FF87,
                    "fields": [
                        {"name": "Product", "value": result.product_name, "inline": True},
                        {"name": "Retailer", "value": result.retailer.upper(), "inline": True},
                        {"name": "Size", "value": result.size, "inline": True},
                        {"name": "Price", "value": result.price, "inline": True},
                        {"name": "Order #", "value": result.order_number or "N/A", "inline": True},
                        {"name": "Task", "value": result.task_id, "inline": True},
                    ],
                    "thumbnail": {"url": result.image_url} if result.image_url else {},
                    "footer": {"text": "Tones & Bones Agency"},
                }
            ]
        }

    def _failure_embed(self, result: CheckoutResult) -> dict:
        return {
            "embeds": [
                {
                    "title": "Checkout Failed",
                    "color": 0xFF4444,
                    "fields": [
                        {"name": "Product", "value": result.product_name, "inline": True},
                        {"name": "Retailer", "value": result.retailer.upper(), "inline": True},
                        {"name": "Size", "value": result.size, "inline": True},
                        {"name": "Reason", "value": result.message, "inline": False},
                        {"name": "Task", "value": result.task_id, "inline": True},
                    ],
                    "footer": {"text": "Tones & Bones Agency"},
                }
            ]
        }

    def _restock_embed(self, retailer: str, product_name: str, sizes: list, url: str) -> dict:
        return {
            "embeds": [
                {
                    "title": "Restock / New Drop Detected",
                    "color": 0xFFAA00,
                    "fields": [
                        {"name": "Product", "value": product_name, "inline": True},
                        {"name": "Retailer", "value": retailer.upper(), "inline": True},
                        {"name": "Sizes", "value": ", ".join(sizes), "inline": False},
                        {"name": "URL", "value": url, "inline": False},
                    ],
                    "footer": {"text": "Tones & Bones Agency"},
                }
            ]
        }

    async def send(self, payload: dict) -> bool:
        if not self.webhook_url or self.webhook_url == "YOUR_DISCORD_WEBHOOK_URL":
            log.debug("Discord webhook not configured — skipping notification.")
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(self.webhook_url, json=payload)
                if r.status_code in (200, 204):
                    return True
                log.warning("Discord webhook returned %d", r.status_code)
                return False
        except Exception as exc:
            log.error("Discord notification failed: %s", exc)
            return False

    async def notify_checkout(self, result: CheckoutResult) -> None:
        payload = self._success_embed(result) if result.success else self._failure_embed(result)
        await self.send(payload)

    async def notify_restock(self, retailer: str, product_name: str, sizes: list, url: str) -> None:
        await self.send(self._restock_embed(retailer, product_name, sizes, url))
