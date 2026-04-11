"""Proxy pool manager with health-checking and rotation."""
import asyncio
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import httpx

from sneaker_agency.utils.logger import get_logger

log = get_logger("proxies")


@dataclass
class Proxy:
    url: str
    healthy: bool = True
    fail_count: int = 0
    success_count: int = 0

    @property
    def as_dict(self) -> Dict[str, str]:
        return {"http://": self.url, "https://": self.url}

    @property
    def playwright_server(self) -> str:
        """Return server string for Playwright proxy config."""
        return self.url


class ProxyManager:
    def __init__(self, proxy_urls: List[str], test_url: str = "https://www.nike.com"):
        self._pool: List[Proxy] = [Proxy(url=u) for u in proxy_urls]
        self._test_url = test_url
        self._lock = asyncio.Lock()

    # ── Pool management ───────────────────────────────────────────────────────

    @property
    def available(self) -> List[Proxy]:
        return [p for p in self._pool if p.healthy]

    def get(self) -> Optional[Proxy]:
        """Return a random healthy proxy, or None if pool is empty / disabled."""
        healthy = self.available
        if not healthy:
            return None
        return random.choice(healthy)

    def mark_dead(self, proxy: Proxy) -> None:
        proxy.fail_count += 1
        if proxy.fail_count >= 3:
            proxy.healthy = False
            log.warning("Proxy marked dead after 3 failures: %s", proxy.url)

    def mark_ok(self, proxy: Proxy) -> None:
        proxy.success_count += 1
        proxy.fail_count = 0
        proxy.healthy = True

    # ── Health check ──────────────────────────────────────────────────────────

    async def _test_proxy(self, proxy: Proxy) -> bool:
        try:
            async with httpx.AsyncClient(proxies=proxy.as_dict, timeout=10) as client:
                r = await client.get(self._test_url)
                ok = r.status_code < 400
                if ok:
                    self.mark_ok(proxy)
                else:
                    self.mark_dead(proxy)
                return ok
        except Exception as exc:
            log.debug("Proxy test failed (%s): %s", proxy.url, exc)
            self.mark_dead(proxy)
            return False

    async def health_check_all(self) -> None:
        log.info("Running proxy health check on %d proxies…", len(self._pool))
        results = await asyncio.gather(*[self._test_proxy(p) for p in self._pool])
        alive = sum(results)
        log.info("Proxy health check complete — %d/%d alive.", alive, len(self._pool))

    async def revive_dead(self) -> None:
        """Reset fail counts and re-test dead proxies."""
        dead = [p for p in self._pool if not p.healthy]
        for p in dead:
            p.fail_count = 0
            p.healthy = True
        if dead:
            log.info("Reviving %d dead proxies for retest…", len(dead))
            await self.health_check_all()
