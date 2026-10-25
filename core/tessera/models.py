"""The frozen wire contracts. Mirrors SYSTEM-ARCHITECTURE.md §6.1 (trimmed). `contracts/*.schema.json` is generated from these."""
from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

Decision = Literal["ALLOW", "DENY", "MODIFY", "STEP_UP", "DEFER"]
Band = Literal["normal", "elevated", "high", "critical"]
Effect = Literal["read", "write", "egress", "exec", "delegate"]
Trust = Literal["trusted", "mixed", "untrusted"]
Layer = Literal["contract", "provenance", "sequence", "params", "intent", "content", "drift", "context", "chain", "decoy"]
LAYERS: list[str] = ["contract", "provenance", "decoy", "content", "chain", "context", "sequence", "params", "intent", "drift"]


class Evidence(BaseModel):
    text: str
    ref: Optional[str] = None          # chunk id / doc id / policy id
    bbox: Optional[list[float]] = None  # [x0,y0,x1,y1] on page
    page: Optional[int] = None
    doc: Optional[str] = None


class Signal(BaseModel):
    layer: str
    score: float = 0.0                 # 0..1
    flags: list[str] = []
    evidence: list[Evidence] = []
    shadow: bool = False               # scored but not enforced (cold-start maturity)
    latency_ms: float = 0.0


class ArgOrigin(BaseModel):
    origin: Literal["user", "trusted_tool", "untrusted_chunk", "model_unknown", "mixed"]
    source_id: Optional[str] = None    # chunk id
    source_label: Optional[str] = None
    trust: Trust = "trusted"
    control: bool = False              # control arg (destination/path/recipient) vs data arg
    match: Optional[str] = None        # exact | normalized | fuzzy | numeric


class ActionEvent(BaseModel):
    id: str
    ts: float
    session_id: str
    step: int
    agent_id: str
    role: str
    tool: str
    effect: Effect
    data_class: str
    args: dict[str, Any]
    arg_origins: dict[str, ArgOrigin] = {}
    session_integrity: str = "trusted"
    session_confidentiality: str = "low"
    origin_host: str = "agent-runtime-01"
    via: str = "agent"                 # agent | stolen_token | lab
    delegation: dict[str, Any] = {}
    iam: dict[str, Any] = {}           # what classic IAM said


class WaterfallStep(BaseModel):
    layer: str
    delta: float
    cumulative: float


class Verdict(BaseModel):
    id: str
    event_id: str
    ts: float
    session_id: str
    step: int
    agent_id: str
    role: str
    tool: str
    effect: str
    args: dict[str, Any]
    arg_origins: dict[str, ArgOrigin] = {}
    decision: Decision
    reason_code: str
    risk: float
    band: Band
    signals: list[Signal]
    waterfall: list[WaterfallStep]
    floor: Optional[dict[str, Any]] = None
    session_risk: float = 0.0
    containment_level: int = 0
    summary: str = ""
    iam: dict[str, Any] = {}
    cedar: dict[str, Any] = {}
    safe_alternative: Optional[str] = None
    approval_id: Optional[str] = None
    case_id: Optional[str] = None
    receipt_id: Optional[str] = None
    latency_ms: float = 0.0
    executed: bool = False
    output_chunk: Optional[str] = None
    via: str = "agent"
    counterfactual: list[dict[str, Any]] = []
    kind: str = "attack"               # attack | unexplained_shift | benign
    hour: int = 11                     # hour of day the call happened (lab clock)


class Case(BaseModel):
    id: str
    agent_id: str
    role: str
    session_id: str
    opened_ts: float
    updated_ts: float
    status: Literal["open", "contained", "resolved"] = "open"
    severity: Band = "elevated"
    max_risk: float = 0.0
    title: str = ""
    summary: str = ""
    owasp: list[str] = []
    kind: str = "attack"
    verdict_ids: list[str] = []
    containment_level: int = 0
    patient_zero: Optional[str] = None
    root_cause: Optional[dict[str, Any]] = None    # {doc, chunk, text, bbox, page, step}
    utility: dict[str, Any] = {}


class Receipt(BaseModel):
    id: str
    idx: int
    prev_hash: str
    payload_hash: str
    ts: float
    kind: str
    payload: dict[str, Any]
    signer: str
    sig: str


class ChangeEvent(BaseModel):
    id: str
    role: str
    kind: Literal["new_tool_version", "new_task_type", "volume_surge", "model_update"]
    tool: Optional[str] = None
    description: str = ""
    start_ts: float
    end_ts: float
    declared_by: str = "ops"
