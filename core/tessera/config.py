"""Runtime configuration. Everything is overridable by env so tests and the offline demo stay deterministic."""
from __future__ import annotations
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("TESSERA_SERVERLESS"))
_default = Path("/tmp/tessera") if SERVERLESS else ROOT / "data"
DATA_DIR = Path(os.environ.get("TESSERA_DATA", _default))
BUNDLED_BENCH = ROOT / "static" / "benchmark.json"      # committed copy, used when data/ is empty or read-only
DOC_DIR = DATA_DIR / "docs"
DB_PATH = Path(os.environ.get("TESSERA_DB", DATA_DIR / "tessera.sqlite"))
SEED = int(os.environ.get("TESSERA_SEED", "1337"))
JWT_SECRET = os.environ.get("TESSERA_JWT_SECRET", "lab-only-secret-change-me-0123456789abcdef")  # lab world only; no real data behind it
ALLOW_TAMPER = os.environ.get("TESSERA_ALLOW_TAMPER", "1") == "1"
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
CORS_ORIGINS = os.environ.get("TESSERA_CORS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
INLINE_RUNS = bool(os.environ.get("TESSERA_INLINE_RUNS")) or SERVERLESS   # serverless freezes threads after the response, so runs execute inside the request
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 20
MAX_TEXT_CHARS = 20_000

for p in (DATA_DIR, DOC_DIR):
    p.mkdir(parents=True, exist_ok=True)
