"""Release calendar monitor.

Polls retailer APIs / pages for upcoming / live drops that match the user's
keyword watchlist.  When a match is found it fires a callback so the bot
engine can spin up checkout tasks automatically.
"""
import asyncio
import re
from typing import Callable, List, Optional

import httpx

from sneaker_agency.utils.logger import get_logger

log = get_logger("monitor")

# ── Public release-calendar endpoints ────────────────────────────────────────

_NIKE_LAUNCHES = "https://api.nike.com/launch/upcoming/v2?country=US&language=en"
_ADIDAS_LAUNCHES = "https://www.adidas.com/api/products/upcoming?sitePath=us"
_SNEAKERNEWS_FEED = "https://sneakernews.com/wp-json/wp/v2/posts?per_page=20&_fields=title,link,date"


class ReleaseMonitor:
    """
    Watches Nike, Adidas, and SneakerNews release calendars.
    Calls ``on_drop_detected(retailer, product_name, url, sizes)`` when a keyword match fires.
    """

    def __init__(
        self,
        keywords: List[str],
        retailers: List[str],
        check_interval: int,
        on_drop_detected: Callable,
        proxy: Optional[str] = None,
    ):
        self.keywords = [k.lower() for k in keywords]
        self.retailers = [r.lower() for r in retailers]
        self.check_interval = check_interval
        self.on_drop_detected = on_drop_detected
        self._seen: set = set()
        self._proxy = proxy
        self._running = False

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        log.info("Release monitor started. Keywords: %s | Interval: %ds", self.keywords, self.check_interval)
        while self._running:
            await asyncio.gather(
                self._check_nike() if "nike" in self.retailers else asyncio.sleep(0),
                self._check_adidas() if "adidas" in self.retailers else asyncio.sleep(0),
                self._check_sneakernews() if any(r in ("footlocker", "shopify") for r in self.retailers) else asyncio.sleep(0),
            )
            await asyncio.sleep(self.check_interval)

    def stop(self) -> None:
        self._running = False
        log.info("Release monitor stopped.")

    # ── Nike SNKRS API ────────────────────────────────────────────────────────

    async def _check_nike(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=15, proxies=self._proxy_dict()) as client:
                r = await client.get(
                    _NIKE_LAUNCHES,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Accept": "application/json",
                    },
                )
                if r.status_code != 200:
                    return
                data = r.json()
                objects = data.get("objects", [])
                for obj in objects:
                    title = obj.get("copy", {}).get("title", "")
                    url = obj.get("publishedContent", {}).get("nodes", [{}])[0].get("nodes", [{}])[0].get("properties", {}).get("seoSlug", "")
                    if url:
                        url = f"https://www.nike.com/launch/t/{url}"
                    style_code = obj.get("merchProduct", {}).get("styleColor", "")
                    self._evaluate("nike", title, style_code, url, [])
        except Exception as e:
            log.debug("Nike monitor error: %s", e)

    # ── Adidas ────────────────────────────────────────────────────────────────

    async def _check_adidas(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=15, proxies=self._proxy_dict()) as client:
                r = await client.get(
                    _ADIDAS_LAUNCHES,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if r.status_code != 200:
                    return
                data = r.json()
                for item in data.get("items", []):
                    name = item.get("name", "")
                    model_number = item.get("modelNumber", "")
                    url = f"https://www.adidas.com/us/{item.get('url', '')}"
                    self._evaluate("adidas", name, model_number, url, [])
        except Exception as e:
            log.debug("Adidas monitor error: %s", e)

    # ── SneakerNews RSS (catches Foot Locker, boutique drops) ─────────────────

    async def _check_sneakernews(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=15, proxies=self._proxy_dict()) as client:
                r = await client.get(
                    _SNEAKERNEWS_FEED,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if r.status_code != 200:
                    return
                for post in r.json():
                    title = post.get("title", {}).get("rendered", "")
                    link = post.get("link", "")
                    self._evaluate("sneakernews", title, "", link, [])
        except Exception as e:
            log.debug("SneakerNews monitor error: %s", e)

    # ── Keyword matching ──────────────────────────────────────────────────────

    def _evaluate(self, retailer: str, name: str, style_code: str, url: str, sizes: list) -> None:
        key = f"{retailer}::{url or name}"
        if key in self._seen:
            return
        name_lower = name.lower()
        sc_lower = style_code.lower()
        for kw in self.keywords:
            if kw in name_lower or (style_code and kw in sc_lower):
                self._seen.add(key)
                log.info("DROP DETECTED  [%s] %s  %s", retailer.upper(), name, url)
                asyncio.ensure_future(self.on_drop_detected(retailer, name, url, sizes))
                break

    def _proxy_dict(self) -> Optional[dict]:
        if self._proxy:
            return {"http://": self._proxy, "https://": self._proxy}
        return None
