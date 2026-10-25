#!/usr/bin/env bash
cd "$(dirname "$0")/.." && exec uv run uvicorn tessera.api.app:app --host 0.0.0.0 --port ${PORT:-8080} --log-level warning
