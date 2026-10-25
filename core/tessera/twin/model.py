"""Behavioural twin. Learned from BENIGN traffic only; hierarchical (role prior -> agent) with Bayesian-style shrinkage.

Layers produced here: sequence (order-2 Markov surprisal), params (robust envelopes + destination novelty),
intent (off-role probe, hashed-token centroids; production uses bge-small), drift (CUSUM + PSI + budgets).
"""
from __future__ import annotations
import hashlib, math, random, re, statistics, time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

from ..models import Evidence, Signal
from ..sim import traffic
from . import features as F

H_ALARM = 8.0          # CUSUM alarm level (benign max over 4000 sessions per role: 4.9-6.7)
K_SHRINK = 8.0          # pseudo-count of the role prior
MATURE_AT = 20          # sessions until learned layers enforce
DIM = 512
SEQ_VOCAB_FLOOR = 1e-4


def _clip(x: float, lo=0.0, hi=1.0) -> float:
    return max(lo, min(hi, x))


class SeqModel:
    def __init__(self):
        self.c2: dict[tuple, Counter] = defaultdict(Counter)
        self.c1: dict[str, Counter] = defaultdict(Counter)
        self.c0: Counter = Counter()
        self.n = 0

    def add(self, toks: list[str]):
        seq = ["<s>", "<s>"] + toks + ["</s>"]
        for i in range(2, len(seq)):
            a, b, c = seq[i - 2], seq[i - 1], seq[i]
            self.c2[(a, b)][c] += 1; self.c1[b][c] += 1; self.c0[c] += 1; self.n += 1

    def vocab(self) -> set[str]:
        return set(self.c0)

    def prob(self, a: str, b: str, c: str) -> tuple[float, int]:
        """interpolated p(c|a,b) and the evidence count in the longest matching context."""
        V = max(1, len(self.c0))
        p0 = (self.c0.get(c, 0) + 0.1) / (self.n + 0.1 * V) if c in self.c0 else SEQ_VOCAB_FLOOR
        d1 = self.c1.get(b); n1 = sum(d1.values()) if d1 else 0
        d2 = self.c2.get((a, b)); n2 = sum(d2.values()) if d2 else 0
        p1 = ((d1.get(c, 0) + 0.05) / (n1 + 0.05 * V)) if d1 else p0
        p2 = ((d2.get(c, 0) + 0.02) / (n2 + 0.02 * V)) if d2 else p1
        w2, w1 = (0.65 if n2 else 0.0), (0.25 if n1 else 0.0)
        w0 = 1 - w2 - w1
        return max(SEQ_VOCAB_FLOOR, w2 * p2 + w1 * p1 + w0 * p0), n2 or n1


def hvec(text: str) -> np.ndarray:
    v = np.zeros(DIM, dtype=np.float32)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        h = int(hashlib.md5(w.encode(), usedforsecurity=False).hexdigest()[:8], 16)
        v[h % DIM] += 1.0
    n = np.linalg.norm(v)
    return v / n if n else v


OFFROLE = {
    "hr": "hr lookup employee salary payroll exec comp confidential compensation bonus",
    "finance_admin": "finance confidential vendor bank details account transfer payments wire",
    "exfil": "http post upload external send collect forward email attachment outside evil",
    "secrets": "credential password api key secret token config env",
}


@dataclass
class RoleModel:
    role: str
    seq: SeqModel = field(default_factory=SeqModel)
    env: dict[str, dict[str, float]] = field(default_factory=dict)     # "tool.param" -> {med, mad, max}
    dests: set[str] = field(default_factory=set)
    centroid: Optional[np.ndarray] = None
    off: dict[str, np.ndarray] = field(default_factory=dict)
    q: dict[str, float] = field(default_factory=dict)                   # thresholds from validation
    mix_vocab: list[str] = field(default_factory=list)
    mix_ref: list[float] = field(default_factory=list)
    sess_mean: dict[str, float] = field(default_factory=dict)
    sess_std: dict[str, float] = field(default_factory=dict)
    transitions: list[dict] = field(default_factory=list)
    tool_usage: Counter = field(default_factory=Counter)
    hours: tuple[int, int] = (7, 19)
    n_sessions: int = 0


def _mad(xs):
    m = statistics.median(xs)
    return m, statistics.median([abs(x - m) for x in xs]) or max(1.0, abs(m) * 0.05)


def train_role(role: str, seed: int, n_train: int = 600, n_val: int = 900) -> RoleModel:
    rng = random.Random(f"{seed}:{role}:train")
    rm = RoleModel(role)
    vals: dict[str, list[float]] = defaultdict(list)
    texts: list[np.ndarray] = []
    sess_stats = []
    mixes = []
    for _ in range(n_train):
        s = traffic.gen_session(role, rng)
        feats = [F.step_features(st["tool"], st["args"], st["hour"], st["bytes_out"]) for st in s["steps"]]
        rm.seq.add([f["tok"] for f in feats])
        for f, st in zip(feats, s["steps"]):
            rm.tool_usage[f["tok"]] += 1
            for k in F.NUMERIC_PARAMS:
                if k in f:
                    vals[f"{st['tool']}.{k}"].append(f[k])
            if f["bytes_out"]:
                vals[f"{st['tool']}.bytes_out"].append(float(f["bytes_out"]))
            if f["dest"]:
                rm.dests.add(f["dest"])
            texts.append(hvec(f["text"]))
        sess_stats.append(F.session_stats(feats)); mixes.append([f["tok"] for f in feats])
        rm.n_sessions += 1
    for k, xs in vals.items():
        if len(xs) >= 5:
            med, mad = _mad(xs)
            rm.env[k] = {"med": med, "mad": mad, "max": max(xs), "min": min(xs), "p99": float(np.percentile(xs, 99))}
    rm.centroid = np.mean(texts, axis=0)
    rm.centroid /= (np.linalg.norm(rm.centroid) or 1)
    rm.off = {k: hvec(v) for k, v in OFFROLE.items()}
    rm.mix_vocab = sorted({t for m in mixes for t in m})
    rm.mix_ref = [sum(m.count(v) for m in mixes) / max(1, sum(len(m) for m in mixes)) for v in rm.mix_vocab]
    for key in ("bytes_out", "steps"):
        xs = [s[key] for s in sess_stats]
        rm.sess_mean[key] = float(np.mean(xs)); rm.sess_std[key] = float(np.std(xs)) or 1.0
    pe = [s["per_egress"] for s in sess_stats if s["egress_calls"]]
    rm.sess_mean["per_egress"] = float(np.mean(pe)) if pe else 0.0
    rm.sess_std["per_egress"] = (float(np.std(pe)) if pe else 1.0) or 1.0
    # transition table for the Twin page
    tr = Counter(); outs = Counter()
    for m in mixes:
        seq = ["<s>"] + m + ["</s>"]
        for a, b in zip(seq, seq[1:]):
            tr[(a, b)] += 1; outs[a] += 1
    rm.transitions = [{"from": a, "to": b, "count": c, "p": round(c / outs[a], 3)} for (a, b), c in tr.most_common(40)]
    # thresholds from a held-out benign validation set
    rngv = random.Random(f"{seed}:{role}:val")
    sur, zs, intents = [], [], []
    for _ in range(n_val):
        s = traffic.gen_session(role, rngv)
        feats = [F.step_features(st["tool"], st["args"], st["hour"], st["bytes_out"]) for st in s["steps"]]
        prev = ["<s>", "<s>"]
        for f in feats:
            p, _ = rm.seq.prob(prev[0], prev[1], f["tok"]); sur.append(-math.log2(p)); prev = [prev[1], f["tok"]]
            zs.append(max(_env_z(rm, f)[0], 0.0)); intents.append(_intent_margin(rm, f["text"]))
    rm.q = {"sur_q95": float(np.percentile(sur, 95)), "sur_q999": float(np.percentile(sur, 99.9)), "z_q99": float(np.percentile(zs, 99)),
            "int_q99": float(np.percentile(intents, 99)), "int_q50": float(np.percentile(intents, 50))}
    return rm


def _env_z(rm: RoleModel, f: dict) -> tuple[float, str]:
    worst, label = 0.0, ""
    for k in F.NUMERIC_PARAMS:
        if k in f:
            e = rm.env.get(f"{f['tool']}.{k}")
            if e:
                z = abs(f[k] - e["med"]) / (1.4826 * e["mad"] + 1e-6)
                if z > worst:
                    worst, label = z, f"{k}={f[k]:,.0f} vs typical {e['med']:,.0f}"
    if f.get("bytes_out"):
        e = rm.env.get(f"{f['tool']}.bytes_out")
        if e:
            z = (f["bytes_out"] - e["med"]) / (1.4826 * e["mad"] + 1e-6)
            if z > worst:
                worst, label = z, f"{f['bytes_out']} bytes out vs typical {e['med']:,.0f}"
    return worst, label


def _intent_margin(rm: RoleModel, text: str) -> float:
    v = hvec(text)
    own = float(v @ rm.centroid)
    off = max(float(v @ o) for o in rm.off.values())
    return off - own


# ---------------------------------------------------------------- per-agent twin
@dataclass
class AgentTwin:
    agent_id: str
    role: str
    seq: SeqModel = field(default_factory=SeqModel)
    sessions_seen: int = 0
    history: list[dict] = field(default_factory=list)       # per-session stats
    cusum: float = 0.0
    cusum_b: float = 0.0
    cusum_s: float = 0.0
    cusum_series: list[dict] = field(default_factory=list)
    alarm: bool = False
    env_shift: dict[str, float] = field(default_factory=dict)  # clamped movement of medians
    recent_toks: list[list[str]] = field(default_factory=list)
    risk_history: list[dict] = field(default_factory=list)
    days_bytes: list[float] = field(default_factory=list)

    @property
    def maturity(self) -> float:
        return _clip(self.sessions_seen / MATURE_AT)


class TwinStore:
    def __init__(self):
        self.roles: dict[str, RoleModel] = {}
        self.agents: dict[str, AgentTwin] = {}
        self.seed = 0

    def train(self, seed: int):
        self.seed = seed
        t = time.time()
        for r in ("role.procurement", "role.support", "role.finance_ap", "role.research"):
            self.roles[r] = train_role(r, seed)
        self.agents.clear()
        return time.time() - t

    def twin(self, agent_id: str, role: str, mature: bool = False) -> AgentTwin:
        if agent_id not in self.agents:
            a = AgentTwin(agent_id, role)
            if mature:
                rng = random.Random(f"{self.seed}:{agent_id}")
                n_seed = MATURE_AT * 3
                for i in range(n_seed):
                    s = traffic.gen_session(role, rng)
                    feats = [F.step_features(x["tool"], x["args"], x["hour"], x["bytes_out"]) for x in s["steps"]]
                    last = i >= n_seed - 28                      # keep the most recent sessions so the Twin charts have history
                    self.observe_session(a, feats, clean=True, record=last)
                    if last:
                        a.risk_history.append({"ts": time.time() - (n_seed - i) * 60, "risk": round(3 + rng.random() * 9, 1)})
                a.cusum, a.cusum_b, a.cusum_s, a.alarm = 0.0, 0.0, 0.0, False
            self.agents[agent_id] = a
        return self.agents[agent_id]

    # ---------------- scoring
    def score(self, agent: AgentTwin, f: dict, prev2: str, prev1: str, session: dict, changes: list[Any]) -> list[Signal]:
        rm = self.roles[agent.role]
        shadow = agent.maturity < 0.5
        t0 = time.perf_counter()
        sigs: list[Signal] = []
        # explained by a declared change window?
        explained = [c for c in changes if c.role == agent.role and (c.tool is None or c.tool == f["tool"] or c.kind in ("volume_surge", "new_task_type"))]
        mult = 0.15 if explained else 1.0
        expl_flag = [f"explained_by_change:{explained[0].id}"] if explained else []
        # --- sequence
        p_r, n_ctx = rm.seq.prob(prev2, prev1, f["tok"])
        p = p_r
        if agent.seq.n:
            p_a, na = agent.seq.prob(prev2, prev1, f["tok"])
            p = (na * p_a + K_SHRINK * p_r) / (na + K_SHRINK) if na else p_r
        sur = -math.log2(p)
        oov = f["tok"] not in rm.seq.vocab()
        s_seq = 1.0 if oov else _clip((sur - rm.q["sur_q999"]) / 2.5)
        ev = [Evidence(text=f"{prev1} → {f['tok']} has probability {p:.4f} for this role (surprisal {sur:.1f} bits; benign 99.9th pct {rm.q['sur_q999']:.1f})" + (" — never seen for this role" if oov else ""))]
        sigs.append(Signal(layer="sequence", score=round(s_seq * mult, 3), flags=(["unseen_tool_for_role"] if oov else []) + (["rare_transition"] if s_seq > 0.5 and not oov else []) + expl_flag, evidence=ev if s_seq > 0.2 else [], shadow=shadow))
        # --- params
        z, label = _env_z(rm, f)
        s_par = _clip((z - max(3.0, rm.q["z_q99"])) / 6.0)
        flags = []
        if s_par > 0.2:
            flags.append("outside_envelope")
        if f["dest"] and f["dest"] not in rm.dests:
            s_par = max(s_par, 0.7 if not session.get("dest_allowlisted") else 0.35); flags.append("novel_destination")
            label = (label + "; " if label else "") + f"destination {f['dest']} never used by this role"
        if f["hour"] < rm.hours[0] or f["hour"] > rm.hours[1]:
            s_par = max(s_par, 0.4); flags.append("odd_hour"); label = (label + "; " if label else "") + f"hour {f['hour']:02d}:00 outside {rm.hours[0]:02d}-{rm.hours[1]:02d}"
        sigs.append(Signal(layer="params", score=round(s_par * mult, 3), flags=flags + expl_flag, evidence=[Evidence(text=label)] if label and s_par > 0.2 else [], shadow=shadow))
        # --- intent
        m = _intent_margin(rm, f["text"])
        s_int = _clip((m - rm.q["int_q99"]) / 0.45)
        sigs.append(Signal(layer="intent", score=round(s_int * mult, 3), flags=(["off_role_intent"] if s_int > 0.4 else []) + expl_flag,
                           evidence=[Evidence(text=f"action text is closer to an off-role profile than to {agent.role} (margin {m:+.2f}; benign 99th pct {rm.q['int_q99']:+.2f})")] if s_int > 0.3 else [], shadow=shadow))
        # --- drift (cross-session) + budgets
        s_dr, dflags, dev = self._drift_signal(agent, rm, session)
        sigs.append(Signal(layer="drift", score=round(s_dr * (0.35 if explained else 1.0), 3), flags=dflags + expl_flag, evidence=dev, shadow=shadow))
        lat = (time.perf_counter() - t0) * 1000 / 4
        for s in sigs:
            s.latency_ms = round(lat, 3)
        return sigs

    def _drift_signal(self, agent: AgentTwin, rm: RoleModel, session: dict) -> tuple[float, list[str], list[Evidence]]:
        flags, ev, s = [], [], 0.0
        h = H_ALARM
        if agent.cusum > 1.0:
            s = max(s, _clip(agent.cusum / h)); flags.append("cusum_rising")
            ev.append(Evidence(text=f"CUSUM on session volume is {agent.cusum:.1f} (alarm at {h:.0f}); this agent has been drifting upward across {len(agent.history)} sessions"))
        if agent.alarm:
            s = max(s, 0.85); flags.append("cusum_alarm")
        psi_v = self._psi(agent, rm)
        if psi_v > 0.1:
            s = max(s, _clip(psi_v / 0.4)); flags.append("tool_mix_shift")
            ev.append(Evidence(text=f"tool-mix PSI vs frozen reference = {psi_v:.2f} (>0.1 is a shift, >0.25 is large)"))
        cap = session.get("budget_bytes_session") or 1
        frac = session.get("bytes_out", 0) / cap
        if frac > 0.6:
            s = max(s, _clip(frac)); flags.append("session_budget")
            ev.append(Evidence(text=f"{session['bytes_out']} of {cap} bytes session egress budget used"))
        win = session.get("window_bytes", 0) + session.get("bytes_out", 0)
        capd = session.get("budget_bytes_day") or 1
        if win / capd > 0.7:
            s = max(s, _clip(win / capd)); flags.append("window_budget")
            ev.append(Evidence(text=f"{win} of {capd} bytes rolling-window egress budget used"))
        return s, flags, ev

    def _psi(self, agent: AgentTwin, rm: RoleModel) -> float:
        recent = [t for sess in agent.recent_toks[-10:] for t in sess]
        if len(agent.recent_toks) < 6 or not recent:
            return 0.0
        act = [recent.count(v) / len(recent) for v in rm.mix_vocab]
        extra = sum(1 for t in recent if t not in rm.mix_vocab) / len(recent)
        return F.psi(rm.mix_ref, act) + extra * 2

    # ---------------- learning
    def observe_session(self, agent: AgentTwin, feats: list[dict], clean: bool, record: bool = True, risk: float = 0.0):
        """Called when a session ends. Drift always sees the session; the baseline only absorbs CLEAN sessions (movement budget)."""
        rm = self.roles[agent.role]
        st = F.session_stats(feats)
        zb = (st["per_egress"] - rm.sess_mean["per_egress"]) / (rm.sess_std["per_egress"] + 1e-6) if st["egress_calls"] else 0.0
        zs = (st["steps"] - rm.sess_mean["steps"]) / (rm.sess_std["steps"] + 1e-6)
        if st["egress_calls"]:
            agent.cusum_b = max(0.0, agent.cusum_b + (zb - 0.5))
        agent.cusum_s = max(0.0, agent.cusum_s + (zs - 1.0))
        agent.cusum = max(agent.cusum_b, agent.cusum_s)
        agent.alarm = agent.cusum >= H_ALARM
        if record:
            agent.cusum_series.append({"session": len(agent.history) + 1, "value": round(agent.cusum, 2), "alarm": agent.alarm})
            agent.history.append({"session": len(agent.history) + 1, "steps": st["steps"], "bytes_out": st["bytes_out"], "ts": time.time(), "risk": risk})
            agent.history = agent.history[-200:]; agent.cusum_series = agent.cusum_series[-200:]
        agent.recent_toks.append([f["tok"] for f in feats]); agent.recent_toks = agent.recent_toks[-30:]
        agent.days_bytes.append(st["bytes_out"]); agent.days_bytes = agent.days_bytes[-10:]
        agent.sessions_seen += 1
        if clean and risk < 30:
            agent.seq.add([f["tok"] for f in feats])
        return st


STORE = TwinStore()
