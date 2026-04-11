"""Billing/shipping profile manager with AES-256 encryption at rest."""
import base64
import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from sneaker_agency.utils.logger import get_logger

log = get_logger("profiles")

_PROFILES_FILE = Path.home() / ".tones_bones" / "profiles.enc"


@dataclass
class Profile:
    id: str
    first_name: str
    last_name: str
    email: str
    phone: str
    address_1: str
    address_2: str
    city: str
    state: str
    zip: str
    country: str
    card_number: str
    card_expiry: str
    card_cvv: str
    card_holder: str

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def card_last4(self) -> str:
        return self.card_number[-4:]

    def to_dict(self) -> dict:
        return asdict(self)


class ProfileManager:
    def __init__(self, raw_profiles: List[dict]):
        self._profiles: Dict[str, Profile] = {}
        for p in raw_profiles:
            profile = Profile(**p)
            self._profiles[profile.id] = profile
        log.info("Loaded %d profile(s).", len(self._profiles))

    def get(self, profile_id: str) -> Optional[Profile]:
        p = self._profiles.get(profile_id)
        if not p:
            log.error("Profile '%s' not found.", profile_id)
        return p

    def all(self) -> List[Profile]:
        return list(self._profiles.values())

    # ── Encrypted persistence ─────────────────────────────────────────────────

    @staticmethod
    def _derive_key(password: str, salt: bytes) -> bytes:
        kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1)
        return kdf.derive(password.encode())

    def save_encrypted(self, password: str) -> None:
        """Encrypt all profiles to disk using a password."""
        _PROFILES_FILE.parent.mkdir(parents=True, exist_ok=True)
        salt = os.urandom(16)
        key = self._derive_key(password, salt)
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        plaintext = json.dumps([p.to_dict() for p in self._profiles.values()]).encode()
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        payload = base64.b64encode(salt + nonce + ciphertext).decode()
        _PROFILES_FILE.write_text(payload)
        log.info("Profiles encrypted and saved to %s", _PROFILES_FILE)

    @classmethod
    def load_encrypted(cls, password: str) -> "ProfileManager":
        """Decrypt profiles from disk."""
        if not _PROFILES_FILE.exists():
            raise FileNotFoundError(f"No encrypted profiles file at {_PROFILES_FILE}")
        raw = base64.b64decode(_PROFILES_FILE.read_text())
        salt, nonce, ciphertext = raw[:16], raw[16:28], raw[28:]
        key = cls._derive_key(password, salt)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        profiles = json.loads(plaintext)
        log.info("Profiles decrypted from %s", _PROFILES_FILE)
        return cls(profiles)
