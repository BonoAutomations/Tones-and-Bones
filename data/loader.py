"""Data loading and validation pipeline with Pydantic schemas."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from pydantic import BaseModel, Field


class DatasetMeta(BaseModel):
    """Metadata for a loaded dataset."""

    name: str
    rows: int
    columns: int
    column_names: list[str]
    dtypes: dict[str, str]
    missing_counts: dict[str, int]
    size_mb: float


class DataPipeline:
    """Unified data loading, validation, and preprocessing pipeline."""

    def __init__(self, data_dir: str = "data/raw") -> None:
        self.data_dir = Path(data_dir)

    def load_csv(self, filename: str, **kwargs: Any) -> tuple[pd.DataFrame, DatasetMeta]:
        """Load a CSV file and return the DataFrame with validated metadata."""
        path = self.data_dir / filename
        df = pd.read_csv(path, **kwargs)
        meta = DatasetMeta(
            name=filename,
            rows=len(df),
            columns=len(df.columns),
            column_names=list(df.columns),
            dtypes={col: str(dtype) for col, dtype in df.dtypes.items()},
            missing_counts={col: int(df[col].isna().sum()) for col in df.columns},
            size_mb=round(df.memory_usage(deep=True).sum() / (1024**2), 2),
        )
        return df, meta

    def load_parquet(self, filename: str, **kwargs: Any) -> tuple[pd.DataFrame, DatasetMeta]:
        """Load a Parquet file and return the DataFrame with validated metadata."""
        path = self.data_dir / filename
        df = pd.read_parquet(path, **kwargs)
        meta = DatasetMeta(
            name=filename,
            rows=len(df),
            columns=len(df.columns),
            column_names=list(df.columns),
            dtypes={col: str(dtype) for col, dtype in df.dtypes.items()},
            missing_counts={col: int(df[col].isna().sum()) for col in df.columns},
            size_mb=round(df.memory_usage(deep=True).sum() / (1024**2), 2),
        )
        return df, meta

    @staticmethod
    def validate_no_leakage(
        train_df: pd.DataFrame, val_df: pd.DataFrame, id_col: str
    ) -> bool:
        """Verify there is no data leakage between train and validation sets."""
        overlap = set(train_df[id_col]) & set(val_df[id_col])
        if overlap:
            raise ValueError(
                f"Data leakage detected: {len(overlap)} shared IDs between train and val sets."
            )
        return True
