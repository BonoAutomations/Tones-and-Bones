"""FastAPI application for model serving with health checks and monitoring."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ── Request / Response Schemas ──────────────────────────────────────────

class PredictRequest(BaseModel):
    features: list[float] = Field(..., min_length=1, description="Input feature vector")


class PredictResponse(BaseModel):
    prediction: float | list[float]
    inference_ms: float
    model_version: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    uptime_seconds: float


class MetricsResponse(BaseModel):
    total_requests: int
    avg_inference_ms: float
    model_version: str


# ── App State ────────────────────────────────────────────────────────────

class AppState:
    def __init__(self) -> None:
        self.model: nn.Module | None = None
        self.model_version: str = "none"
        self.start_time: float = time.time()
        self.request_count: int = 0
        self.total_inference_ms: float = 0.0


_state = AppState()


# ── App Factory ──────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Tones and Bones ML API",
        description="Production model serving endpoint for luxury sales & marketing automation",
        version="0.1.0",
    )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="healthy",
            model_loaded=_state.model is not None,
            uptime_seconds=round(time.time() - _state.start_time, 2),
        )

    @app.get("/metrics", response_model=MetricsResponse)
    def metrics() -> MetricsResponse:
        avg = (
            _state.total_inference_ms / _state.request_count
            if _state.request_count > 0
            else 0.0
        )
        return MetricsResponse(
            total_requests=_state.request_count,
            avg_inference_ms=round(avg, 3),
            model_version=_state.model_version,
        )

    @app.post("/predict", response_model=PredictResponse)
    def predict(req: PredictRequest) -> PredictResponse:
        if _state.model is None:
            raise HTTPException(status_code=503, detail="Model not loaded")

        tensor = torch.tensor([req.features], dtype=torch.float32)
        start = time.perf_counter()
        with torch.no_grad():
            output = _state.model(tensor)
        elapsed_ms = (time.perf_counter() - start) * 1000

        _state.request_count += 1
        _state.total_inference_ms += elapsed_ms

        result = output.squeeze().tolist()
        return PredictResponse(
            prediction=result,
            inference_ms=round(elapsed_ms, 3),
            model_version=_state.model_version,
        )

    @app.post("/load-model")
    def load_model(checkpoint_path: str) -> dict[str, str]:
        """Load a model checkpoint into memory for serving."""
        path = Path(checkpoint_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Checkpoint not found: {path}")
        try:
            _state.model = torch.jit.load(str(path), map_location="cpu")
            _state.model.eval()
            _state.model_version = path.stem
            return {"status": "loaded", "model": _state.model_version}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")

    return app


app = create_app()
