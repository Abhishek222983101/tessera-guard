"""Fusion: per-layer scores -> one risk number, with an honest breakdown.

risk = 100 * sigmoid(bias + sum(w_i * s_i)) over ENFORCED layers, then hard FLOORS for evidence that is conclusive by itself
(a contract violation, a decoy touch, untrusted text steering a destination). Learned-only evidence is capped (cannot DENY alone).
The waterfall is built by adding layers one at a time in fixed order, so it always sums to the pre-floor score.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional

from .models import LAYERS, WaterfallStep, Signal

BIAS = -3.2
W = {"contract": 2.2, "provenance": 3.4, "decoy": 4.0, "content": 2.0, "chain": 1.6, "context": 2.0, "sequence": 2.6, "params": 1.8, "intent": 1.8, "drift": 2.2}
LEARNED = {"sequence", "params", "intent", "drift"}
LEARNED_CAP = 59.0   # statistical evidence alone can flag (elevated) but never hold or block an action
FLOORS = {
    "decoy_touch": 85.0, "tool_drift": 80.0, "untrusted_control_mutating": 80.0, "sensitive_egress": 85.0,
    "contract_violation": 70.0, "tainted_mutation": 60.0, "untrusted_control_read": 45.0, "stolen_context": 62.0, "drift_alarm": 62.0,
}
FLOOR_LABEL = {
    "decoy_touch": "Touched a decoy no real job uses", "tool_drift": "Tool description changed since approval (rug-pull)",
    "untrusted_control_mutating": "Untrusted text chose where this action goes", "sensitive_egress": "Sensitive data is leaving to an unapproved destination",
    "contract_violation": "Outside the declared Role Contract", "tainted_mutation": "Session was hijacked-looking; write needs a human",
    "untrusted_control_read": "A document chose what to read", "stolen_context": "Valid token used from an unfamiliar host", "drift_alarm": "Sustained drift across sessions (CUSUM alarm)",
}


def sig(x: float) -> float:
    return 1 / (1 + math.exp(-x))


@dataclass
class FuseIn:
    scores: dict[str, float]
    triggers: set[str] = field(default_factory=set)
    disabled: set[str] = field(default_factory=set)
    shadow: set[str] = field(default_factory=set)


@dataclass
class FuseOut:
    risk: float
    raw: float
    waterfall: list[WaterfallStep]
    floor: Optional[dict]
    capped: bool


def band(r: float) -> str:
    return "normal" if r < 30 else "elevated" if r < 60 else "high" if r < 80 else "critical"


def fuse(inp: FuseIn) -> FuseOut:
    logit = BIAS
    wf: list[WaterfallStep] = []
    prev = 100 * sig(BIAS)
    for layer in LAYERS:
        if layer in inp.disabled or layer in inp.shadow:
            continue
        s = inp.scores.get(layer, 0.0)
        if s <= 0:
            continue
        logit += W[layer] * s
        cur = 100 * sig(logit)
        wf.append(WaterfallStep(layer=layer, delta=round(cur - prev, 2), cumulative=round(cur, 2)))
        prev = cur
    raw = 100 * sig(logit)
    base_delta = 100 * sig(BIAS)
    wf.insert(0, WaterfallStep(layer="baseline", delta=round(base_delta, 2), cumulative=round(base_delta, 2))) if False else None
    floor_name, floor_val = None, 0.0
    for t in inp.triggers:
        v = FLOORS.get(t, 0.0)
        if v > floor_val:
            floor_name, floor_val = t, v
    # contract/provenance layers disabled in ablation also disable their floors
    ablate = {"contract_violation": "contract", "untrusted_control_mutating": "provenance", "untrusted_control_read": "provenance", "decoy_touch": "decoy",
              "tool_drift": "provenance", "sensitive_egress": "provenance", "tainted_mutation": "content", "stolen_context": "context", "drift_alarm": "drift"}
    if floor_name and ablate.get(floor_name) in inp.disabled:
        floor_name, floor_val = None, 0.0
        for t in inp.triggers:
            if ablate.get(t) in inp.disabled:
                continue
            v = FLOORS.get(t, 0.0)
            if v > floor_val:
                floor_name, floor_val = t, v
    risk = raw
    capped = False
    hard = [t for t in inp.triggers if ablate.get(t) not in inp.disabled]
    if not hard and not any(l not in LEARNED and inp.scores.get(l, 0) > 0.3 and l not in inp.disabled and l not in inp.shadow for l in W):
        if risk > LEARNED_CAP:
            risk, capped = LEARNED_CAP, True
    floor = None
    if floor_name and floor_val > risk:
        wf.append(WaterfallStep(layer="floor", delta=round(floor_val - risk, 2), cumulative=round(floor_val, 2)))
        floor = {"name": floor_name, "value": floor_val, "label": FLOOR_LABEL[floor_name]}
        risk = floor_val
    risk = min(risk, 99.0)
    return FuseOut(round(risk, 1), round(raw, 1), wf, floor, capped)


def session_risk(step_risks: list[float]) -> float:
    """Noisy-OR over meaningful steps so many 'a little odd' steps still add up (slow-ramp evasion)."""
    miss = 1.0
    for r in step_risks:
        if r >= 30:
            miss *= 1 - min(0.95, (r / 100) ** 2)
    return round(100 * (1 - miss), 1)


def counterfactuals(inp: FuseIn, current: float) -> list[dict]:
    """Smallest what-ifs that would have made the action look normal."""
    def run(name: str, mod) -> Optional[dict]:
        s = dict(inp.scores); t = set(inp.triggers); mod(s, t)
        out = fuse(FuseIn(s, t, inp.disabled, inp.shadow))
        if out.risk >= current - 5:
            return None
        return {"label": name, "risk_after": out.risk, "band_after": band(out.risk)}
    cands = []
    def trusted_arg(s, t): s["provenance"] = 0; t -= {"untrusted_control_mutating", "untrusted_control_read", "sensitive_egress"}
    def allow_dest(s, t): t -= {"untrusted_control_mutating", "sensitive_egress"}; s["provenance"] = min(s.get("provenance", 0), 0.1)
    def no_hidden(s, t): s["content"] = 0; s["provenance"] = 0; t -= {"tainted_mutation", "untrusted_control_mutating", "untrusted_control_read", "sensitive_egress"}
    def in_contract(s, t): s["contract"] = 0; t -= {"contract_violation"}
    def normal_seq(s, t): s["sequence"] = 0; s["intent"] = 0; s["params"] = 0
    def known_host(s, t): s["context"] = 0; t -= {"stolen_context"}
    def not_decoy(s, t): s["decoy"] = 0; t -= {"decoy_touch"}
    for name, mod, cond in [
        ("If the destination or path came from the user or a trusted system, not from document text", trusted_arg, bool(inp.triggers & {"untrusted_control_mutating", "untrusted_control_read"})),
        ("If the destination were on the role's egress allow-list", allow_dest, bool(inp.triggers & {"untrusted_control_mutating", "sensitive_egress"})),
        ("If the document had no hidden or injected instruction", no_hidden, inp.scores.get("content", 0) > 0.3 or "tainted_mutation" in inp.triggers),
        ("If this tool and data were inside the Role Contract", in_contract, "contract_violation" in inp.triggers),
        ("If this step matched the agent's normal behaviour", normal_seq, any(inp.scores.get(l, 0) > 0.3 for l in LEARNED)),
        ("If the call came from the agent's usual host", known_host, "stolen_context" in inp.triggers),
        ("If the file were not a decoy", not_decoy, "decoy_touch" in inp.triggers),
    ]:
        if cond:
            r = run(name, mod)
            if r:
                cands.append(r)
    # all applicable fixes together = "what a normal version of this action looks like"
    s, t = dict(inp.scores), set(inp.triggers)
    for name, mod, cond in [("", trusted_arg, "untrusted" in " ".join(t)), ("", allow_dest, True), ("", no_hidden, True), ("", in_contract, "contract_violation" in t), ("", normal_seq, True), ("", known_host, "stolen_context" in t), ("", not_decoy, "decoy_touch" in t)]:
        if cond:
            mod(s, t)
    allout = fuse(FuseIn(s, t, inp.disabled, inp.shadow))
    cands.sort(key=lambda c: c["risk_after"])
    cands = cands[:3]
    if allout.risk < current - 5:
        cands.append({"label": "If all of the above were true (a normal version of this action)", "risk_after": allout.risk, "band_after": band(allout.risk)})
    return cands
