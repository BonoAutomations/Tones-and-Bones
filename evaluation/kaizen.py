"""Kaizen — Continuous self-reflection and optimization after every task.

After each experiment or task, the evaluator:
1. Logs what was done, the outcome, and the metrics.
2. Compares against previous results stored in RAG memory.
3. Generates improvement recommendations.
4. Persists the evaluation for future reference.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class KaizenEvaluator:
    """Post-task self-reflection engine with persistent logging."""

    def __init__(self, log_path: str = "reports/kaizen_log.jsonl") -> None:
        self._log_path = Path(log_path)
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

    def evaluate(
        self,
        task_name: str,
        outcome: str,
        metrics: dict[str, float] | None = None,
        previous_best: dict[str, float] | None = None,
        notes: str = "",
    ) -> dict[str, Any]:
        """Run a Kaizen evaluation cycle on a completed task.

        Returns an evaluation report with comparisons and recommendations.
        """
        report: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task": task_name,
            "outcome": outcome,
            "metrics": metrics or {},
            "previous_best": previous_best or {},
            "improvements": [],
            "status": "pass",
            "notes": notes,
        }

        # Compare metrics against previous best
        if metrics and previous_best:
            for key in metrics:
                if key in previous_best:
                    current = metrics[key]
                    prev = previous_best[key]
                    delta = current - prev
                    direction = self._metric_direction(key)
                    improved = (direction == "higher" and delta > 0) or (
                        direction == "lower" and delta < 0
                    )
                    report["improvements"].append({
                        "metric": key,
                        "current": current,
                        "previous": prev,
                        "delta": round(delta, 6),
                        "improved": improved,
                    })
                    if not improved:
                        report["status"] = "needs_attention"

        # Generate recommendations
        report["recommendations"] = self._generate_recommendations(report)

        # Persist to log
        self._append_log(report)

        return report

    def _metric_direction(self, metric_name: str) -> str:
        """Determine if a metric should be higher or lower."""
        lower_is_better = {"loss", "val_loss", "train_loss", "mse", "mae", "inference_ms"}
        name_lower = metric_name.lower()
        for term in lower_is_better:
            if term in name_lower:
                return "lower"
        return "higher"

    def _generate_recommendations(self, report: dict[str, Any]) -> list[str]:
        recs: list[str] = []
        if report["status"] == "needs_attention":
            degraded = [
                imp["metric"] for imp in report["improvements"] if not imp["improved"]
            ]
            recs.append(
                f"Regression detected in: {', '.join(degraded)}. "
                "Consider reverting recent changes or investigating root cause."
            )

        metrics = report.get("metrics", {})
        if "val_loss" in metrics and "train_loss" in metrics:
            gap = metrics["val_loss"] - metrics["train_loss"]
            if gap > 0.3:
                recs.append(
                    f"Large train/val loss gap ({gap:.3f}). Model may be overfitting. "
                    "Consider more regularization, data augmentation, or reducing model capacity."
                )

        if "val_acc" in metrics and metrics["val_acc"] < 0.7:
            recs.append(
                "Validation accuracy below 70%. Consider feature engineering, "
                "more training data, or a different architecture."
            )

        if "inference_ms" in metrics and metrics["inference_ms"] > 100:
            recs.append(
                f"Inference latency ({metrics['inference_ms']:.1f}ms) exceeds 100ms target. "
                "Apply quantization, pruning, or model distillation."
            )

        if not recs:
            recs.append("All metrics look good. Continue current approach.")

        return recs

    def _append_log(self, report: dict[str, Any]) -> None:
        with open(self._log_path, "a") as f:
            f.write(json.dumps(report) + "\n")

    def get_history(self, task_name: str | None = None) -> list[dict[str, Any]]:
        """Load evaluation history, optionally filtered by task name."""
        if not self._log_path.exists():
            return []
        entries: list[dict[str, Any]] = []
        with open(self._log_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                if task_name is None or entry.get("task") == task_name:
                    entries.append(entry)
        return entries

    def get_best_metrics(self, task_name: str) -> dict[str, float]:
        """Get the best recorded metrics for a given task."""
        history = self.get_history(task_name)
        if not history:
            return {}
        best: dict[str, float] = {}
        for entry in history:
            for key, value in entry.get("metrics", {}).items():
                direction = self._metric_direction(key)
                if key not in best:
                    best[key] = value
                elif direction == "higher" and value > best[key]:
                    best[key] = value
                elif direction == "lower" and value < best[key]:
                    best[key] = value
        return best
