"""
Environment variable loader and validator for Tones-and-Bones.

Reads from .env file and validates that required keys are present.
Never prints or logs actual secret values.
"""

import os
from pathlib import Path

ENV_FILE = Path(__file__).parent / ".env"

REQUIRED_KEYS = [
    "GEMINI_API_KEY",
    "CLAUDE_API_KEY",
]

OPTIONAL_KEYS = [
    "OPENAI_API_KEY",
    "PROJECT_ENV",
    "LOG_LEVEL",
]


def load_env(path: Path = ENV_FILE) -> dict[str, str]:
    """Load variables from a .env file into os.environ and return them."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            os.environ.setdefault(key, value)
            values[key] = value
    return values


def validate_env() -> tuple[list[str], list[str]]:
    """Check which required/optional keys are set.

    Returns (missing_required, missing_optional).
    """
    missing_required = [k for k in REQUIRED_KEYS if not os.environ.get(k)]
    missing_optional = [k for k in OPTIONAL_KEYS if not os.environ.get(k)]
    return missing_required, missing_optional


def env_summary() -> dict[str, str]:
    """Return a safe summary of env var status (set / not set) without values."""
    all_keys = REQUIRED_KEYS + OPTIONAL_KEYS
    return {k: ("set" if os.environ.get(k) else "not set") for k in all_keys}


def get_key(name: str) -> str:
    """Retrieve a single env var, raising if missing."""
    value = os.environ.get(name)
    if not value:
        raise EnvironmentError(
            f"{name} is not set. Copy .env.example to .env and fill in your keys."
        )
    return value
