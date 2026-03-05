"""Main entry point — end-to-end ML pipeline orchestrator.

Usage:
    python run_pipeline.py --stage [eda|train|evaluate|serve|all]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console

from utils.config import load_config
from utils.reproducibility import set_seed

console = Console()


def stage_eda(cfg) -> None:
    """Run exploratory data analysis on all CSV/Parquet files in raw data dir."""
    from data.eda import run_eda
    from data.loader import DataPipeline

    pipeline = DataPipeline(cfg.data.raw_dir)
    raw = Path(cfg.data.raw_dir)

    files = list(raw.glob("*.csv")) + list(raw.glob("*.parquet"))
    if not files:
        console.print("[yellow]No data files found in {raw}. Add CSV/Parquet files to proceed.[/]")
        return

    for f in files:
        console.print(f"[blue]Running EDA on {f.name}...[/]")
        if f.suffix == ".csv":
            df, meta = pipeline.load_csv(f.name)
        else:
            df, meta = pipeline.load_parquet(f.name)
        console.print(f"  Loaded: {meta.rows} rows x {meta.columns} cols ({meta.size_mb} MB)")
        report = run_eda(df, output_dir=cfg.evaluation.eda_report_dir, dataset_name=f.stem)
        console.print(f"  Outliers found in {len(report.get('outliers', {}))} columns")
        console.print(f"  Report saved: {report.get('report_path')}")


def stage_train(cfg) -> None:
    """Train the model using PyTorch Lightning."""
    from models.base_module import BaseMLModule
    from models.trainer import build_trainer, check_data_size

    console.print("[blue]Building trainer...[/]")
    check_data_size(cfg.data.raw_dir, cfg.data.max_unconfirmed_size_gb)
    trainer = build_trainer(cfg)

    console.print("[yellow]No training data loaded — provide a DataModule to train.[/]")
    console.print("Example:")
    console.print("  model = BaseMLModule(input_dim=..., output_dim=...)")
    console.print("  trainer.fit(model, datamodule=your_datamodule)")


def stage_evaluate(cfg) -> None:
    """Run Kaizen evaluation on the latest experiment."""
    from evaluation.kaizen import KaizenEvaluator

    evaluator = KaizenEvaluator(cfg.evaluation.kaizen_log)
    history = evaluator.get_history()
    if not history:
        console.print("[yellow]No evaluation history found. Train a model first.[/]")
        return
    latest = history[-1]
    console.print(f"[green]Latest evaluation:[/]")
    console.print(f"  Task: {latest['task']}")
    console.print(f"  Status: {latest['status']}")
    for rec in latest.get("recommendations", []):
        console.print(f"  > {rec}")


def stage_serve(cfg) -> None:
    """Launch the FastAPI server."""
    import uvicorn

    console.print(f"[green]Starting API server on {cfg.api.host}:{cfg.api.port}[/]")
    uvicorn.run("api.app:app", host=cfg.api.host, port=cfg.api.port, workers=cfg.api.workers)


def main() -> None:
    parser = argparse.ArgumentParser(description="Tones and Bones ML Pipeline")
    parser.add_argument(
        "--stage",
        choices=["eda", "train", "evaluate", "serve", "all"],
        default="all",
        help="Pipeline stage to run",
    )
    parser.add_argument("--config", default="configs/default.yaml", help="Config file path")
    args = parser.parse_args()

    cfg = load_config(args.config)
    set_seed(cfg.seed)

    console.rule("[bold]Tones and Bones — ML Pipeline[/]")
    console.print(f"Goal: {cfg.project.goal}")
    console.print(f"Seed: {cfg.seed}")

    stages = {
        "eda": stage_eda,
        "train": stage_train,
        "evaluate": stage_evaluate,
        "serve": stage_serve,
    }

    if args.stage == "all":
        for name in ["eda", "train", "evaluate"]:
            console.rule(f"[bold blue]Stage: {name}[/]")
            stages[name](cfg)
    else:
        stages[args.stage](cfg)


if __name__ == "__main__":
    main()
