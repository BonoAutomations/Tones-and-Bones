"""Structured, coloured logger for the sneaker agency."""
import logging
import sys
from datetime import datetime

import colorlog

_FMT = "%(log_color)s%(asctime)s [%(levelname)-8s] %(name)s%(reset)s  %(message)s"
_DATE_FMT = "%H:%M:%S"

_COLORS = {
    "DEBUG": "cyan",
    "INFO": "green",
    "WARNING": "yellow",
    "ERROR": "red",
    "CRITICAL": "bold_red",
}


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    handler = colorlog.StreamHandler(sys.stdout)
    handler.setFormatter(colorlog.ColoredFormatter(_FMT, datefmt=_DATE_FMT, log_colors=_COLORS))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger
