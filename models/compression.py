"""Model compression utilities — quantization and pruning for production."""

from __future__ import annotations

import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.quantization as quant


def quantize_model(model: nn.Module, calibration_data: torch.Tensor | None = None) -> nn.Module:
    """Apply dynamic quantization for CPU inference."""
    quantized = quant.quantize_dynamic(model, {nn.Linear}, dtype=torch.qint8)
    return quantized


def prune_model(model: nn.Module, amount: float = 0.3) -> nn.Module:
    """Apply unstructured L1 pruning to all Linear layers."""
    import torch.nn.utils.prune as prune

    for name, module in model.named_modules():
        if isinstance(module, nn.Linear):
            prune.l1_unstructured(module, name="weight", amount=amount)
            prune.remove(module, "weight")
    return model


def benchmark_inference(
    model: nn.Module,
    input_shape: tuple[int, ...],
    n_runs: int = 100,
    device: str = "cpu",
) -> dict[str, float]:
    """Benchmark model inference latency."""
    model = model.to(device).eval()
    dummy = torch.randn(*input_shape, device=device)

    # Warmup
    for _ in range(10):
        with torch.no_grad():
            model(dummy)

    times: list[float] = []
    for _ in range(n_runs):
        start = time.perf_counter()
        with torch.no_grad():
            model(dummy)
        times.append((time.perf_counter() - start) * 1000)

    return {
        "mean_ms": sum(times) / len(times),
        "p50_ms": sorted(times)[len(times) // 2],
        "p95_ms": sorted(times)[int(len(times) * 0.95)],
        "p99_ms": sorted(times)[int(len(times) * 0.99)],
    }


def export_onnx(
    model: nn.Module,
    input_shape: tuple[int, ...],
    output_path: str | Path,
) -> Path:
    """Export model to ONNX format for cross-platform deployment."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(*input_shape)
    torch.onnx.export(
        model,
        dummy,
        str(output_path),
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )
    return output_path
