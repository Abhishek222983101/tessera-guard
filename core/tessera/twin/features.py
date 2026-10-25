"""Features: the ONE implementation used for training and serving (no train/serve skew; tests/test_parity.py proves it)."""
from __future__ import annotations
import math, re
from typing import Any

from ..sim.catalog import TOOLS, classify_path, resolve
from ..provenance.ledger import extract_destination

NUMERIC_PARAMS = {"amount_inr", "quantity"}


def tok(tool: str, args: dict[str, Any]) -> str:
    """Behaviour token: tool, refined by the data class for file reads (a read of /hr/ is a different behaviour than a read of /docs/)."""
    if tool == "files.read":
        dc, _, _ = classify_path(str(args.get("path", "")))
        return f"files.read:{dc}"
    return tool


def step_features(tool: str, args: dict[str, Any], hour: int = 11, bytes_out: int = 0) -> dict[str, Any]:
    dc, _, decoy = resolve(tool, args)
    f: dict[str, Any] = {"tok": tok(tool, args), "tool": tool, "dc": dc, "effect": TOOLS[tool].effect, "hour": hour, "bytes_out": bytes_out,
                         "dest": extract_destination(tool, args), "decoy": decoy}
    for k in NUMERIC_PARAMS:
        if k in args and isinstance(args[k], (int, float)) and not isinstance(args[k], bool):
            f[k] = float(args[k])
    f["text"] = action_text(tool, args, dc)
    return f


def action_text(tool: str, args: dict[str, Any], dc: str) -> str:
    parts = [tool.replace(".", " ").replace("_", " "), dc.replace(".", " ")]
    for k in ("path", "url", "to", "query", "task"):
        if k in args:
            v = str(args[k]).lower()
            parts.append(re.sub(r"[^a-z0-9]+", " ", v))
    return " ".join(parts)


def session_stats(steps: list[dict[str, Any]]) -> dict[str, float]:
    bo = sum(s.get("bytes_out", 0) for s in steps)
    toks = [s["tok"] for s in steps]
    eg = [s.get("bytes_out", 0) for s in steps if s.get("bytes_out", 0) > 0]
    return {"steps": len(steps), "bytes_out": float(bo), "egress_calls": len(eg), "per_egress": (sum(eg) / len(eg)) if eg else 0.0, "distinct_dest": len({s["dest"] for s in steps if s.get("dest")}),
            "uniq_tools": len(set(toks))}


def mix_vector(toks: list[str], vocab: list[str]) -> list[float]:
    n = max(1, len(toks))
    return [toks.count(v) / n for v in vocab]


def psi(expected: list[float], actual: list[float], eps: float = 1e-3) -> float:
    s = 0.0
    for e, a in zip(expected, actual):
        e, a = max(e, eps), max(a, eps)
        s += (a - e) * math.log(a / e)
    return s
