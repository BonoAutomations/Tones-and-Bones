"""Centralized configuration loader with Pydantic validation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class DataConfig(BaseModel):
    raw_dir: str = "data/raw"
    processed_dir: str = "data/processed"
    features_dir: str = "data/features"
    max_unconfirmed_size_gb: float = 1.0


class TrainingConfig(BaseModel):
    framework: str = "pytorch-lightning"
    max_epochs: int = 50
    batch_size: int = 64
    learning_rate: float = 0.001
    early_stopping_patience: int = 5
    precision: str = "16-mixed"
    accelerator: str = "auto"
    devices: str = "auto"
    gradient_clip_val: float = 1.0


class CompressionConfig(BaseModel):
    quantize: bool = True
    prune: bool = False
    target_inference_ms: int = 100


class ModelConfig(BaseModel):
    checkpoint_dir: str = "models/checkpoints"
    export_dir: str = "models/exported"
    compression: CompressionConfig = Field(default_factory=CompressionConfig)


class MemoryConfig(BaseModel):
    backend: str = "chromadb"
    persist_dir: str = "memory/chroma_store"
    embedding_model: str = "all-MiniLM-L6-v2"
    collection_name: str = "session_memory"


class EvaluationConfig(BaseModel):
    kaizen_log: str = "reports/kaizen_log.jsonl"
    fairness_report_dir: str = "reports/fairness"
    explainability_report_dir: str = "reports/explainability"
    eda_report_dir: str = "reports/eda"


class ExperimentTrackingConfig(BaseModel):
    backend: str = "mlflow"
    mlflow_uri: str = "mlruns"
    wandb_project: str = "tones-and-bones"


class ApiConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1


class ProjectConfig(BaseModel):
    name: str = "tones-and-bones"
    goal: str = ""
    milestones: list[str] = Field(default_factory=list)


class Config(BaseModel):
    project: ProjectConfig = Field(default_factory=ProjectConfig)
    seed: int = 42
    data: DataConfig = Field(default_factory=DataConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    model: ModelConfig = Field(default_factory=ModelConfig)
    experiment_tracking: ExperimentTrackingConfig = Field(
        default_factory=ExperimentTrackingConfig
    )
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    evaluation: EvaluationConfig = Field(default_factory=EvaluationConfig)
    api: ApiConfig = Field(default_factory=ApiConfig)


def load_config(path: str | Path = "configs/default.yaml") -> Config:
    """Load and validate configuration from YAML."""
    path = Path(path)
    if path.exists():
        with open(path) as f:
            raw: dict[str, Any] = yaml.safe_load(f) or {}
        return Config(**raw)
    return Config()
