"""Entrypoint for running the API server."""

import uvicorn

from utils.config import load_config


def main() -> None:
    cfg = load_config()
    uvicorn.run(
        "api.app:app",
        host=cfg.api.host,
        port=cfg.api.port,
        workers=cfg.api.workers,
        reload=False,
    )


if __name__ == "__main__":
    main()
