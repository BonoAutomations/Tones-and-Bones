"""Nike SNKRS / Nike.com retailer adapter.

Flow
----
1. Navigate to the product page.
2. Select the desired size (first available from the task list).
3. Add to cart via the Nike API (faster) or DOM click.
4. Navigate to checkout and fill shipping + payment.
5. Submit order and capture order number.
"""
import re
from typing import List, Optional

import httpx
from playwright.async_api import Page, TimeoutError as PWTimeout

from sneaker_agency.retailers.base import BaseRetailer, CheckoutOutcome
from sneaker_agency.utils.logger import get_logger

log = get_logger("retailer.nike")

_NIKE_ATC_API = "https://api.nike.com/buy/add_to_cart/v1"
_NIKE_CHECKOUT = "https://www.nike.com/checkout"


class NikeRetailer(BaseRetailer):
    name = "nike"

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_available_sizes(self) -> List[str]:
        page = await self._new_page()
        try:
            await page.goto(self.task.product_url, wait_until="domcontentloaded", timeout=30_000)
            sizes = await self._scrape_sizes(page)
            return sizes
        finally:
            await page.close()

    async def run(self) -> CheckoutOutcome:
        page = await self._new_page()
        try:
            log.info("[%s] Nike task starting → %s", self.task.id, self.task.product_url)
            await page.goto(self.task.product_url, wait_until="networkidle", timeout=30_000)

            size = await self._pick_size(page)
            if not size:
                return CheckoutOutcome(success=False, order_number=None, message="No matching size available.")

            log.info("[%s] Selected size: %s", self.task.id, size)
            added = await self._add_to_cart(page, size)
            if not added:
                return CheckoutOutcome(success=False, order_number=None, message="Add to cart failed.")

            outcome = await self._checkout(page)
            outcome.size_purchased = size
            return outcome
        except PWTimeout as e:
            log.error("[%s] Timeout: %s", self.task.id, e)
            return CheckoutOutcome(success=False, order_number=None, message=f"Timeout: {e}")
        except Exception as e:
            log.error("[%s] Unexpected error: %s", self.task.id, e)
            return CheckoutOutcome(success=False, order_number=None, message=str(e))
        finally:
            await page.close()

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _scrape_sizes(self, page: Page) -> List[str]:
        """Return list of available size strings from the product page."""
        try:
            await page.wait_for_selector('[data-qa="size-available"]', timeout=10_000)
            els = await page.query_selector_all('[data-qa="size-available"]')
            return [await el.inner_text() for el in els]
        except PWTimeout:
            return []

    async def _pick_size(self, page: Page) -> Optional[str]:
        available = await self._scrape_sizes(page)
        log.debug("[%s] Available sizes: %s", self.task.id, available)
        for desired in self.task.sizes:
            # Normalize: "US 10" == "10" == "10.0"
            normalized = desired.replace("US ", "").strip()
            for avail in available:
                if avail.strip() == normalized or avail.strip() == desired.strip():
                    # Click the size button
                    await self._safe_click(page, f'[data-qa="size-available"]:text("{avail.strip()}")')
                    return avail.strip()
        return None

    async def _add_to_cart(self, page: Page, size: str) -> bool:
        try:
            atc_btn = await page.query_selector('[data-qa="add-to-cart"]')
            if atc_btn:
                await self._safe_click(page, '[data-qa="add-to-cart"]')
            else:
                # SNKRS draw / entry
                await self._safe_click(page, '[data-qa="feed-card-cta-button"]')
            await page.wait_for_selector('[data-qa="cart-count"]', timeout=10_000)
            log.info("[%s] Added to cart.", self.task.id)
            return True
        except PWTimeout:
            log.warning("[%s] ATC button not found / cart count never updated.", self.task.id)
            return False

    async def _checkout(self, page: Page) -> CheckoutOutcome:
        await page.goto(_NIKE_CHECKOUT, wait_until="networkidle", timeout=30_000)

        # ── Shipping ──────────────────────────────────────────────────────────
        try:
            await self._safe_fill(page, '[id="firstName"]', self.profile.first_name)
            await self._safe_fill(page, '[id="lastName"]', self.profile.last_name)
            await self._safe_fill(page, '[id="address1"]', self.profile.address_1)
            if self.profile.address_2:
                await self._safe_fill(page, '[id="address2"]', self.profile.address_2)
            await self._safe_fill(page, '[id="city"]', self.profile.city)
            await self._safe_fill(page, '[id="state"]', self.profile.state)
            await self._safe_fill(page, '[id="zipCode"]', self.profile.zip)
            await self._safe_fill(page, '[id="phoneNumber"]', self.profile.phone)
            await self._safe_click(page, '[data-qa="save-and-continue"]')
        except Exception as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Shipping fill error: {e}")

        # ── Payment ───────────────────────────────────────────────────────────
        try:
            await page.wait_for_selector('[id="creditCardNumber"]', timeout=15_000)
            await self._safe_fill(page, '[id="creditCardNumber"]', self.profile.card_number)
            await self._safe_fill(page, '[id="expirationDate"]', self.profile.card_expiry)
            await self._safe_fill(page, '[id="cvCode"]', self.profile.card_cvv)
            await self._safe_fill(page, '[id="cardHolder"]', self.profile.card_holder)
            await self._safe_click(page, '[data-qa="save-and-continue"]')
        except Exception as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Payment fill error: {e}")

        # ── Place order ───────────────────────────────────────────────────────
        try:
            await page.wait_for_selector('[data-qa="place-order"]', timeout=15_000)
            await self._safe_click(page, '[data-qa="place-order"]')
            await page.wait_for_url("**/checkout/confirmation**", timeout=20_000)
        except PWTimeout:
            return CheckoutOutcome(success=False, order_number=None, message="Place order timed out / no confirmation page.")

        order_number = await self._extract_order_number(page)
        price = await self._extract_price(page)
        product_name = await self._extract_product_name(page)
        log.info("[%s] Order confirmed: %s", self.task.id, order_number)
        return CheckoutOutcome(
            success=True,
            order_number=order_number,
            message="Order placed successfully.",
            price=price,
            product_name=product_name,
        )

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

    async def _extract_price(self, page: Page) -> Optional[str]:
        try:
            el = await page.query_selector('[data-qa="order-total"]')
            if el:
                return (await el.inner_text()).strip()
        except Exception:
            pass
        return None

    async def _extract_product_name(self, page: Page) -> Optional[str]:
        try:
            el = await page.query_selector('[data-qa="product-name"]')
            if el:
                return (await el.inner_text()).strip()
        except Exception:
            pass
        return None
