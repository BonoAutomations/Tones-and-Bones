"""Captcha solving helpers (2captcha / anticaptcha)."""
import asyncio
from typing import Optional

import httpx

from sneaker_agency.utils.logger import get_logger

log = get_logger("captcha")


class CaptchaSolver:
    """Wraps 2captcha and anticaptcha REST APIs."""

    def __init__(self, provider: str, api_key: str):
        self.provider = provider
        self.api_key = api_key

    # ── 2captcha ──────────────────────────────────────────────────────────────

    async def _2captcha_recaptcha_v2(self, site_key: str, page_url: str) -> Optional[str]:
        async with httpx.AsyncClient(timeout=120) as client:
            # Submit
            r = await client.post(
                "https://2captcha.com/in.php",
                data={
                    "key": self.api_key,
                    "method": "userrecaptcha",
                    "googlekey": site_key,
                    "pageurl": page_url,
                    "json": 1,
                },
            )
            data = r.json()
            if data.get("status") != 1:
                log.error("2captcha submit failed: %s", data)
                return None
            task_id = data["request"]

            # Poll
            for _ in range(30):
                await asyncio.sleep(5)
                r = await client.get(
                    "https://2captcha.com/res.php",
                    params={"key": self.api_key, "action": "get", "id": task_id, "json": 1},
                )
                data = r.json()
                if data.get("status") == 1:
                    log.info("Captcha solved (2captcha).")
                    return data["request"]
                if data.get("request") != "CAPCHA_NOT_READY":
                    log.error("2captcha error: %s", data)
                    return None

        log.error("2captcha timeout — captcha unsolved after 150 s.")
        return None

    # ── anticaptcha ───────────────────────────────────────────────────────────

    async def _anticaptcha_recaptcha_v2(self, site_key: str, page_url: str) -> Optional[str]:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                "https://api.anti-captcha.com/createTask",
                json={
                    "clientKey": self.api_key,
                    "task": {
                        "type": "NoCaptchaTaskProxyless",
                        "websiteURL": page_url,
                        "websiteKey": site_key,
                    },
                },
            )
            data = r.json()
            if data.get("errorId"):
                log.error("anticaptcha submit error: %s", data)
                return None
            task_id = data["taskId"]

            for _ in range(30):
                await asyncio.sleep(5)
                r = await client.post(
                    "https://api.anti-captcha.com/getTaskResult",
                    json={"clientKey": self.api_key, "taskId": task_id},
                )
                data = r.json()
                if data.get("status") == "ready":
                    log.info("Captcha solved (anticaptcha).")
                    return data["solution"]["gRecaptchaResponse"]
                if data.get("errorId"):
                    log.error("anticaptcha error: %s", data)
                    return None

        log.error("anticaptcha timeout.")
        return None

    # ── Public ────────────────────────────────────────────────────────────────

    async def solve_recaptcha_v2(self, site_key: str, page_url: str) -> Optional[str]:
        if self.provider == "2captcha":
            return await self._2captcha_recaptcha_v2(site_key, page_url)
        elif self.provider == "anticaptcha":
            return await self._anticaptcha_recaptcha_v2(site_key, page_url)
        else:
            log.warning("Unknown captcha provider: %s", self.provider)
            return None
