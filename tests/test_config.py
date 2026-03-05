"""Tests for configuration loading and validation."""

from utils.config import Config, load_config


def test_default_config():
    cfg = Config()
    assert cfg.seed == 42
    assert cfg.training.framework == "pytorch-lightning"
    assert cfg.training.max_epochs == 50
    assert cfg.model.compression.target_inference_ms == 100


def test_load_config_from_yaml():
    cfg = load_config("configs/default.yaml")
    assert cfg.project.name == "tones-and-bones"
    assert cfg.seed == 42
    assert cfg.memory.backend == "chromadb"
    assert len(cfg.project.milestones) > 0


def test_load_config_missing_file():
    cfg = load_config("nonexistent.yaml")
    assert cfg.seed == 42  # Falls back to defaults
