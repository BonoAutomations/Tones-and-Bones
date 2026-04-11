"""Foot Locker retailer adapter (footlocker.com, champssports.com, eastbay.com)."""
import re
from typing import List, Optional

from playwright.async_api import Page, TimeoutError as PWTimeout

from sneaker_agency.retailers.base import BaseRetailer, CheckoutOutcome
from sneaker_agency.utils.logger import get_logger

log = get_logger("retailer.footlocker")

_FL_CHECKOUT = "https://www.footlocker.com/checkout/"


class FootLockerRetailer(BaseRetailer):
    name = "footlocker"

    async def get_available_sizes(self) -> List[str]:
        page = await self._new_page()
        try:
            await page.goto(self.task.product_url, wait_until="domcontentloaded", timeout=30_000)
            return await self._scrape_sizes(page)
        finally:
            await page.close()

    async def run(self) -> CheckoutOutcome:
        page = await self._new_page()
        try:
            log.info("[%s] Foot Locker task → %s", self.task.id, self.task.product_url)
            await page.goto(self.task.product_url, wait_until="networkidle", timeout=30_000)

            # Accept cookies
            await self._accept_cookies(page)

            size = await self._pick_size(page)
            if not size:
                return CheckoutOutcome(success=False, order_number=None, message="No matching size available.")

            added = await self._add_to_cart(page, size)
            if not added:
                return CheckoutOutcome(success=False, order_number=None, message="Add to cart failed.")

            outcome = await self._checkout(page)
            outcome.size_purchased = size
            return outcome
        except Exception as e:
            log.error("[%s] Error: %s", self.task.id, e)
            return CheckoutOutcome(success=False, order_number=None, message=str(e))
        finally:
            await page.close()

    # ── Size ──────────────────────────────────────────────────────────────────

    async def _scrape_sizes(self, page: Page) -> List[str]:
        try:
            await page.wait_for_selector('.ProductSize:not(.is-disabled)', timeout=8_000)
            els = await page.query_selector_all('.ProductSize:not(.is-disabled)')
            return [await el.inner_text() for el in els]
        except PWTimeout:
            return []

    async def _pick_size(self, page: Page) -> Optional[str]:
        available = await self._scrape_sizes(page)
        log.debug("[%s] Available: %s", self.task.id, available)
        for desired in self.task.sizes:
            normalized = desired.replace("US ", "").strip()
            for avail in available:
                if avail.strip() in (normalized, desired.strip()):
                    await self._safe_click(page, f'.ProductSize:not(.is-disabled):text("{avail.strip()}")')
                    return avail.strip()
        return None

    # ── ATC ───────────────────────────────────────────────────────────────────

    async def _add_to_cart(self, page: Page, size: str) -> bool:
        try:
            await self._safe_click(page, '.ProductAddToBag-primary')
            await page.wait_for_selector('.MiniCartCount', timeout=10_000)
            log.info("[%s] Added to cart.", self.task.id)
            return True
        except PWTimeout:
            return False

    # ── Cookie consent ────────────────────────────────────────────────────────

    async def _accept_cookies(self, page: Page) -> None:
        try:
            btn = await page.query_selector('#consent_prompt_submit')
            if btn:
                await btn.click()
        except Exception:
            pass

    # ── Checkout ──────────────────────────────────────────────────────────────

    async def _checkout(self, page: Page) -> CheckoutOutcome:
        # Foot Locker uses a multi-step SPA checkout
        try:
            await page.goto(_FL_CHECKOUT, wait_until="networkidle", timeout=30_000)

            # Contact
            await self._safe_fill(page, '[id="email"]', self.profile.email)

            # Shipping
            await self._safe_fill(page, '[id="first-name"]', self.profile.first_name)
            await self._safe_fill(page, '[id="last-name"]', self.profile.last_name)
            await self._safe_fill(page, '[id="address-line1"]', self.profile.address_1)
            await self._safe_fill(page, '[id="city"]', self.profile.city)
            await self._safe_fill(page, '[id="postal-code"]', self.profile.zip)
            await self._safe_fill(page, '[id="phone"]', self.profile.phone)
            await self._safe_click(page, '[data-qa="shipping-continue"]')

            # Payment (card iframe)
            frame = page.frame_locator('#payment-iframe')
            await frame.locator('[id="cardNumber"]').fill(self.profile.card_number)
            await frame.locator('[id="expirationDate"]').fill(self.profile.card_expiry)
            await frame.locator('[id="cvv"]').fill(self.profile.card_cvv)
            await self._safe_click(page, '[data-qa="payment-continue"]')

            # Review & place order
            await page.wait_for_selector('[data-qa="place-order"]', timeout=15_000)
            await self._safe_click(page, '[data-qa="place-order"]')
            await page.wait_for_url("**/confirmation**", timeout=20_000)
        except PWTimeout as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"FL checkout timeout: {e}")
        except Exception as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"FL checkout error: {e}")

        order_number = await self._extract_order_number(page)
        log.info("[%s] Foot Locker order: %s", self.task.id, order_number)
        return CheckoutOutcome(success=True, order_number=order_number, message="Order placed.")

    async def _extract_order_number(self, page: Page) -> Optional[str]:
        try:
            el = await page.query_selector('[data-qa="order-number"]')
            if el:
                text = await el.inner_text()
                m = re.search(r"[\w\-]{6,}", text)
                return m.group(0) if m else text.strip()
        except Exception:
            pass
        return None
