"""Model explainability using SHAP — feature importance and visualization."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    import shap

    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False


def explain_model(
    model: Any,
    X: pd.DataFrame | np.ndarray,
    feature_names: list[str] | None = None,
    output_dir: str = "reports/explainability",
    report_name: str = "shap_report",
    max_samples: int = 500,
) -> dict[str, Any]:
    """Generate SHAP explanations for a model.

    Args:
        model: A fitted model with a predict method (sklearn-compatible) or a callable.
        X: Input features.
        feature_names: Names for the features.
        output_dir: Where to save plots and reports.
        report_name: Base name for output files.
        max_samples: Max samples for SHAP computation (controls speed).

    Returns:
        Dict with feature importance rankings and file paths to generated plots.
    """
    if not SHAP_AVAILABLE:
        return {
            "error": "SHAP not installed. Run: pip install shap",
            "status": "skipped",
        }

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    if isinstance(X, pd.DataFrame):
        feature_names = feature_names or list(X.columns)
        X_arr = X.values
    else:
        X_arr = X
        if feature_names is None:
            feature_names = [f"feature_{i}" for i in range(X_arr.shape[1])]

    # Subsample for speed
    if len(X_arr) > max_samples:
        idx = np.random.choice(len(X_arr), max_samples, replace=False)
        X_arr = X_arr[idx]

    # Use KernelExplainer as universal fallback
    background = shap.kmeans(X_arr, min(50, len(X_arr)))
    explainer = shap.KernelExplainer(model, background)
    shap_values = explainer.shap_values(X_arr[:min(100, len(X_arr))])

    # Compute mean absolute SHAP values for feature importance
    if isinstance(shap_values, list):
        shap_values = shap_values[0]
    mean_abs = np.abs(shap_values).mean(axis=0)
    importance = sorted(
        zip(feature_names, mean_abs.tolist()), key=lambda x: x[1], reverse=True
    )

    report: dict[str, Any] = {
        "feature_importance": [{"feature": f, "importance": round(v, 6)} for f, v in importance],
        "plots": [],
    }

    # Summary bar plot
    fig, ax = plt.subplots(figsize=(10, max(6, len(feature_names) * 0.3)))
    features = [f for f, _ in importance[:20]]
    values = [v for _, v in importance[:20]]
    ax.barh(features[::-1], values[::-1])
    ax.set_title("SHAP Feature Importance (Top 20)")
    ax.set_xlabel("Mean |SHAP value|")
    plt.tight_layout()
    bar_path = out / f"{report_name}_bar.png"
    fig.savefig(bar_path, dpi=100)
    plt.close(fig)
    report["plots"].append(str(bar_path))

    # SHAP beeswarm/summary plot
    try:
        fig = plt.figure(figsize=(12, max(6, len(feature_names) * 0.3)))
        shap.summary_plot(
            shap_values,
            X_arr[:min(100, len(X_arr))],
            feature_names=feature_names,
            show=False,
        )
        summary_path = out / f"{report_name}_summary.png"
        fig.savefig(summary_path, dpi=100, bbox_inches="tight")
        plt.close(fig)
        report["plots"].append(str(summary_path))
    except Exception:
        pass

    report["status"] = "complete"
    return report
