"""Training orchestration with experiment tracking, callbacks, and safeguards."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import lightning as L
from lightning.pytorch.callbacks import (
    EarlyStopping,
    LearningRateMonitor,
    ModelCheckpoint,
    RichProgressBar,
)

if TYPE_CHECKING:
    from utils.config import Config


def build_trainer(cfg: Config) -> L.Trainer:
    """Build a Lightning Trainer from the project config."""
    tc = cfg.training
    mc = cfg.model

    callbacks = [
        ModelCheckpoint(
            dirpath=mc.checkpoint_dir,
            filename="best-{epoch:02d}-{val_loss:.4f}",
            monitor="val_loss",
            mode="min",
            save_top_k=3,
        ),
        EarlyStopping(
            monitor="val_loss",
            patience=tc.early_stopping_patience,
            mode="min",
        ),
        LearningRateMonitor(logging_interval="epoch"),
        RichProgressBar(),
    ]

    logger: L.pytorch.loggers.Logger | list[L.pytorch.loggers.Logger] | None = None
    et = cfg.experiment_tracking
    if et.backend == "mlflow":
        logger = L.pytorch.loggers.MLFlowLogger(
            experiment_name=cfg.project.name,
            tracking_uri=et.mlflow_uri,
        )
    elif et.backend == "wandb":
        logger = L.pytorch.loggers.WandbLogger(
            project=et.wandb_project,
            name=cfg.project.name,
        )

    return L.Trainer(
        max_epochs=tc.max_epochs,
        accelerator=tc.accelerator,
        devices=tc.devices,
        precision=tc.precision,
        gradient_clip_val=tc.gradient_clip_val,
        callbacks=callbacks,
        logger=logger,
        deterministic=True,
    )


def check_data_size(path: str | Path, max_gb: float = 1.0) -> bool:
    """Return True if data directory is within size limits. Raise if over limit."""
    total = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file())
    total_gb = total / (1024**3)
    if total_gb > max_gb:
        raise RuntimeError(
            f"Data size ({total_gb:.2f} GB) exceeds {max_gb} GB limit. "
            "User confirmation required before proceeding."
        )
    return True
