"""Data privacy utilities — anonymization and PII handling."""

from __future__ import annotations

import hashlib
import re

import pandas as pd


PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),
    "phone": re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
}


def _hash_value(value: str, salt: str = "tones-and-bones") -> str:
    return hashlib.sha256(f"{salt}{value}".encode()).hexdigest()[:16]


def anonymize_dataframe(
    df: pd.DataFrame,
    columns: list[str] | None = None,
    hash_salt: str = "tones-and-bones",
) -> pd.DataFrame:
    """Anonymize specified columns by hashing their values.

    If no columns are specified, auto-detects columns containing PII patterns.
    """
    df = df.copy()

    if columns is None:
        columns = []
        for col in df.select_dtypes(include=["object"]).columns:
            sample = df[col].dropna().head(100).astype(str)
            for pattern in PII_PATTERNS.values():
                if sample.str.contains(pattern).any():
                    columns.append(col)
                    break

    for col in columns:
        if col in df.columns:
            df[col] = df[col].astype(str).apply(lambda v: _hash_value(v, hash_salt))

    return df


def scan_for_pii(df: pd.DataFrame) -> dict[str, list[str]]:
    """Scan a DataFrame for potential PII and return findings."""
    findings: dict[str, list[str]] = {}
    for col in df.select_dtypes(include=["object"]).columns:
        sample = df[col].dropna().head(200).astype(str)
        detected = []
        for pii_type, pattern in PII_PATTERNS.items():
            if sample.str.contains(pattern).any():
                detected.append(pii_type)
        if detected:
            findings[col] = detected
    return findings
