"""Tests for privacy and PII handling."""

import pandas as pd

from utils.privacy import anonymize_dataframe, scan_for_pii


def test_scan_for_pii():
    df = pd.DataFrame({
        "name": ["Alice", "Bob"],
        "email": ["alice@example.com", "bob@test.org"],
        "phone": ["555-123-4567", "555-987-6543"],
        "score": [95, 87],
    })
    findings = scan_for_pii(df)
    assert "email" in findings
    assert "phone" in findings
    assert "score" not in findings


def test_anonymize_dataframe():
    df = pd.DataFrame({
        "email": ["alice@example.com", "bob@test.org"],
        "value": [100, 200],
    })
    anon = anonymize_dataframe(df, columns=["email"])
    assert anon["email"].iloc[0] != "alice@example.com"
    assert anon["value"].iloc[0] == 100  # Non-PII column unchanged


def test_auto_detect_anonymize():
    df = pd.DataFrame({
        "contact": ["alice@example.com", "bob@test.org"],
        "amount": [100, 200],
    })
    anon = anonymize_dataframe(df)  # Auto-detect PII columns
    assert anon["contact"].iloc[0] != "alice@example.com"
