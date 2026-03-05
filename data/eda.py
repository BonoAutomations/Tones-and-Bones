"""Exploratory Data Analysis — automated summaries, visualizations, and outlier detection."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns


def run_eda(
    df: pd.DataFrame,
    output_dir: str = "reports/eda",
    dataset_name: str = "dataset",
) -> dict[str, Any]:
    """Run a full EDA pipeline and save artifacts to output_dir.

    Returns a summary dict with statistics, outlier info, and file paths.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "dataset": dataset_name,
        "shape": list(df.shape),
        "columns": {},
        "outliers": {},
        "visualizations": [],
    }

    # --- Basic statistics ---
    desc = df.describe(include="all").to_dict()
    report["summary_statistics"] = {
        col: {k: _safe_val(v) for k, v in stats.items()} for col, stats in desc.items()
    }

    # --- Per-column analysis ---
    for col in df.columns:
        col_info: dict[str, Any] = {
            "dtype": str(df[col].dtype),
            "missing": int(df[col].isna().sum()),
            "missing_pct": round(df[col].isna().mean() * 100, 2),
            "unique": int(df[col].nunique()),
        }
        if pd.api.types.is_numeric_dtype(df[col]):
            col_info["mean"] = _safe_val(df[col].mean())
            col_info["std"] = _safe_val(df[col].std())
            col_info["skew"] = _safe_val(df[col].skew())
            col_info["kurtosis"] = _safe_val(df[col].kurtosis())

            # IQR-based outlier detection
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outlier_mask = (df[col] < lower) | (df[col] > upper)
            n_outliers = int(outlier_mask.sum())
            if n_outliers > 0:
                report["outliers"][col] = {
                    "count": n_outliers,
                    "pct": round(n_outliers / len(df) * 100, 2),
                    "lower_bound": _safe_val(lower),
                    "upper_bound": _safe_val(upper),
                }
        report["columns"][col] = col_info

    # --- Visualizations ---
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    # Distribution plots
    if numeric_cols:
        n_cols = min(len(numeric_cols), 12)
        fig, axes = plt.subplots(
            nrows=(n_cols + 2) // 3, ncols=min(3, n_cols), figsize=(15, 4 * ((n_cols + 2) // 3))
        )
        axes_flat = np.array(axes).flatten() if n_cols > 1 else [axes]
        for i, col in enumerate(numeric_cols[:n_cols]):
            ax = axes_flat[i]
            df[col].dropna().hist(bins=30, ax=ax, edgecolor="black", alpha=0.7)
            ax.set_title(col, fontsize=10)
        for j in range(i + 1, len(axes_flat)):
            axes_flat[j].set_visible(False)
        plt.tight_layout()
        dist_path = out / f"{dataset_name}_distributions.png"
        fig.savefig(dist_path, dpi=100)
        plt.close(fig)
        report["visualizations"].append(str(dist_path))

    # Correlation heatmap
    if len(numeric_cols) >= 2:
        fig, ax = plt.subplots(figsize=(min(20, len(numeric_cols)), min(16, len(numeric_cols))))
        corr = df[numeric_cols].corr()
        sns.heatmap(corr, annot=len(numeric_cols) <= 15, fmt=".2f", cmap="coolwarm", ax=ax)
        ax.set_title(f"{dataset_name} — Correlation Matrix")
        plt.tight_layout()
        corr_path = out / f"{dataset_name}_correlation.png"
        fig.savefig(corr_path, dpi=100)
        plt.close(fig)
        report["visualizations"].append(str(corr_path))

    # Missing data heatmap
    if df.isna().any().any():
        fig, ax = plt.subplots(figsize=(min(20, len(df.columns)), 6))
        sns.heatmap(df.isna().T, cbar=False, cmap="viridis", ax=ax)
        ax.set_title(f"{dataset_name} — Missing Values")
        plt.tight_layout()
        miss_path = out / f"{dataset_name}_missing.png"
        fig.savefig(miss_path, dpi=100)
        plt.close(fig)
        report["visualizations"].append(str(miss_path))

    # Save JSON report
    report_path = out / f"{dataset_name}_eda_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    report["report_path"] = str(report_path)

    return report


def _safe_val(v: Any) -> Any:
    """Convert numpy/pandas types to Python native for JSON serialization."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if pd.isna(v):
        return None
    return v
