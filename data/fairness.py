"""Bias and fairness auditing using Fairlearn."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

try:
    from fairlearn.metrics import MetricFrame, demographic_parity_difference, equalized_odds_difference
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

    FAIRLEARN_AVAILABLE = True
except ImportError:
    FAIRLEARN_AVAILABLE = False


def audit_fairness(
    y_true: np.ndarray | pd.Series,
    y_pred: np.ndarray | pd.Series,
    sensitive_features: pd.DataFrame | pd.Series,
    output_dir: str = "reports/fairness",
    report_name: str = "fairness_audit",
) -> dict[str, Any]:
    """Run a fairness audit and generate a report.

    Args:
        y_true: Ground truth labels.
        y_pred: Model predictions.
        sensitive_features: Protected attribute(s) to audit against.
        output_dir: Directory to save the report.
        report_name: Name for the report file.

    Returns:
        Dict with fairness metrics, group breakdowns, and flagged issues.
    """
    if not FAIRLEARN_AVAILABLE:
        return {
            "error": "Fairlearn not installed. Run: pip install fairlearn scikit-learn",
            "status": "skipped",
        }

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    metrics = {
        "accuracy": accuracy_score,
        "precision": lambda y, p: precision_score(y, p, zero_division=0),
        "recall": lambda y, p: recall_score(y, p, zero_division=0),
        "f1": lambda y, p: f1_score(y, p, zero_division=0),
    }

    mf = MetricFrame(
        metrics=metrics,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features,
    )

    report: dict[str, Any] = {
        "overall": {k: round(float(v), 4) for k, v in mf.overall.items()},
        "by_group": {
            str(group): {k: round(float(v), 4) for k, v in row.items()}
            for group, row in mf.by_group.iterrows()
        },
        "disparities": {},
        "flags": [],
    }

    # Compute disparity metrics
    dp_diff = demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive_features)
    report["disparities"]["demographic_parity_difference"] = round(float(dp_diff), 4)

    try:
        eo_diff = equalized_odds_difference(y_true, y_pred, sensitive_features=sensitive_features)
        report["disparities"]["equalized_odds_difference"] = round(float(eo_diff), 4)
    except Exception:
        report["disparities"]["equalized_odds_difference"] = None

    # Flag issues
    if abs(dp_diff) > 0.1:
        report["flags"].append({
            "issue": "Demographic parity violation",
            "severity": "high" if abs(dp_diff) > 0.2 else "medium",
            "value": round(float(dp_diff), 4),
            "mitigation": (
                "Consider reweighting training samples, using fairness-aware loss functions, "
                "or applying post-processing calibration (e.g., ThresholdOptimizer)."
            ),
        })

    # Check for large accuracy gaps between groups
    group_acc = mf.by_group["accuracy"]
    acc_range = group_acc.max() - group_acc.min()
    if acc_range > 0.1:
        report["flags"].append({
            "issue": "Large accuracy disparity between groups",
            "severity": "high" if acc_range > 0.2 else "medium",
            "value": round(float(acc_range), 4),
            "mitigation": (
                "Investigate under-represented groups, add targeted data collection, "
                "or use adversarial debiasing techniques."
            ),
        })

    report["status"] = "flagged" if report["flags"] else "pass"

    # Save
    report_path = out / f"{report_name}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    report["report_path"] = str(report_path)

    return report
