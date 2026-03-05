# Tones and Bones

Luxury Sales and Marketing Automation — Production ML System

## Architecture

```
├── api/                  # FastAPI serving endpoints (health, predict, metrics)
├── configs/              # YAML configuration with Pydantic validation
├── data/                 # Data pipeline: loading, EDA, fairness, explainability
│   ├── raw/              # Raw input data (CSV/Parquet)
│   ├── processed/        # Cleaned and transformed data
│   └── features/         # Feature-engineered datasets
├── evaluation/           # Kaizen self-reflection and optimization engine
├── memory/               # RAG-based persistent memory (ChromaDB)
├── models/               # PyTorch Lightning modules, trainer, compression
│   ├── checkpoints/      # Training checkpoints
│   └── exported/         # Production-ready models (ONNX, quantized)
├── reports/              # Generated EDA, fairness, and explainability reports
├── tests/                # Test suite
└── utils/                # Config, reproducibility, privacy utilities
```

## Quick Start

```bash
# Install dependencies
pip install -e .

# Run the full pipeline
python run_pipeline.py --stage all

# Run individual stages
python run_pipeline.py --stage eda
python run_pipeline.py --stage train
python run_pipeline.py --stage evaluate
python run_pipeline.py --stage serve

# Run tests
pytest tests/ -v
```

## Core Components

| Component | Purpose |
|-----------|---------|
| **PyTorch Lightning** | Scalable, reproducible training loops |
| **ChromaDB + RAG** | Persistent memory across sessions |
| **Kaizen Engine** | Post-task self-reflection and optimization |
| **SHAP** | Model explainability and feature importance |
| **Fairlearn** | Bias detection and fairness auditing |
| **FastAPI** | Production serving with health checks |
| **MLflow / W&B** | Experiment tracking and versioning |

## Conventions

- **Seed**: 42 (fixed across all random sources)
- **Inference target**: <100ms latency
- **Privacy**: Auto-PII detection, hashing, GDPR-compliant pipelines
- **Fairness**: Mandatory audit before any deployment
