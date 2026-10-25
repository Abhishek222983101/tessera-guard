"""The Policy Enforcement Point. Every tool call from every agent passes through `Gateway.handle`.

Pipeline (cheapest first): IAM (what classic security sees) -> provenance (APM) -> Cedar (Role Contract) -> content/decoy/chain/context
-> learned twin layers -> fusion -> decision -> containment gate -> execute -> label output -> receipt -> case.
"""
from __future__ import annotations
import re, time, uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from . import contain as C, fusion as FU, identity as ID
from .bus import BUS
from .models import ActionEvent, Case, ChangeEvent, Evidence, LAYERS, Signal, Verdict
from .policy import cedar as CD, contract as CT
from .provenance import ledger as LG, hidden as HD
from .receipts import CHAIN
from .sim import docs as DOCS, tools as TL
from .sim.catalog import TOOLS, resolve
from .twin import features as F
from .twin.model import STORE, AgentTwin

SENSITIVE = {"hr.confidential", "finance.confidential", "customer.pii"}
MUTATING = {"write", "exec", "delegate"}
OWASP = {"untrusted_control_mutating": "ASI01", "untrusted_control_read": "ASI01", "tainted_mutation": "ASI01", "contract_violation": "ASI02",
         "tool_drift": "ASI04", "decoy_touch": "ASI06", "sensitive_egress": "ASI06", "stolen_context": "ASI03", "drift_alarm": "ASI01", "chain": "ASI07"}
OWASP_NAME = {"ASI01": "Agent goal hijack", "ASI02": "Tool misuse", "ASI03": "Identity & privilege abuse", "ASI04": "Agentic supply chain", "ASI06": "Memory/data poisoning & exfiltration", "ASI07": "Insecure inter-agent communication"}
POLICY_TEXT = {
    "forbid.never_read": "Role Contract: this role may never read {dc} data",
    "forbid.decoy": "A decoy file that no legitimate job uses was accessed",
    "forbid.egress_after_sensitive": "Sensitive data was read in this session; sending out to an unapproved destination is forbidden",
    "forbid.untrusted_control_arg": "Text from untrusted content chose where this action goes",
    "forbid.tool_drift": "The tool's description changed after it was approved",
    "default_deny.no_permit": "Role Contract does not permit this tool / these arguments for this role",
}


@dataclass
class Session:
    id: str
    agent_id: str
    role: str
    task: str
    started: float = field(default_factory=time.time)
    user: LG.Chunk = None  # type: ignore
    chunks: list[LG.Chunk] = field(default_factory=list)
    feats: list[dict] = field(default_factory=list)
    verdicts: list[Verdict] = field(default_factory=list)
    integrity: str = "trusted"
    confidentiality: str = "low"
    bytes_out: int = 0
    step: int = 0
    via: str = "agent"
    host: str = ""
    ended: bool = False
    case_ids: dict[str, str] = field(default_factory=dict)
    inherited_taint: bool = False
    delegated_by: Optional[str] = None
    origin_agent: Optional[str] = None
    depth: int = 0
    injection_chunk: Optional[str] = None
    disabled: set[str] = field(default_factory=set)
    protection: str = "tessera"
    run_id: Optional[str] = None
    max_risk: float = 0.0
    hour: int = 11


class Gateway:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.contracts: dict[str, dict] = {}
        self.cont = C.Containment()
        self.changes: list[ChangeEvent] = []
        self.approvals: dict[str, dict] = {}
        self.cases: dict[str, Case] = {}
        self.verdicts: dict[str, Verdict] = {}
        self.chunks: dict[str, LG.Chunk] = {}
        self.chain_edges: list[dict] = []
        self.latencies: list[float] = []
        self.delegate_cb: Optional[Callable] = None
        self.agent_windows: dict[str, list[float]] = {}
        self.stats = {"calls": 0}
        self.trails: dict[str, list[dict]] = {}

    # ------------------------------------------------------------ setup
    def reset(self):
        self.__init__()  # type: ignore[misc]
        self.load_default_contracts()

    def load_default_contracts(self):
        for role, text in CT.DEFAULT_CONTRACTS.items():
            self.set_contract(role, text)

    def set_contract(self, role: str, text: str):
        c = CT.parse(text)
        comp = CD.compile_contract(c)
        self.contracts[role] = {"yaml": text, "contract": c, "compiled": comp}

    def active_changes(self, role: str) -> list[ChangeEvent]:
        now = time.time()
        return [c for c in self.changes if c.role == role and c.start_ts <= now <= c.end_ts]

    # ------------------------------------------------------------ sessions
    def start_session(self, agent_id: str, task: str, via: str = "agent", host: Optional[str] = None, disabled: Optional[set] = None,
                      protection: str = "tessera", inherit: Optional[dict] = None, run_id: Optional[str] = None, hour: int = 11) -> Session:
        a = ID.REGISTRY.get(agent_id)
        if not a:
            raise KeyError("unknown agent")
        sid = "ses_" + uuid.uuid4().hex[:8]
        s = Session(sid, agent_id, a.role, task[:500], via=via, host=host or a.hosts[0], disabled=set(disabled or ()), protection=protection, run_id=run_id, hour=hour)
        s.user = LG.Chunk(f"ck_{sid}_u", sid, 0, "user", "your task", "trusted", task[:500])
        s.chunks.append(s.user)
        if inherit:
            s.delegated_by, s.origin_agent, s.depth = inherit["from"], inherit.get("origin") or inherit["from"], inherit.get("depth", 1)
            ck = LG.Chunk(f"ck_{sid}_h", sid, 0, f"agent:{inherit['from']}", f"handoff from {inherit['from']}", "untrusted" if inherit.get("tainted") else "trusted",
                          inherit.get("task", ""), inherited=True, injection_score=inherit.get("injection", 0.0))
            s.chunks.append(ck); self.chunks[ck.id] = ck
            if inherit.get("tainted"):
                s.inherited_taint = True; s.integrity = "tainted"
        self.sessions[sid] = s
        if len(self.sessions) > 600:
            for k in [k for k, x in self.sessions.items() if x.ended][:200]:
                self.sessions.pop(k, None)
        if len(self.verdicts) > 30000:
            for k in list(self.verdicts)[:10000]:
                self.verdicts.pop(k, None)
        self.cont.start_session(agent_id, sid)
        BUS.publish("session", {"session_id": sid, "agent_id": agent_id, "task": task[:200], "state": "started", "run_id": run_id})
        return s

    def end_session(self, sid: str, utility: Optional[dict] = None) -> dict:
        s = self.sessions.get(sid)
        if not s:
            raise KeyError("unknown session")
        if s.ended:
            return {"session_id": sid, "already": True}
        s.ended = True
        tw = STORE.twin(s.agent_id, s.role)
        clean = s.max_risk < 30 and not s.case_ids
        if s.feats:
            STORE.observe_session(tw, s.feats, clean=clean, risk=s.max_risk)
        tw.risk_history.append({"ts": time.time(), "risk": s.max_risk})
        tw.risk_history = tw.risk_history[-120:]
        BUS.publish("session", {"session_id": sid, "agent_id": s.agent_id, "task": s.task[:200], "state": "ended", "utility": utility, "run_id": s.run_id})
        return {"session_id": sid, "clean": clean}

    # ------------------------------------------------------------ the pipeline
    def handle(self, agent_id: str, session_id: str, tool: str, args: dict, *, token: Optional[str] = None, approval_id: Optional[str] = None,
               via: Optional[str] = None, host: Optional[str] = None) -> Verdict:
        t0 = time.perf_counter()
        a = ID.REGISTRY.get(agent_id)
        s = self.sessions.get(session_id)
        if not a or not s or s.agent_id != agent_id:
            raise KeyError("unknown agent or session")
        if tool not in TOOLS:
            raise ValueError(f"unknown tool '{tool}'")
        args = _clean_args(args)
        via = via or s.via
        host = host or s.host
        s.step += 1
        step = s.step
        approved = bool(approval_id and self.approvals.get(approval_id, {}).get("status") == "approved")
        iam = ID.iam_check(token or a.token(), tool, ID.REGISTRY)
        dc, out_trust, decoy = resolve(tool, args)
        con = self.contracts[a.role]["contract"]
        comp = self.contracts[a.role]["compiled"]
        level_before = self.cont.effective(agent_id, session_id)
        dis = s.disabled

        # ---- classic-IAM-only mode (protection off): shows what happens without TESSERA
        if s.protection == "iam_only":
            return self._iam_only(a, s, tool, args, step, iam, dc, t0)
        if not iam["valid"] or not iam["scope_ok"] or a.killed:
            return self._finish_denied_iam(a, s, tool, args, step, iam, t0, dc)

        # ---- L1 provenance
        origins, any_ut_ctrl, extras = LG.apm(tool, args, s.chunks, s.task)
        dest = LG.extract_destination(tool, args)
        dest_ok = LG.domain_allowed(dest, con.egress_allowlist)
        if "provenance" in dis:
            any_ut_ctrl = False
        rule = con.tools.get(tool)
        ctx_args: dict[str, Any] = {}
        for k in ("amount_inr", "quantity"):
            if k in args and isinstance(args[k], (int, float)) and not isinstance(args[k], bool):
                ctx_args[k] = int(args[k])
        if "supplier_id" in args:
            ctx_args["supplier_in_catalog"] = str(args["supplier_id"]) in TL.SUPPLIERS
        if tool == "files.read":
            ctx_args["path_in_scope"] = CD.glob_match(str(args.get("path", "")), rule.paths) if rule and rule.paths else True
        if tool == "purchasing.create_request" and "supplier_in_catalog" not in ctx_args:
            ctx_args["supplier_in_catalog"] = False
        carries = extras["carries_sensitive"] and not dest_ok
        ctx = {"args": ctx_args, "session": {"integrity": s.integrity, "confidentiality": s.confidentiality},
               "egress_allowed_after_sensitive": bool(dest_ok and not extras["carries_sensitive"]),
               "provenance": {"any_untrusted_arg": bool(any_ut_ctrl)}, "dest_allowlisted": bool(dest_ok),
               "approval": {"valid": approved}, "tool_schema_hash": TL.WORLD.live_hash(tool)}
        # ---- L0 Cedar
        tc = time.perf_counter()
        if "contract" in dis:
            cedar = {"decision": "Allow", "policies": ["ablated"], "errors": []}
        else:
            try:
                cedar = CD.evaluate(comp, agent_id, tool, dc, decoy, ctx)
            except Exception as e:  # fail closed
                cedar = {"decision": "Deny", "policies": ["engine_error"], "errors": [str(e)[:200]]}
        cedar_ms = (time.perf_counter() - tc) * 1000

        triggers: set[str] = set()
        scores: dict[str, float] = {l: 0.0 for l in LAYERS}
        signals: list[Signal] = []
        pol = cedar["policies"]
        if cedar["decision"] == "Deny":
            scores["contract"] = 1.0
            ev = [Evidence(text=POLICY_TEXT.get(p, p).format(dc=dc), ref=p) for p in pol] or [Evidence(text="denied by Role Contract")]
            if "forbid.untrusted_control_arg" in pol:
                triggers.add("untrusted_control_mutating")
            if "forbid.egress_after_sensitive" in pol:
                triggers.add("sensitive_egress")
            if "forbid.tool_drift" in pol:
                triggers.add("tool_drift")
            if "forbid.decoy" in pol:
                triggers.add("decoy_touch")
            if set(pol) & {"default_deny.no_permit", "forbid.never_read", "engine_error"}:
                triggers.add("contract_violation")
            signals.append(Signal(layer="contract", score=1.0, flags=["cedar_deny"] + pol, evidence=ev, latency_ms=round(cedar_ms, 3)))
        else:
            signals.append(Signal(layer="contract", score=0.0, flags=["cedar_allow"] + pol, latency_ms=round(cedar_ms, 3)))

        # provenance signal
        pv_flags, pv_ev, pv = [], [], 0.0
        if any_ut_ctrl and "provenance" not in dis:
            names = extras["untrusted_control"]
            for n in names:
                o = origins[n]
                pv_ev.append(Evidence(text=f"{n} = {str(args[n])[:80]!r} came from untrusted content “{o.source_label}” ({o.match} match)", ref=o.source_id))
            pv = 1.0 if TOOLS[tool].effect != "read" else 0.6
            pv_flags.append("untrusted_control_arg")
            if not approved:
                triggers.add("untrusted_control_mutating" if TOOLS[tool].effect != "read" else "untrusted_control_read")
        if carries and "provenance" not in dis:
            pv = 1.0; pv_flags.append("sensitive_data_in_egress"); triggers.add("sensitive_egress")
            pv_ev.append(Evidence(text="the payload contains text from a sensitive file read earlier in this session", ref=(extras["sensitive_chunks"] or [None])[0]))
        if TL.WORLD.live_hash(tool) != TOOLS[tool].pinned_hash and "provenance" not in dis:
            pv = 1.0; pv_flags.append("tool_schema_drift"); triggers.add("tool_drift")
            pv_ev.append(Evidence(text=f"{tool} description hash changed from {TOOLS[tool].pinned_hash} to {TL.WORLD.live_hash(tool)} after approval"))
        scores["provenance"] = pv
        signals.append(Signal(layer="provenance", score=pv, flags=pv_flags, evidence=pv_ev))
        # decoy
        if decoy and "decoy" not in dis:
            scores["decoy"] = 1.0; triggers.add("decoy_touch")
        signals.append(Signal(layer="decoy", score=scores["decoy"], flags=["decoy_touched"] if decoy else [],
                              evidence=[Evidence(text=f"{args.get('path') or tool} is a decoy: no legitimate task ever touches it")] if decoy else []))
        # content (what this session has read)
        ct, ctev = 0.0, []
        if s.injection_chunk:
            ch = self.chunks[s.injection_chunk]
            ct = min(1.0, max(0.55, ch.injection_score)) * (1.0 if ch.hidden_text else 0.9)
            h0 = ch.hidden[0] if ch.hidden else None
            ctev.append(Evidence(text=f"this session read “{ch.label}” which contains " + (f"hidden text ({h0['kind'].replace('_', ' ')}, page {h0['page']}) " if h0 else "") + f"with instruction-like content (score {ch.injection_score:.2f})",
                                 ref=ch.id, bbox=h0["bbox"] if h0 else None, page=h0["page"] if h0 else None, doc=ch.doc_id))
        if "content" in dis:
            ct = 0.0
        scores["content"] = ct
        signals.append(Signal(layer="content", score=round(ct, 3), flags=["injection_in_session"] if ct else [], evidence=ctev))
        if ct >= 0.5 and TOOLS[tool].effect in ("write", "exec") and not approved:
            triggers.add("tainted_mutation")
        # chain
        ch_s = 0.0
        if s.inherited_taint and "chain" not in dis:
            ch_s = 0.8
            if TOOLS[tool].effect in ("write", "exec") and not approved:
                triggers.add("tainted_mutation")
        scores["chain"] = ch_s
        signals.append(Signal(layer="chain", score=ch_s, flags=["inherited_taint"] if ch_s else [],
                              evidence=[Evidence(text=f"this session was started by {s.delegated_by} whose context was tainted (origin: {s.origin_agent}, depth {s.depth})")] if ch_s else []))
        # context (identity binding)
        cx = 0.0
        if host not in a.hosts and "context" not in dis:
            cx = 0.9; triggers.add("stolen_context")
        signals.append(Signal(layer="context", score=cx, flags=["unfamiliar_host"] if cx else [],
                              evidence=[Evidence(text=f"valid token presented from {host}, agent normally runs on {', '.join(a.hosts)}")] if cx else []))
        # learned layers
        eff_ = TOOLS[tool].effect
        tw = STORE.twin(agent_id, a.role, mature=(not agent_id.startswith("agt_new")) and agent_id in _SEEDED())
        prev = ["<s>", "<s>"] + [f["tok"] for f in s.feats]
        hour = s.hour
        bo = len(str(args.get("body", "")).encode()) + len(str(args.get("subject", "")).encode()) if TOOLS[tool].effect == "egress" else 0
        f = F.step_features(tool, args, hour, bo)
        win = sum(tw.days_bytes[-9:])
        sess_ctx = {"bytes_out": s.bytes_out + bo, "dest_allowlisted": dest_ok, "budget_bytes_session": con.budgets.max_bytes_out_per_session,
                    "budget_bytes_day": con.budgets.max_bytes_out_per_day, "window_bytes": win}
        tl = time.perf_counter()
        lsigs = STORE.score(tw, f, prev[-2], prev[-1], sess_ctx, self.active_changes(a.role))
        for ls in lsigs:
            if ls.layer in dis:
                ls.score = 0.0
        signals.extend(lsigs)
        for ls in lsigs:
            scores[ls.layer] = ls.score
        shadow = {ls.layer for ls in lsigs if ls.shadow}
        if tw.alarm and "drift" not in dis and "drift" not in shadow and eff_ != "read" and not approved:
            triggers.add("drift_alarm")

        # ---- fusion
        fin = FU.FuseIn(scores=dict(scores), triggers=set(triggers), disabled=set(dis), shadow=shadow)
        out = FU.fuse(fin)
        s.feats.append(f)
        step_risk = out.risk
        sr = FU.session_risk([v.risk for v in s.verdicts] + [step_risk])
        risk = min(79.0, step_risk + min(15.0, 0.2 * (sr - step_risk))) if (sr > step_risk and step_risk >= 30 and step_risk < 79) else step_risk
        b = FU.band(risk)

        # ---- decision
        eff = TOOLS[tool].effect
        decision, reason = "ALLOW", "OK"
        if cedar["decision"] == "Deny":
            decision, reason = "DENY", _reason_from(pol)
        elif any(w for w in [s.step > con.budgets.max_steps_per_session]):
            decision, reason = "DENY", "BUDGET_STEPS"
        elif (s.bytes_out + bo) > con.budgets.max_bytes_out_per_session and eff == "egress":
            decision, reason = "DENY", "BUDGET_EGRESS_SESSION"
        elif win + s.bytes_out + bo > con.budgets.max_bytes_out_per_day and eff == "egress" and "drift" not in dis:
            decision, reason = "DENY", "BUDGET_EGRESS_WINDOW"
        elif tw.alarm and eff == "egress" and "drift" not in dis and "drift" not in shadow and not approved:
            decision, reason = "STEP_UP", "DRIFT_ALARM_EGRESS_HELD"
        elif "tainted_mutation" in triggers and not approved:
            decision, reason = "STEP_UP", "TAINTED_SESSION_NEEDS_APPROVAL"
        elif rule and rule.step_up_over and not approved and any(k in args and isinstance(args[k], (int, float)) and args[k] > v for k, v in rule.step_up_over.items()):
            decision, reason = "STEP_UP", "OVER_LIMIT_NEEDS_APPROVAL"
        elif risk >= 80 and not approved:
            decision, reason = ("DENY", "RISK_CRITICAL") if eff != "read" else ("STEP_UP", "RISK_CRITICAL_READ")
        elif risk >= 60 and eff != "read" and not approved:
            decision, reason = "STEP_UP", "RISK_HIGH_NEEDS_APPROVAL"
        # ---- containment gate (after Cedar/risk decisions)
        if decision == "ALLOW":
            ov, why = C.gate(level_before, eff, dest_ok, any_ut_ctrl, approved)
            if ov == "DENY":
                decision, reason = "DENY", why
            elif ov == "STEP_UP":
                decision, reason = "STEP_UP", why
            elif ov == "MODIFY":
                decision, reason = "MODIFY", why
            elif ov == "ALLOW" and why == "TARPIT":
                reason = "TARPIT"
        tarpit = reason == "TARPIT" or level_before == 4

        # ---- execute
        executed, output, chunk_id = False, None, None
        if decision in ("ALLOW", "MODIFY"):
            try:
                res = TL.execute(tool, args, agent_id, tarpit=tarpit)
                output = res["output"]
                executed = True
                if decision == "MODIFY":
                    output, res = _sanitise(output, res)
                chunk_id = self._label_output(s, step, tool, args, res, output)
                s.bytes_out += res.get("bytes_out", 0)
                if res.get("decoy"):
                    pass
                if tool == "agent.delegate" and self.delegate_cb and decision == "ALLOW":
                    self.delegate_cb(s, args, self)
            except TL.ToolError as e:
                output, reason = f"tool error: {e}", "TOOL_ERROR"
        # session labels after the call
        if any_ut_ctrl and not approved:
            s.integrity = "tainted"
        if dc in SENSITIVE or decoy:
            if executed:
                s.confidentiality = "sensitive"

        # ---- containment ladder (not for pure learned-only shifts)
        kind = "attack"
        learned_only = not triggers and not any(scores[l] > 0.3 for l in ("contract", "provenance", "decoy", "content", "chain", "context"))
        if learned_only and 30 <= risk < 80 and decision == "ALLOW":
            kind = "unexplained_shift" if not self.active_changes(a.role) else "benign"
        if risk < 30 and not triggers:
            kind = "benign"
        transitions = [] if (kind in ("benign", "unexplained_shift") and not triggers) or triggers == {"tool_drift"} else self.cont.escalate(agent_id, session_id, out.risk, triggers, decision)
        level_after = self.cont.effective(agent_id, session_id)
        cf = FU.counterfactuals(fin, out.risk) if risk >= 30 else []

        v = Verdict(
            id="vd_" + uuid.uuid4().hex[:10], event_id="ev_" + uuid.uuid4().hex[:10], ts=time.time(), session_id=session_id, step=step, agent_id=agent_id,
            role=a.role, tool=tool, effect=eff, args=args, arg_origins=origins, decision=decision, reason_code=reason, risk=risk, band=b, signals=signals,
            waterfall=out.waterfall, floor=out.floor, session_risk=sr, containment_level=level_after, iam=iam,
            cedar={"decision": cedar["decision"].upper() if cedar["decision"] else "", "policies": pol}, executed=executed, output_chunk=chunk_id, via=via,
            counterfactual=cf, kind=kind, hour=s.hour, latency_ms=round((time.perf_counter() - t0) * 1000, 2))
        v.summary = self._summary(a, s, v, triggers, origins, extras)
        if decision == "DENY" and TOOLS[tool].effect != "read":
            v.safe_alternative = "Continue the legitimate task without this step; a human can approve a narrower action."
        elif decision == "STEP_UP":
            v.safe_alternative = "Waiting for human approval. Everything else in the task continues."
        if decision == "STEP_UP":
            aid = "ap_" + uuid.uuid4().hex[:8]
            v.approval_id = aid
            self.approvals[aid] = {"id": aid, "status": "pending", "verdict_id": v.id, "agent_id": agent_id, "session_id": session_id, "tool": tool, "args": args, "risk": risk, "ts": time.time()}
        s.verdicts.append(v); self.verdicts[v.id] = v
        s.max_risk = max(s.max_risk, risk)
        self._case(a, s, v, triggers, kind)
        rc = CHAIN.add("verdict", {"verdict_id": v.id, "agent": agent_id, "session": session_id, "step": step, "tool": tool, "decision": decision, "risk": risk, "reason": reason, "level": level_after})
        v.receipt_id = rc.id
        for tr in transitions:
            r2 = CHAIN.add("containment", {"agent": tr.agent_id, "session": tr.session_id, "from": tr.frm, "to": tr.to, "reason": tr.reason, "scope": tr.scope})
            BUS.publish("containment", {"agent_id": tr.agent_id, "session_id": tr.session_id, "from": tr.frm, "to": tr.to, "reason": tr.reason, "scope": tr.scope, "receipt_id": r2.id})
        if tool == "agent.delegate" and executed:
            self._record_edge(s, args)
        self.latencies.append(v.latency_ms); self.latencies = self.latencies[-2000:]
        tr = self.trails.setdefault(agent_id, []); tr.append({"risk": v.risk, "step": step, "ts": v.ts}); del tr[:-40]
        self.stats["calls"] += 1
        if v.approval_id:
            BUS.publish("approval", {"id": v.approval_id, "status": "pending", "verdict_id": v.id, "agent_id": agent_id, "tool": tool, "args": args, "risk": risk})
        d = v.model_dump(mode="json")
        if output is not None:
            d["output"] = output
        BUS.publish("verdict", d)
        v._output = output  # type: ignore[attr-defined]
        return v

    # ------------------------------------------------------------ helpers
    def _label_output(self, s: Session, step: int, tool: str, args: dict, res: dict, output: str) -> str:
        trust = res.get("trust", "trusted")
        doc = DOCS.REGISTRY.get(res["doc_id"]) if res.get("doc_id") else None
        ch = LG.Chunk(f"ck_{s.id}_{step}", s.id, step, f"tool:{tool}", (doc.title if doc else (args.get("path") or args.get("url") or tool)), trust, output,
                      doc_id=doc.id if doc else None, sensitive=res.get("data_class") in SENSITIVE or res.get("decoy", False), data_class=res.get("data_class", ""))
        if doc and doc.analysis and trust == "untrusted":
            a = doc.analysis
            ch.hidden_text = a.hidden_text; ch.injection_score = a.injection_score
            ch.hidden = [{"kind": h.kind, "text": h.text[:300], "page": h.page, "bbox": h.bbox, "detail": h.detail} for h in a.hidden]
        elif trust == "untrusted" or tool in TL.WORLD.poisoned_tools:
            sc, hits = HD.score_injection(output)
            ch.injection_score = sc
        s.chunks.append(ch); self.chunks[ch.id] = ch
        if trust == "untrusted":
            if s.integrity == "trusted":
                s.integrity = "untrusted_seen"
            if (ch.hidden_text and ch.injection_score >= 0.3) or ch.injection_score >= 0.5:
                s.integrity = "tainted"
                if not s.injection_chunk:
                    s.injection_chunk = ch.id
        return ch.id

    def _iam_only(self, a, s, tool, args, step, iam, dc, t0) -> Verdict:
        executed, output, chunk_id = False, None, None
        if iam["valid"] and iam["scope_ok"]:
            try:
                res = TL.execute(tool, args, a.id)
                output = res["output"]; executed = True
                chunk_id = self._label_output(s, step, tool, args, res, output)
                s.bytes_out += res.get("bytes_out", 0)
                # an unprotected agent that reads poisoned content keeps obeying it (puppet), nothing stops it
            except TL.ToolError as e:
                output = f"tool error: {e}"
        v = Verdict(id="vd_" + uuid.uuid4().hex[:10], event_id="ev_" + uuid.uuid4().hex[:10], ts=time.time(), session_id=s.id, step=step, agent_id=a.id, role=a.role, tool=tool,
                    effect=TOOLS[tool].effect, args=args, decision="ALLOW", reason_code="IAM_ONLY", risk=0, band="normal", signals=[], waterfall=[], iam=iam,
                    cedar={"decision": "", "policies": []}, executed=executed, output_chunk=chunk_id, via=s.via, summary="Protection off: classic IAM only. The token is valid and the scope allows it, so it ran.",
                    latency_ms=round((time.perf_counter() - t0) * 1000, 2), kind="benign")
        s.verdicts.append(v); self.verdicts[v.id] = v
        d = v.model_dump(mode="json"); d["output"] = output
        BUS.publish("verdict", d)
        v._output = output  # type: ignore[attr-defined]
        return v

    def _finish_denied_iam(self, a, s, tool, args, step, iam, t0, dc) -> Verdict:
        reason = "KILLED" if a.killed else "IAM_SCOPE" if iam["valid"] else "IAM_INVALID"
        v = Verdict(id="vd_" + uuid.uuid4().hex[:10], event_id="ev_" + uuid.uuid4().hex[:10], ts=time.time(), session_id=s.id, step=step, agent_id=a.id, role=a.role, tool=tool,
                    effect=TOOLS[tool].effect, args=args, decision="DENY", reason_code=reason, risk=100 if a.killed else 20, band="critical" if a.killed else "normal", signals=[], waterfall=[],
                    iam=iam if not a.killed else {**iam, "valid": False, "label": "token revoked"}, cedar={"decision": "", "policies": []}, via=s.via, containment_level=5 if a.killed else 0,
                    summary="This agent has been killed and its token revoked." if a.killed else f"Blocked before TESSERA: {iam['label']}.", latency_ms=round((time.perf_counter() - t0) * 1000, 2))
        s.verdicts.append(v); self.verdicts[v.id] = v
        rc = CHAIN.add("verdict", {"verdict_id": v.id, "agent": a.id, "decision": "DENY", "reason": reason})
        v.receipt_id = rc.id
        d = v.model_dump(mode="json"); BUS.publish("verdict", d)
        v._output = None  # type: ignore[attr-defined]
        return v

    def _summary(self, a, s, v: Verdict, triggers: set, origins, extras) -> str:
        nm = ID.ROLE_NAMES.get(a.role, a.role)
        bits = []
        tool = v.tool
        tgt = args_brief(v.args)
        what = f"{tool}({tgt})"
        if v.reason_code in ("OK",) and v.decision == "ALLOW" and v.risk >= 55 and triggers:
            top0 = next(iter(sorted(triggers)))
            why0 = {"stolen_context": "a valid token is being used from an unfamiliar host", "drift_alarm": "this agent has been drifting from its baseline"}.get(top0, "the signals are unusual")
            return f"{nm} ran {what}. Allowed because it is read-only and inside the role, but flagged HIGH: {why0}."
        if v.reason_code in ("OK",) and v.decision == "ALLOW":
            if s.injection_chunk and v.risk >= 20:
                return f"{nm} ran {what}. Allowed — but this session read a document with hidden instructions, so risky actions are being watched."
            return f"{nm} ran {what} — consistent with its role."
        if v.reason_code == "IAM_ONLY":
            return "Protection off."
        sig_names = [x.layer for x in v.signals if x.score >= 0.3 and not x.shadow]
        src = ""
        if s.injection_chunk:
            ch = self.chunks[s.injection_chunk]
            src = f" after reading “{ch.label}”" + (f" (hidden text on page {ch.hidden[0]['page']})" if ch.hidden and ch.hidden[0].get("page") else "")
        why = {
            "decoy_touch": "it touched a decoy that no real job uses", "tool_drift": "the tool's description changed after approval",
            "untrusted_control_mutating": "text from an untrusted document chose where it goes", "sensitive_egress": "it would send sensitive data to an unapproved destination",
            "contract_violation": "it is outside the declared Role Contract", "tainted_mutation": "the session looks hijacked and this changes something",
            "untrusted_control_read": "a document chose what to read", "stolen_context": "a valid token was used from an unfamiliar host", "drift_alarm": "this agent has been drifting from its baseline across sessions",
        }
        top = next((t for t in ["decoy_touch", "sensitive_egress", "untrusted_control_mutating", "tool_drift", "stolen_context", "contract_violation", "tainted_mutation", "untrusted_control_read", "drift_alarm"] if t in triggers), None)
        verb = {"DENY": "blocked", "STEP_UP": "held for human approval", "MODIFY": "allowed with sanitised output", "ALLOW": "allowed", "DEFER": "deferred"}[v.decision]
        why_s = why.get(top, "its behaviour does not match this role") if top else ("it does not match this agent's normal behaviour" if sig_names else "")
        n = len([x for x in sig_names])
        tail = f" — {n} signal{'s' if n != 1 else ''} agree." if n >= 2 else "."
        if v.kind == "unexplained_shift":
            return f"{nm} is behaving differently from its baseline ({', '.join(sig_names) or 'volume'}) with no declared change. Flagged as an unexplained shift, not an attack."
        return f"{nm} tried {what}{src}: {verb} because {why_s}{tail}"

    def _case(self, a, s: Session, v: Verdict, triggers: set, kind: str):
        if v.risk < 60 and not (kind == "unexplained_shift" and v.risk >= 30):
            return
        key = "shift" if kind == "unexplained_shift" else "attack"
        cid = s.case_ids.get(key)
        if not cid and not triggers:      # behavioural/drift case: one rolling case per agent, not one per session
            for c in self.cases.values():
                if c.agent_id == a.id and c.kind == key and c.status != "resolved" and time.time() - c.updated_ts < 900 and not c.root_cause:
                    cid = c.id; s.case_ids[key] = cid; break
        sev = FU.band(v.risk)
        owasp = sorted({OWASP[t] for t in triggers if t in OWASP} | ({"ASI07"} if s.inherited_taint else set()))
        if cid:
            c = self.cases[cid]
            c.updated_ts = time.time(); c.verdict_ids.append(v.id); c.max_risk = max(c.max_risk, v.risk)
            order = ["normal", "elevated", "high", "critical"]
            if order.index(sev) > order.index(c.severity):
                c.severity = sev
            c.owasp = sorted(set(c.owasp) | set(owasp)); c.containment_level = v.containment_level
            c.status = "contained" if v.containment_level >= 2 else "open"
            v.case_id = cid
        else:
            cid = "case_" + uuid.uuid4().hex[:8]
            rc = None
            if s.injection_chunk:
                ch = self.chunks[s.injection_chunk]
                h0 = ch.hidden[0] if ch.hidden else {}
                inj = ch.injection_hits if hasattr(ch, "injection_hits") else None
                rc = {"doc": ch.doc_id, "chunk": ch.id, "label": ch.label, "text": (h0.get("text") or ch.text[:200])[:300], "bbox": h0.get("bbox"), "page": h0.get("page"), "step": ch.step, "kind": h0.get("kind")}
            nm = ID.ROLE_NAMES.get(a.role, a.role)
            title = f"{nm}: " + ("unexplained behaviour shift" if key == "shift" else ("poisoned document steering the agent" if rc else "action outside role"))
            c = Case(id=cid, agent_id=a.id, role=a.role, session_id=s.id, opened_ts=time.time(), updated_ts=time.time(), severity=sev, max_risk=v.risk, title=title, summary=v.summary, owasp=owasp,
                     kind=key if key == "shift" else "attack", verdict_ids=[v.id], containment_level=v.containment_level, root_cause=rc,
                     patient_zero=(s.origin_agent if s.inherited_taint else None), status="contained" if v.containment_level >= 2 else "open")
            self.cases[cid] = c; s.case_ids[key] = cid; v.case_id = cid
        self.cases[cid].summary = v.summary if v.risk >= self.cases[cid].max_risk - 0.1 else self.cases[cid].summary
        BUS.publish("case", self.cases[cid].model_dump(mode="json"))

    def _record_edge(self, s: Session, args: dict):
        tainted = s.integrity == "tainted"
        self.chain_edges.append({"from": s.agent_id, "to": str(args.get("to_agent")), "ts": time.time(), "taint": "tainted" if tainted else "clean", "task": str(args.get("task", ""))[:200],
                                 "origin": s.origin_agent or s.agent_id})

    # ------------------------------------------------------------ approvals & ops
    def approve(self, aid: str, approver: str = "analyst") -> Verdict:
        ap = self.approvals.get(aid)
        if not ap or ap["status"] != "pending":
            raise KeyError("no pending approval")
        ap["status"] = "approved"; ap["approver"] = approver
        BUS.publish("approval", {k: ap[k] for k in ("id", "status", "verdict_id", "agent_id", "tool", "args", "risk")})
        CHAIN.add("approval", {"approval": aid, "verdict": ap["verdict_id"], "approver": approver, "status": "approved"})
        v = self.handle(ap["agent_id"], ap["session_id"], ap["tool"], ap["args"], approval_id=aid)
        return v

    def reject(self, aid: str, approver: str = "analyst"):
        ap = self.approvals.get(aid)
        if not ap or ap["status"] != "pending":
            raise KeyError("no pending approval")
        ap["status"] = "rejected"
        CHAIN.add("approval", {"approval": aid, "verdict": ap["verdict_id"], "approver": approver, "status": "rejected"})
        BUS.publish("approval", {k: ap[k] for k in ("id", "status", "verdict_id", "agent_id", "tool", "args", "risk")})

    def set_containment(self, agent_id: str, level: int, reason: str, session_id: Optional[str] = None):
        if level >= 5:
            ID.REGISTRY.revoke(agent_id)
        tr = self.cont.set_level(agent_id, level, reason, session_id)
        r = CHAIN.add("containment", {"agent": agent_id, "from": tr.frm, "to": level, "reason": reason, "scope": "agent", "by": "operator"})
        BUS.publish("containment", {"agent_id": agent_id, "from": tr.frm, "to": level, "reason": reason, "scope": "agent", "receipt_id": r.id})
        return tr

    def release(self, agent_id: str, approver: str):
        a = ID.REGISTRY.get(agent_id)
        if a and a.killed:
            a.killed = False
            a.token_jti = uuid.uuid4().hex[:8]       # rotate: a fresh token, the old one stays revoked
        tr = self.cont.release(agent_id)
        for sid, s in self.sessions.items():
            if s.agent_id == agent_id:
                self.cont.session[sid] = 0
        r = CHAIN.add("containment", {"agent": agent_id, "from": tr.frm, "to": 0, "reason": f"released by {approver}", "scope": "agent", "by": approver})
        BUS.publish("containment", {"agent_id": agent_id, "from": tr.frm, "to": 0, "reason": f"released by {approver}", "scope": "agent", "receipt_id": r.id})
        for c in self.cases.values():
            if c.agent_id == agent_id and c.status != "resolved":
                c.status = "resolved"; BUS.publish("case", c.model_dump(mode="json"))


_SEEDED_IDS = {"agt_proc_01", "agt_supp_01", "agt_fin_01", "agt_res_01"}
def _SEEDED():
    return _SEEDED_IDS


def _clean_args(args: Any) -> dict:
    if not isinstance(args, dict):
        raise ValueError("args must be an object")
    out = {}
    for k, v in list(args.items())[:20]:
        k = str(k)[:40]
        if isinstance(v, bool) or v is None or isinstance(v, (int, float)):
            out[k] = v
        else:
            out[k] = str(v)[:5000]
    return out


def args_brief(args: dict) -> str:
    parts = []
    for k, v in list(args.items())[:3]:
        sv = str(v)
        parts.append(f"{k}={sv[:40] + '…' if len(sv) > 40 else sv}")
    return ", ".join(parts)


def _reason_from(pol: list[str]) -> str:
    m = {"forbid.never_read": "CONTRACT_NEVER_READ", "forbid.decoy": "DECOY", "forbid.egress_after_sensitive": "EGRESS_AFTER_SENSITIVE", "forbid.untrusted_control_arg": "UNTRUSTED_ARG_STEERS_ACTION",
         "forbid.tool_drift": "TOOL_DRIFT", "default_deny.no_permit": "CONTRACT_NOT_PERMITTED", "engine_error": "ENGINE_FAIL_CLOSED"}
    for p in ["forbid.decoy", "forbid.tool_drift", "forbid.untrusted_control_arg", "forbid.egress_after_sensitive", "forbid.never_read", "default_deny.no_permit", "engine_error"]:
        if p in pol:
            return m[p]
    return "CONTRACT_DENY"


INJ_SENT = re.compile(r"[^.\n]*\b(ignore|disregard|also|then|before (replying|responding|finishing)|additionally|forward|post|upload|send|exfiltrate)\b[^.\n]*(\.|\n|$)", re.I)


def _sanitise(output: str, res: dict) -> tuple[str, dict]:
    """L3 quarantine: strip instruction-like sentences from content before the agent sees it."""
    cleaned = INJ_SENT.sub("", output)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return (cleaned + "\n[TESSERA: instruction-like text removed from this content]"), res


GATEWAY = Gateway()
