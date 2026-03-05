"""Tests for the Kaizen self-evaluation engine."""

import json
import tempfile
from pathlib import Path

from evaluation.kaizen import KaizenEvaluator


def test_evaluate_pass():
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = Path(tmpdir) / "kaizen.jsonl"
        evaluator = KaizenEvaluator(str(log_path))
        report = evaluator.evaluate(
            task_name="test_task",
            outcome="success",
            metrics={"val_acc": 0.95, "val_loss": 0.1},
        )
        assert report["status"] == "pass"
        assert report["task"] == "test_task"
        assert log_path.exists()


def test_evaluate_regression():
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = Path(tmpdir) / "kaizen.jsonl"
        evaluator = KaizenEvaluator(str(log_path))
        report = evaluator.evaluate(
            task_name="test_task",
            outcome="completed",
            metrics={"val_acc": 0.70},
            previous_best={"val_acc": 0.85},
        )
        assert report["status"] == "needs_attention"
        assert any("Regression" in r for r in report["recommendations"])


def test_get_best_metrics():
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = Path(tmpdir) / "kaizen.jsonl"
        evaluator = KaizenEvaluator(str(log_path))
        evaluator.evaluate("t1", "ok", metrics={"val_acc": 0.80})
        evaluator.evaluate("t1", "ok", metrics={"val_acc": 0.90})
        evaluator.evaluate("t1", "ok", metrics={"val_acc": 0.85})
        best = evaluator.get_best_metrics("t1")
        assert best["val_acc"] == 0.90
