"""Main bot engine — orchestrates tasks, browser contexts, proxies, and results."""
import asyncio
import random
from typing import Dict, List, Optional

from playwright.async_api import async_playwright, Browser, BrowserContext

from sneaker_agency.core.monitor import ReleaseMonitor
from sneaker_agency.notifications.discord import CheckoutResult, DiscordNotifier
from sneaker_agency.profiles.manager import Profile, ProfileManager
from sneaker_agency.proxies.manager import Proxy, ProxyManager
from sneaker_agency.retailers.base import CheckoutOutcome, TaskConfig
from sneaker_agency.retailers.nike import NikeRetailer
from sneaker_agency.retailers.adidas import AdidasRetailer
from sneaker_agency.retailers.footlocker import FootLockerRetailer
from sneaker_agency.retailers.shopify import ShopifyRetailer
from sneaker_agency.utils.logger import get_logger

log = get_logger("bot")

_RETAILER_MAP = {
    "nike": NikeRetailer,
    "adidas": AdidasRetailer,
    "footlocker": FootLockerRetailer,
    "shopify": ShopifyRetailer,
}


class SneakerAgency:
    def __init__(self, config: dict):
        self.config = config
        self._bot_cfg = config.get("bot", {})
        self._notif_cfg = config.get("notifications", {})
        self._proxy_cfg = config.get("proxies", {})
        self._monitor_cfg = config.get("monitor", {})

        self.profile_manager = ProfileManager(config.get("profiles", []))
        self.proxy_manager = ProxyManager(
            proxy_urls=self._proxy_cfg.get("list", []),
            test_url=self._proxy_cfg.get("test_url", "https://www.nike.com"),
        ) if self._proxy_cfg.get("enabled") else None

        self.notifier = DiscordNotifier(
            webhook_url=self._notif_cfg.get("discord_webhook", "")
        )

        self._semaphore = asyncio.Semaphore(self._bot_cfg.get("max_concurrent_tasks", 3))
        self._browser: Optional[Browser] = None
        self._playwright = None
        self._monitor: Optional[ReleaseMonitor] = None
        self._task_queue: asyncio.Queue = asyncio.Queue()
        self._results: List[dict] = []

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self, tasks: List[dict]) -> None:
        async with async_playwright() as pw:
            self._playwright = pw
            browser_type = getattr(pw, self._bot_cfg.get("browser", "chromium"))
            self._browser = await browser_type.launch(
                headless=self._bot_cfg.get("headless", True),
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                ],
            )
            log.info("Browser launched (%s).", self._bot_cfg.get("browser", "chromium"))

            # Health-check proxies
            if self.proxy_manager and self._proxy_cfg.get("enabled"):
                await self.proxy_manager.health_check_all()

            # Start release monitor if enabled
            if self._monitor_cfg.get("enabled"):
                self._monitor = ReleaseMonitor(
                    keywords=self._monitor_cfg.get("keywords", []),
                    retailers=self._monitor_cfg.get("retailers", []),
                    check_interval=self._monitor_cfg.get("check_interval_seconds", 60),
                    on_drop_detected=self._on_drop_detected,
                    proxy=self.proxy_manager.get().url if self.proxy_manager else None,
                )
                asyncio.ensure_future(self._monitor.start())

            # Run configured tasks
            enabled = [t for t in tasks if t.get("enabled", True)]
            log.info("Running %d enabled task(s)…", len(enabled))
            await asyncio.gather(*[self._run_task(t) for t in enabled])

            if self._browser:
                await self._browser.close()

    # ── Task runner ───────────────────────────────────────────────────────────

    async def _run_task(self, task_dict: dict, retries: int = None) -> None:
        task = TaskConfig(
            id=task_dict["id"],
            retailer=task_dict["retailer"].lower(),
            product_url=task_dict["product_url"],
            sizes=task_dict.get("sizes", []),
            quantity=task_dict.get("quantity", 1),
            profile_id=task_dict.get("profile_id", "primary"),
            mode=task_dict.get("mode", "safe"),
            style_code=task_dict.get("style_code"),
            variant_ids=task_dict.get("variant_ids"),
        )

        profile = self.profile_manager.get(task.profile_id)
        if not profile:
            log.error("[%s] Profile '%s' not found. Skipping.", task.id, task.profile_id)
            return

        max_retries = retries if retries is not None else self._bot_cfg.get("max_retries", 5)

        async with self._semaphore:
            for attempt in range(1, max_retries + 1):
                proxy = self.proxy_manager.get() if self.proxy_manager else None
                context = await self._create_context(proxy)
                try:
                    log.info("[%s] Attempt %d/%d", task.id, attempt, max_retries)
                    outcome = await self._execute_retailer(task, profile, context, proxy)
                    await self._handle_outcome(task, outcome, proxy)
                    if outcome.success:
                        return
                except Exception as e:
                    log.error("[%s] Attempt %d crashed: %s", task.id, attempt, e)
                    if proxy:
                        self.proxy_manager.mark_dead(proxy)
                finally:
                    await context.close()

                if attempt < max_retries:
                    backoff = min(2 ** attempt, 30)
                    log.info("[%s] Retrying in %ds…", task.id, backoff)
                    await asyncio.sleep(backoff)

            log.warning("[%s] All %d attempts exhausted.", task.id, max_retries)

    async def _execute_retailer(
        self,
        task: TaskConfig,
        profile: Profile,
        context: BrowserContext,
        proxy: Optional[Proxy],
    ) -> CheckoutOutcome:
        retailer_cls = _RETAILER_MAP.get(task.retailer)
        if not retailer_cls:
            raise ValueError(f"Unknown retailer: {task.retailer}")

        safe_delay = (
            self._bot_cfg.get("safe_delay_min_ms", 300),
            self._bot_cfg.get("safe_delay_max_ms", 900),
        )
        retailer = retailer_cls(context, task, profile, proxy, safe_delay)
        return await retailer.run()

    # ── Outcome handling ──────────────────────────────────────────────────────

    async def _handle_outcome(self, task: TaskConfig, outcome: CheckoutOutcome, proxy: Optional[Proxy]) -> None:
        if outcome.success:
            log.info(
                "[%s] SUCCESS  Order: %s  Size: %s  Price: %s",
                task.id, outcome.order_number, outcome.size_purchased, outcome.price,
            )
            if proxy:
                self.proxy_manager.mark_ok(proxy)
        else:
            log.warning("[%s] FAILED  Reason: %s", task.id, outcome.message)
            if proxy and self._proxy_cfg.get("rotate_on_ban"):
                self.proxy_manager.mark_dead(proxy)

        result = CheckoutResult(
            task_id=task.id,
            retailer=task.retailer,
            product_name=outcome.product_name or task.product_url,
            size=outcome.size_purchased or ",".join(task.sizes),
            price=outcome.price or "N/A",
            order_number=outcome.order_number,
            success=outcome.success,
            message=outcome.message,
            image_url=outcome.image_url,
        )
        self._results.append(result.__dict__)

        if outcome.success and self._notif_cfg.get("notify_on_success"):
            await self.notifier.notify_checkout(result)
        elif not outcome.success and self._notif_cfg.get("notify_on_failure"):
            await self.notifier.notify_checkout(result)

    # ── Monitor callback ──────────────────────────────────────────────────────

    async def _on_drop_detected(self, retailer: str, product_name: str, url: str, sizes: list) -> None:
        log.info("Auto-task: %s  %s", retailer, product_name)
        if self._notif_cfg.get("notify_on_restock"):
            await self.notifier.notify_restock(retailer, product_name, sizes or self._monitor_cfg.get("sizes", []), url)

        if not url:
            return

        task_dict = {
            "id": f"auto-{retailer}-{hash(url) & 0xFFFF:04x}",
            "enabled": True,
            "retailer": retailer if retailer in _RETAILER_MAP else "shopify",
            "product_url": url,
            "sizes": self._monitor_cfg.get("sizes", []),
            "quantity": 1,
            "profile_id": self._monitor_cfg.get("profile_id", "primary"),
            "mode": "fast",
        }
        asyncio.ensure_future(self._run_task(task_dict))

    # ── Browser context ───────────────────────────────────────────────────────

    async def _create_context(self, proxy: Optional[Proxy]) -> BrowserContext:
        viewport = {"width": random.randint(1280, 1920), "height": random.randint(800, 1080)}
        proxy_cfg = {"server": proxy.playwright_server} if proxy else None
        ctx = await self._browser.new_context(
            viewport=viewport,
            user_agent=self._random_ua(),
            proxy=proxy_cfg,
            java_script_enabled=True,
            ignore_https_errors=False,
        )
        # Warm up: load a neutral page to get cookies
        page = await ctx.new_page()
        try:
            await page.goto("about:blank")
        finally:
            await page.close()
        return ctx

    @staticmethod
    def _random_ua() -> str:
        uas = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
        ]
        return random.choice(uas)

    # ── Results ───────────────────────────────────────────────────────────────

    @property
    def results(self) -> list:
        return self._results
