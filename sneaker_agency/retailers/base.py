"""Abstract base class for all retailer adapters."""
import asyncio
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

from playwright.async_api import BrowserContext, Page

from sneaker_agency.profiles.manager import Profile
from sneaker_agency.proxies.manager import Proxy
from sneaker_agency.utils.logger import get_logger

log = get_logger("retailer.base")


@dataclass
class TaskConfig:
    id: str
    retailer: str
    product_url: str
    sizes: List[str]
    quantity: int
    profile_id: str
    mode: str                    # "safe" | "fast"
    style_code: Optional[str] = None
    variant_ids: Optional[List[str]] = None


@dataclass
class CheckoutOutcome:
    success: bool
    order_number: Optional[str]
    message: str
    size_purchased: Optional[str] = None
    price: Optional[str] = None
    product_name: Optional[str] = None
    image_url: Optional[str] = None


class BaseRetailer(ABC):
    name: str = "base"

    def __init__(
        self,
        context: BrowserContext,
        task: TaskConfig,
        profile: Profile,
        proxy: Optional[Proxy],
        safe_delay: tuple = (300, 900),
    ):
        self.context = context
        self.task = task
        self.profile = profile
        self.proxy = proxy
        self._safe_delay_min, self._safe_delay_max = safe_delay

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _delay(self, ms_min: int = None, ms_max: int = None) -> None:
        if self.task.mode == "fast":
            await asyncio.sleep(0.05)
            return
        lo = ms_min or self._safe_delay_min
        hi = ms_max or self._safe_delay_max
        await asyncio.sleep(random.randint(lo, hi) / 1000)

    async def _new_page(self) -> Page:
        page = await self.context.new_page()
        # Mask automation fingerprint
        await page.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
        )
        return page

    async def _safe_fill(self, page: Page, selector: str, value: str) -> None:
        await page.wait_for_selector(selector, timeout=15_000)
        await page.click(selector)
        await self._delay(80, 200)
        await page.fill(selector, value)
        await self._delay(50, 150)

    async def _safe_click(self, page: Page, selector: str) -> None:
        await page.wait_for_selector(selector, timeout=15_000)
        await self._delay()
        await page.click(selector)

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    async def run(self) -> CheckoutOutcome:
        """Execute the full checkout flow. Return a CheckoutOutcome."""
        ...

    @abstractmethod
    async def get_available_sizes(self) -> List[str]:
        """Return currently available sizes for the product."""
        ...
