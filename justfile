# TESSERA Live Lab — everything from one place.   `just up` opens http://localhost:3000
set shell := ["bash", "-cu"]

default: up

# core (:8080) + console (:3000)
up:
    cd core && uv sync -q
    cd web && pnpm install --silent && pnpm build
    (cd core && PORT=8080 ./scripts/serve.sh &) ; sleep 3
    cd web && pnpm start -p 3000

core:
    cd core && ./scripts/serve.sh

web:
    cd web && pnpm dev -p 3000

test:
    cd core && PYTHONPATH=. uv run pytest -q

eval:
    cd core && PYTHONPATH=. TESSERA_DATA=data/eval uv run python -m tessera.eval && cp data/eval/benchmark.json data/benchmark.json

scenarios:
    cd core && PYTHONPATH=. uv run python scripts/run_scenarios.py S1 S2 S3 S4 S5 S6 S7:declared S7:undeclared S8

replay:
    cd core && PYTHONPATH=. uv run python scripts/record_replay.py

shots:
    node docs/tools/shots-all.mjs

smoke:
    cd core && PYTHONPATH=. uv run python scripts/smoke_api.py
