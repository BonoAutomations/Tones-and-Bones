"""Generic Shopify retailer adapter.

Covers boutiques running Shopify: KITH, Concepts, NRML, END., etc.

Speed trick: hit /cart/add.js directly with a variant ID to skip the PDP
entirely, then navigate straight to /checkout.
"""
import re
from typing import List, Optional

import httpx
from playwright.async_api import Page, TimeoutError as PWTimeout

from sneaker_agency.retailers.base import BaseRetailer, CheckoutOutcome
from sneaker_agency.utils.logger import get_logger

log = get_logger("retailer.shopify")


class ShopifyRetailer(BaseRetailer):
    name = "shopify"

    # ── Product & variant resolution ──────────────────────────────────────────

    async def _get_product_json(self) -> Optional[dict]:
        """Fetch /products/<handle>.js to get all variants."""
        # Convert product URL to .js endpoint
        url = self.task.product_url.rstrip("/")
        json_url = url + ".js"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(json_url, headers={"User-Agent": "Mozilla/5.0"})
                if r.status_code == 200:
                    return r.json()
        except Exception as e:
            log.warning("Could not fetch product JSON: %s", e)
        return None

    async def get_available_sizes(self) -> List[str]:
        product = await self._get_product_json()
        if not product:
            return []
        return [
            v.get("option1", "") or v.get("title", "")
            for v in product.get("variants", [])
            if v.get("available")
        ]

    async def _find_variant_id(self, size: str) -> Optional[str]:
        # Use explicit variant IDs from config if provided
        if self.task.variant_ids:
            return self.task.variant_ids[0]

        product = await self._get_product_json()
        if not product:
            return None

        normalized = size.replace("US ", "").strip()
        for variant in product.get("variants", []):
            if not variant.get("available"):
                continue
            title = (variant.get("option1") or variant.get("title") or "").strip()
            if title == normalized or title == size.strip():
                return str(variant["id"])
        return None

    # ── Main flow ─────────────────────────────────────────────────────────────

    async def run(self) -> CheckoutOutcome:
        page = await self._new_page()
        try:
            log.info("[%s] Shopify task → %s", self.task.id, self.task.product_url)

            # Resolve size
            chosen_size = None
            variant_id = None
            for size in self.task.sizes:
                vid = await self._find_variant_id(size)
                if vid:
                    chosen_size = size
                    variant_id = vid
                    break

            if not variant_id:
                return CheckoutOutcome(success=False, order_number=None, message="No matching variant found / out of stock.")

            log.info("[%s] Variant %s (size %s) — fast ATC via API", self.task.id, variant_id, chosen_size)
            added = await self._api_atc(page, variant_id)
            if not added:
                return CheckoutOutcome(success=False, order_number=None, message="ATC failed.")

            outcome = await self._checkout(page)
            outcome.size_purchased = chosen_size
            return outcome
        except Exception as e:
            log.error("[%s] Error: %s", self.task.id, e)
            return CheckoutOutcome(success=False, order_number=None, message=str(e))
        finally:
            await page.close()

    # ── ATC via Shopify AJAX API ──────────────────────────────────────────────

    async def _api_atc(self, page: Page, variant_id: str) -> bool:
        """POST to /cart/add.js — much faster than clicking the DOM."""
        base = self._base_url()
        atc_url = f"{base}/cart/add.js"

        # We need to use the browser context cookies, so do it via page.evaluate
        await page.goto(base, wait_until="domcontentloaded", timeout=20_000)
        result = await page.evaluate(
            """async ({url, variantId}) => {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'},
                    body: JSON.stringify({id: variantId, quantity: 1})
                });
                return resp.status;
            }""",
            {"url": atc_url, "variantId": int(variant_id)},
        )
        log.info("[%s] ATC status: %s", self.task.id, result)
        return result == 200

    # ── Checkout ──────────────────────────────────────────────────────────────

    async def _checkout(self, page: Page) -> CheckoutOutcome:
        base = self._base_url()
        checkout_url = f"{base}/checkout"
        await page.goto(checkout_url, wait_until="networkidle", timeout=30_000)

        try:
            # Contact
            email_field = await page.query_selector('[id="checkout_email"]')
            if email_field:
                await self._safe_fill(page, '[id="checkout_email"]', self.profile.email)

            # Shipping
            await self._safe_fill(page, '[id="checkout_shipping_address_first_name"]', self.profile.first_name)
            await self._safe_fill(page, '[id="checkout_shipping_address_last_name"]', self.profile.last_name)
            await self._safe_fill(page, '[id="checkout_shipping_address_address1"]', self.profile.address_1)
            if self.profile.address_2:
                await self._safe_fill(page, '[id="checkout_shipping_address_address2"]', self.profile.address_2)
            await self._safe_fill(page, '[id="checkout_shipping_address_city"]', self.profile.city)
            await self._safe_fill(page, '[id="checkout_shipping_address_zip"]', self.profile.zip)
            await self._safe_fill(page, '[id="checkout_shipping_address_phone"]', self.profile.phone)
            await self._safe_click(page, '[id="continue_button"]')

            # Shipping method
            await page.wait_for_selector('[id="continue_button"]', timeout=15_000)
            await self._safe_click(page, '[id="continue_button"]')

            # Payment
            frame = page.frame_locator('[id="card-fields-number"]')
            await frame.locator('input').fill(self.profile.card_number)

            frame_exp = page.frame_locator('[id="card-fields-expiry"]')
            await frame_exp.locator('input').fill(self.profile.card_expiry)

            frame_cvv = page.frame_locator('[id="card-fields-verification_value"]')
            await frame_cvv.locator('input').fill(self.profile.card_cvv)

            await self._safe_fill(page, '[id="checkout_billing_address_first_name"]', self.profile.first_name)
            await self._safe_fill(page, '[id="checkout_billing_address_last_name"]', self.profile.last_name)

            # Place order
            await self._safe_click(page, '[id="continue_button"]')
            await page.wait_for_url("**/thank_you**", timeout=20_000)
        except PWTimeout as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Timeout: {e}")
        except Exception as e:
            return CheckoutOutcome(success=False, order_number=None, message=f"Checkout error: {e}")

        order_number = await self._extract_order_number(page)
        log.info("[%s] Shopify order confirmed: %s", self.task.id, order_number)
        return CheckoutOutcome(success=True, order_number=order_number, message="Order placed.")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _base_url(self) -> str:
        url = self.task.product_url
        m = re.match(r"(https?://[^/]+)", url)
        return m.group(1) if m else url

    async def _extract_order_number(self, page: Page) -> Optional[str]:
        try:
            el = await page.query_selector('.os-order-number')
            if el:
                text = await el.inner_text()
                m = re.search(r"#?([\w\-]+)", text)
                return m.group(1) if m else text.strip()
        except Exception:
            pass
        return None
