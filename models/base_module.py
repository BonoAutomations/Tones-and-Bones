"""Base PyTorch Lightning module for all Tones-and-Bones models."""

from __future__ import annotations

from typing import Any

import lightning as L
import torch
import torch.nn as nn
import torchmetrics


class BaseMLModule(L.LightningModule):
    """Extensible base module with built-in metric tracking and logging.

    Subclass this and override `_build_model()` to define your architecture.
    """

    def __init__(
        self,
        input_dim: int = 128,
        hidden_dim: int = 256,
        output_dim: int = 1,
        learning_rate: float = 1e-3,
        task: str = "binary",
    ) -> None:
        super().__init__()
        self.save_hyperparameters()
        self.learning_rate = learning_rate
        self.task = task

        self.model = self._build_model(input_dim, hidden_dim, output_dim)
        self.loss_fn = self._build_loss()

        if task == "binary":
            self.train_acc = torchmetrics.Accuracy(task="binary")
            self.val_acc = torchmetrics.Accuracy(task="binary")
            self.val_f1 = torchmetrics.F1Score(task="binary")
            self.val_auroc = torchmetrics.AUROC(task="binary")
        elif task == "multiclass":
            self.train_acc = torchmetrics.Accuracy(task="multiclass", num_classes=output_dim)
            self.val_acc = torchmetrics.Accuracy(task="multiclass", num_classes=output_dim)
            self.val_f1 = torchmetrics.F1Score(task="multiclass", num_classes=output_dim)
            self.val_auroc = torchmetrics.AUROC(task="multiclass", num_classes=output_dim)
        else:  # regression
            self.train_acc = None
            self.val_acc = None
            self.val_f1 = None
            self.val_auroc = None

    def _build_model(self, input_dim: int, hidden_dim: int, output_dim: int) -> nn.Module:
        return nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim // 2),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, output_dim),
        )

    def _build_loss(self) -> nn.Module:
        if self.task == "binary":
            return nn.BCEWithLogitsLoss()
        elif self.task == "multiclass":
            return nn.CrossEntropyLoss()
        return nn.MSELoss()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)

    def _shared_step(self, batch: tuple[torch.Tensor, torch.Tensor], stage: str) -> torch.Tensor:
        x, y = batch
        logits = self(x)
        if self.task == "binary":
            logits = logits.squeeze(-1)
            y = y.float()
        loss = self.loss_fn(logits, y)
        self.log(f"{stage}_loss", loss, prog_bar=True, on_epoch=True)

        if self.task in ("binary", "multiclass"):
            preds = torch.sigmoid(logits) if self.task == "binary" else logits.argmax(dim=-1)
            acc = self.train_acc if stage == "train" else self.val_acc
            if acc is not None:
                acc(preds, y)
                self.log(f"{stage}_acc", acc, prog_bar=True, on_epoch=True)
        return loss

    def training_step(self, batch: Any, batch_idx: int) -> torch.Tensor:
        return self._shared_step(batch, "train")

    def validation_step(self, batch: Any, batch_idx: int) -> None:
        self._shared_step(batch, "val")
        if self.val_f1 is not None:
            x, y = batch
            logits = self(x)
            if self.task == "binary":
                preds = torch.sigmoid(logits.squeeze(-1))
            else:
                preds = logits.argmax(dim=-1)
            self.val_f1(preds, y)
            self.val_auroc(preds, y)
            self.log("val_f1", self.val_f1, on_epoch=True)
            self.log("val_auroc", self.val_auroc, on_epoch=True)

    def configure_optimizers(self) -> dict[str, Any]:
        optimizer = torch.optim.AdamW(self.parameters(), lr=self.learning_rate, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode="min", factor=0.5, patience=3
        )
        return {
            "optimizer": optimizer,
            "lr_scheduler": {"scheduler": scheduler, "monitor": "val_loss"},
        }
