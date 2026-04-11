"""Adidas.com retailer adapter.

Adidas uses a virtual queue (Confirmed) for hyped releases and a standard
product detail page for general drops. This adapter handles both.
"""
import re
from typing import List, Optional

from playwright.async_api import Page, TimeoutError as PWTimeout

from sneaker_agency.retailers.base import BaseRetailer, CheckoutOutcome
from sneaker_agency.utils.logger import get_logger

log = get_logger("retailer.adidas")

_ADIDAS_CART = "https://www.adidas.com/us/cart"
_ADIDAS_CHECKOUT = "https://www.adidas.com/us/checkout"


class AdidasRetailer(BaseRetailer):
    name = "adidas"

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
            log.info("[%s] Adidas task starting → %s", self.task.id, self.task.product_url)
            await page.goto(self.task.product_url, wait_until="networkidle", timeout=30_000)

            # Dismiss cookie banner if present
            await self._dismiss_cookie_banner(page)

            # Check for queue / Confirmed app entry
            if await self._is_confirmed_draw(page):
                return await self._handle_confirmed_draw(page)

            size = await self._pick_size(page)
            if not size:
                return CheckoutOutcome(success=False, order_number=None, message="No matching size available.")

            added = await self._add_to_cart(page, size)
            if not added:
                return CheckoutOutcome(success=False, order_number=None, message="Add to cart failed.")

            outcome = await self._checkout(page)
            outcome.size_purchased = size
            return outcome
        except PWTimeout as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Timeout: {e}")
        except Exception as e:
            log.error("[%s] Unexpected error: %s", self.task.id, e)
            return CheckoutOutcome(success=False, order_number=None, message=str(e))
        finally:
            await page.close()

    # ── Size selection ────────────────────────────────────────────────────────

    async def _scrape_sizes(self, page: Page) -> List[str]:
        try:
            await page.wait_for_selector('[data-auto-id="size-selector"] button:not([disabled])', timeout=8_000)
            els = await page.query_selector_all('[data-auto-id="size-selector"] button:not([disabled])')
            return [await el.inner_text() for el in els]
        except PWTimeout:
            return []

    async def _pick_size(self, page: Page) -> Optional[str]:
        available = await self._scrape_sizes(page)
        log.debug("[%s] Available sizes: %s", self.task.id, available)
        for desired in self.task.sizes:
            normalized = desired.replace("US ", "").strip()
            for avail in available:
                if avail.strip() in (normalized, desired.strip()):
                    await self._safe_click(
                        page,
                        f'[data-auto-id="size-selector"] button:not([disabled]):text("{avail.strip()}")',
                    )
                    return avail.strip()
        return None

    # ── ATC ───────────────────────────────────────────────────────────────────

    async def _add_to_cart(self, page: Page, size: str) -> bool:
        try:
            await self._safe_click(page, '[data-auto-id="add-to-bag"]')
            await page.wait_for_selector('[data-auto-id="bag-count"]', timeout=10_000)
            log.info("[%s] Added to cart.", self.task.id)
            return True
        except PWTimeout:
            return False

    # ── Queue / Confirmed draw ────────────────────────────────────────────────

    async def _is_confirmed_draw(self, page: Page) -> bool:
        content = await page.content()
        return "confirmed-app" in content.lower() or "enter draw" in content.lower()

    async def _handle_confirmed_draw(self, page: Page) -> CheckoutOutcome:
        log.info("[%s] Adidas Confirmed draw detected. Attempting entry…", self.task.id)
        try:
            await self._safe_click(page, '[data-auto-id="join-draw"]')
            await page.wait_for_selector('[data-auto-id="draw-entered"]', timeout=20_000)
            return CheckoutOutcome(
                success=True,
                order_number=None,
                message="Draw entry submitted. Check Adidas Confirmed app for result.",
            )
        except PWTimeout:
            return CheckoutOutcome(success=False, order_number=None, message="Draw entry failed / timed out.")

    # ── Cookie banner ─────────────────────────────────────────────────────────

    async def _dismiss_cookie_banner(self, page: Page) -> None:
        try:
            btn = await page.query_selector('[data-auto-id="cookie-accept"]')
            if btn:
                await btn.click()
        except Exception:
            pass

    # ── Checkout ──────────────────────────────────────────────────────────────

    async def _checkout(self, page: Page) -> CheckoutOutcome:
        await page.goto(_ADIDAS_CHECKOUT, wait_until="networkidle", timeout=30_000)

        try:
            # Shipping
            await self._safe_fill(page, '[id="shippingAddress.firstName"]', self.profile.first_name)
            await self._safe_fill(page, '[id="shippingAddress.lastName"]', self.profile.last_name)
            await self._safe_fill(page, '[id="shippingAddress.address1"]', self.profile.address_1)
            await self._safe_fill(page, '[id="shippingAddress.city"]', self.profile.city)
            await self._safe_fill(page, '[id="shippingAddress.zipCode"]', self.profile.zip)
            await self._safe_fill(page, '[id="shippingAddress.phone"]', self.profile.phone)
            await self._safe_click(page, '[data-auto-id="checkout-shipping-continue"]')

            # Payment
            await page.wait_for_selector('[id="cardNumber"]', timeout=15_000)
            await self._safe_fill(page, '[id="cardNumber"]', self.profile.card_number)
            await self._safe_fill(page, '[id="expiryDate"]', self.profile.card_expiry)
            await self._safe_fill(page, '[id="securityCode"]', self.profile.card_cvv)
            await self._safe_fill(page, '[id="cardholderName"]', self.profile.card_holder)
            await self._safe_click(page, '[data-auto-id="checkout-payment-continue"]')

            # Place order
            await page.wait_for_selector('[data-auto-id="place-order"]', timeout=15_000)
            await self._safe_click(page, '[data-auto-id="place-order"]')
            await page.wait_for_url("**/confirmation**", timeout=20_000)
        except PWTimeout as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Checkout timeout: {e}")
        except Exception as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Checkout error: {e}")

        order_number = await self._extract_order_number(page)
        log.info("[%s] Adidas order confirmed: %s", self.task.id, order_number)
        return CheckoutOutcome(
            success=True,
            order_number=order_number,
            message="Order placed successfully.",
        )

    async def _extract_order_number(self, page: Page) -> Optional[str]:
        try:
            el = await page.query_selector('[data-auto-id="order-number"]')
            if el:
                text = await el.inner_text()
                m = re.search(r"[\w\-]{6,}", text)
                return m.group(0) if m else text.strip()
        except Exception:
            pass
        return None
