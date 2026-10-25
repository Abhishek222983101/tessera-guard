"""HTTP API (contracts/API.md). Thin: all behaviour lives in the gateway, twin, fusion and sim modules."""
from __future__ import annotations
import asyncio, json, math, os, time, uuid, hashlib
from typing import Any, Optional

from fastapi import Body, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sse_starlette.sse import EventSourceResponse

from .. import identity as ID, world
from ..bus import BUS
from ..config import ALLOW_TAMPER, CORS_ORIGINS, OPENROUTER_KEY, SEED, MAX_UPLOAD_BYTES
from ..gateway import GATEWAY as GW, OWASP_NAME
from ..models import ChangeEvent, LAYERS
from ..policy import cedar as CD, contract as CT
from ..receipts import CHAIN
from ..sim import docs as DOCS, scenarios as SC, tools as TL
from ..sim.catalog import TOOLS, public_catalog
from ..sim.puppet import GLOCK, RUNS, compute_utility
from ..twin.model import STORE, MATURE_AT, H_ALARM
from .. import eval as EV

START = time.time()
app = FastAPI(title="TESSERA Lab core", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS + ["*"] if False else CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_credentials=False)
TRAILS: dict[str, list[dict]] = {}


class StripPrefix:
    """Vercel Services forwards the full path (/server/...). Strip it so routes stay identical locally and deployed."""
    def __init__(self, app, prefix="/server"):
        self.app, self.prefix = app, prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope["path"].startswith(self.prefix):
            scope = dict(scope); scope["path"] = scope["path"][len(self.prefix):] or "/"
            if scope.get("raw_path"):
                scope["raw_path"] = scope["raw_path"][len(self.prefix):] or b"/"
        await self.app(scope, receive, send)


app.add_middleware(StripPrefix)


class Err(Exception):
    def __init__(self, status: int, code: str, message: str, details: Optional[list] = None):
        self.status, self.code, self.message, self.details = status, code, message, details


@app.exception_handler(Err)
async def _err(_: Request, e: Err):
    return JSONResponse({"error": {"code": e.code, "message": e.message, "details": e.details or []}}, status_code=e.status)


@app.exception_handler(RequestValidationError)
async def _val(_: Request, e: RequestValidationError):
    return JSONResponse({"error": {"code": "invalid_request", "message": "That request wasn't valid: " + "; ".join(f"{'.'.join(str(x) for x in er['loc'][1:])}: {er['msg']}" for er in e.errors()[:3]), "details": []}}, status_code=422)


@app.exception_handler(HTTPException)
async def _http(_: Request, e: HTTPException):
    return JSONResponse({"error": {"code": "http_%d" % e.status_code, "message": str(e.detail), "details": []}}, status_code=e.status_code)


@app.exception_handler(Exception)
async def _any(_: Request, e: Exception):
    return JSONResponse({"error": {"code": "internal", "message": "Something went wrong in the core. The lab is still running; try again or press Reset.", "details": [type(e).__name__]}}, status_code=500)


@app.on_event("startup")
async def _start():
    BUS.loop = asyncio.get_running_loop()
    world.boot()
    if not os.environ.get("TESSERA_NO_WARM"):
        EV.warm_async()


def need_agent(aid: str):
    a = ID.REGISTRY.get(aid)
    if not a:
        raise Err(404, "unknown_agent", f"No agent called '{aid}'.")
    return a


# ------------------------------------------------------------------ meta
@app.get("/health")
def health():
    return {"ok": True, "version": "0.1.0", "uptime_s": round(time.time() - START, 1), "cedar": "ok", "llm": "on" if OPENROUTER_KEY else "off", "seed": SEED, "mode": "live"}


@app.get("/about")
def about():
    return {
        "real": ["Gateway that every tool call passes through (token check, then policy, then detectors)", "Role Contract compiled to Cedar and evaluated with deny-overrides", "Provenance ledger and argument-provenance matching",
                 "Hidden-text and injection detection on real PDFs and HTML", "Learned behavioural twin (Markov sequence model, parameter envelopes, intent probe, CUSUM drift)", "Fusion to a 0-100 risk with a per-layer breakdown, floors and counterfactuals",
                 "Containment ladder L0-L5 with per-session narrowing", "Ed25519-signed, hash-chained receipts", "Live event stream to this console"],
        "simulated": ["The enterprise: ERP, HR share, mail and the 'internet' are a sandbox with fake data and decoys", "The agents are puppet agents: deterministic workers that obey instructions found in content they read (a standard way to test indirect prompt injection)",
                      "Event spine is an in-process bus + SQLite-free memory instead of NATS + ClickHouse", "Intent probe uses hashed-token centroids; production uses a small embedding model"],
        "standards": ["AARM decisions: ALLOW / DENY / MODIFY / STEP_UP / DEFER", "OWASP Top 10 for Agentic Applications (ASI01-ASI10) tags on cases", "Cedar policy language (deny-overrides)", "RFC 8693-style delegation chain in handoffs", "OTel GenAI semantic conventions for events (production)"],
        "owasp": OWASP_NAME,
    }


@app.post("/reset")
def reset():
    with GLOCK:
        world.boot()
        TRAILS.clear(); RUNS.clear()
    BUS.publish("reset", {})
    return {"ok": True}


# ------------------------------------------------------------------ stream
@app.get("/stream")
async def stream(request: Request, since: int = 0):
    q = BUS.subscribe()
    backlog = BUS.since(since, 800) if since else []

    async def gen():
        try:
            for e in backlog:
                yield {"event": e["type"], "data": json.dumps({"seq": e["seq"], "data": e["data"]})}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    e = await asyncio.wait_for(q.get(), timeout=15)
                    yield {"event": e["type"], "data": json.dumps({"seq": e["seq"], "data": e["data"]})}
                except asyncio.TimeoutError:
                    yield {"event": "heartbeat", "data": json.dumps({"seq": BUS.seq, "data": {}})}
        finally:
            BUS.unsubscribe(q)
    return EventSourceResponse(gen(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/events")
def events(since: int = 0, limit: int = Query(500, le=2000)):
    ev = BUS.since(since, limit)
    return {"events": [{"seq": e["seq"], "type": e["type"], "data": e["data"]} for e in ev], "last_seq": BUS.seq}


# ------------------------------------------------------------------ agents & fleet
def _recent_risk(aid: str) -> float:
    now = time.time(); best = 0.0
    for v in reversed(list(GW.verdicts.values())[-300:]):
        if v.agent_id == aid and now - v.ts < 90:
            best = max(best, v.risk * (1 - (now - v.ts) / 90))
    return round(best, 1)


def agent_dict(a: ID.Agent) -> dict:
    tw = STORE.twin(a.id, a.role, mature=a.id in ("agt_proc_01", "agt_supp_01", "agt_fin_01", "agt_res_01"))
    lvl = GW.cont.agent[a.id]
    sess_max = max([GW.cont.session[s.id] for s in GW.sessions.values() if s.agent_id == a.id and not s.ended] or [0])
    status = "killed" if a.killed else "contained" if lvl >= 3 else "active"
    rets = [r.utility["retention"] for r in RUNS.values() if r.utility and r.utility.get("legit_total") and any(GW.sessions[s].agent_id == a.id for s in r.session_ids if s in GW.sessions)]
    return {"id": a.id, "name": a.name, "role": a.role, "status": status, "level": 5 if a.killed else lvl, "session_level_max": sess_max, "maturity": round(tw.maturity, 2), "sessions_seen": tw.sessions_seen,
            "risk_now": _recent_risk(a.id), "open_cases": sum(1 for c in GW.cases.values() if c.agent_id == a.id and c.status != "resolved"), "scopes": a.scopes, "hosts": a.hosts, "created_ts": a.created_ts,
            "utility_retention": round(sum(rets) / len(rets), 3) if rets else None}


@app.get("/agents")
def agents():
    return [agent_dict(a) for a in ID.REGISTRY.agents.values()]


def _position(aid: str, role: str, risk: float, step: int = 0, level: int = 0) -> dict:
    h = int(hashlib.md5(aid.encode(), usedforsecurity=False).hexdigest()[:6], 16)
    th = (h % 628) / 100 + step * 0.55
    ph = ((h >> 4) % 100) / 100 * 1.2 - 0.6
    d = 0.22 + 1.55 * min(1.0, risk / 100)
    return {"x": round(d * math.cos(th) * math.cos(ph), 3), "y": round(d * math.sin(ph), 3), "z": round(d * math.sin(th) * math.cos(ph), 3), "d": round(d, 3)}


def _note_trail(v):
    pass


def _trail(aid: str, role: str) -> list[dict]:
    return [{**_position(aid, role, e["risk"], e["step"]), "ts": e["ts"], "risk": e["risk"]} for e in GW.trails.get(aid, [])[-30:]]


def _trail_hook():
    pass


@app.get("/fleet")
def fleet():
    ags = [agent_dict(a) for a in ID.REGISTRY.agents.values()]
    orbit = []
    for a in ags:
        tr = _trail(a["id"], a["role"])
        last = tr[-1] if tr else None
        age = time.time() - last["ts"] if last else 1e9
        eff_risk = (last["risk"] * math.exp(-age / 25.0)) if last else 0.0
        if a["level"] >= 3 and last:
            eff_risk = max(eff_risk, 70)
        pos = _position(a["id"], a["role"], eff_risk, len(tr))
        con = GW.contracts[a["role"]]["contract"]
        radius = round(0.9 + 0.05 * len(con.tools), 2)
        orbit.append({"agent_id": a["id"], "name": a["name"], "role": a["role"], "position": {"x": pos["x"], "y": pos["y"], "z": pos["z"]}, "drift": round(pos["d"] / 1.0, 3) if False else round(pos["d"] / 0.85, 3), "radius": 1.0,
                      "level": a["level"], "risk_now": a["risk_now"], "trail": [{"x": t["x"], "y": t["y"], "z": t["z"]} for t in tr[-24:]]})
    rets = [r.utility["retention"] for r in RUNS.values() if r.utility and r.utility.get("legit_total")]
    bench = EV.cached()
    fa = next((m["value"] for m in (bench or {}).get("metrics", []) if m["id"] == "false_alerts_per_1000"), None)
    lat = sorted(GW.latencies) or [0]
    return {"kpis": {"agents": len(ags), "open_cases": sum(1 for c in GW.cases.values() if c.status != "resolved"), "contained": sum(1 for a in ags if a["status"] != "active"),
                     "pending_approvals": sum(1 for x in GW.approvals.values() if x["status"] == "pending"), "utility_retention": round(sum(rets) / len(rets), 3) if rets else None,
                     "false_alerts_per_1000": fa, "gateway_p95_ms": round(lat[int(0.95 * (len(lat) - 1))], 2)},
            "orbit": orbit, "chains": [{"from": e["from"], "to": e["to"], "taint": e["taint"], "ts": e["ts"]} for e in GW.chain_edges[-20:]]}


@app.get("/agents/{aid}")
def agent_detail(aid: str):
    a = need_agent(aid)
    d = agent_dict(a)
    tw = STORE.twin(aid, a.role)
    rm = STORE.roles[a.role]
    total = sum(rm.tool_usage.values()) or 1
    con = GW.contracts[a.role]["contract"]
    peers = [x for x in ID.REGISTRY.agents.values() if x.role == a.role and x.id != aid]
    psi = STORE._psi(tw, rm)
    decoys = [{"path": p, "touched": any(v.agent_id == aid and v.args.get("path") == p for v in GW.verdicts.values())} for p in ("/hr/payroll_backup_2026.xlsx", "/finance/vendor_bank_details_FINAL.xlsx")]
    d["twin"] = {
        "role_contract_summary": {"name": con.name, "version": con.version, "purpose": con.purpose, "tools": list(con.tools), "never_read": con.never_read, "egress_allowlist": con.egress_allowlist, "budgets": con.budgets.model_dump()},
        "tool_usage": [{"tool": t, "count": c, "share": round(c / total, 3)} for t, c in rm.tool_usage.most_common()],
        "transitions": rm.transitions,
        "envelopes": [{"tool": k.rsplit(".", 1)[0], "param": k.rsplit(".", 1)[1], "median": v["med"], "mad": v["mad"], "min": v["min"], "max": v["max"]} for k, v in rm.env.items()],
        "volume": tw.history[-60:], "cusum": tw.cusum_series[-60:], "alarm_level": H_ALARM,
        "thresholds": {k: round(v, 3) for k, v in rm.q.items()},
        "cohort": {"peer_shift": round(psi, 3), "fleet_shift": bool(psi > 0.25 and peers), "peers": len(peers)},
        "baseline": {"state": "cold" if tw.sessions_seen < 5 else "warming" if tw.sessions_seen < MATURE_AT else "mature", "n_sessions": tw.sessions_seen, "mature_at": MATURE_AT,
                     "note": "learned layers run in shadow until maturity 50%; contract, provenance, decoys and content enforce from step 1" if tw.maturity < 0.5 else "all layers enforcing"},
        "decoys": decoys, "change_windows": [c.model_dump(mode="json") for c in GW.active_changes(a.role)],
        "hour_grid": _hour_grid(aid),
        "risk_history": tw.risk_history[-60:], "position": _position(aid, a.role, d["risk_now"], len(GW.trails.get(aid, []))),
    }
    return d


def _hour_grid(aid: str) -> list[list[float]]:
    """7 days x 24 hours of minutes: the role's normal working pattern (from the benign traffic model) plus what this agent actually did today."""
    w = {8: 2, 9: 5, 10: 8, 11: 9, 12: 8, 13: 6, 14: 8, 15: 9, 16: 8, 17: 5, 18: 2}
    tot = sum(w.values())
    grid = [[(w.get(h, 0) / 9) * 38 if d < 5 else 0.0 for h in range(24)] for d in range(7)]
    today = time.localtime().tm_wday
    for v in list(GW.verdicts.values()):
        if v.agent_id == aid:
            grid[today][v.hour % 24] = min(60.0, grid[today][v.hour % 24] + 7)
    return [[round(x, 1) for x in row] for row in grid]


class SpawnBody(__import__("pydantic").BaseModel):
    template: str = "role.procurement"
    name: Optional[str] = None


@app.post("/agents")
def spawn(b: SpawnBody):
    if b.template not in ID.ROLE_NAMES:
        raise Err(422, "unknown_template", f"Unknown role template '{b.template}'.")
    with GLOCK:
        if len(ID.REGISTRY.agents) >= 24:
            raise Err(429, "too_many_agents", "The lab holds at most 24 agents. Press Reset to start fresh.")
        a = ID.REGISTRY.spawn(b.template, b.name)
        STORE.twin(a.id, a.role, mature=False)
    d = agent_dict(a); d["token"] = a.token()
    return d


class ContainBody(__import__("pydantic").BaseModel):
    level: int
    reason: str = "Operator action"


@app.post("/agents/{aid}/containment")
def containment(aid: str, b: ContainBody):
    need_agent(aid)
    if not 0 <= b.level <= 5:
        raise Err(422, "bad_level", "Level must be 0-5.")
    with GLOCK:
        GW.set_containment(aid, b.level, b.reason[:200])
    return agent_dict(ID.REGISTRY.get(aid))


class ReleaseBody(__import__("pydantic").BaseModel):
    approver: str = ""


@app.post("/agents/{aid}/release")
def release(aid: str, b: ReleaseBody):
    need_agent(aid)
    if not b.approver.strip():
        raise Err(409, "needs_approval", "Releasing a contained agent needs an approver name.")
    with GLOCK:
        GW.release(aid, b.approver.strip()[:60])
    return agent_dict(ID.REGISTRY.get(aid))


@app.post("/agents/{aid}/kill")
def kill(aid: str):
    need_agent(aid)
    with GLOCK:
        GW.set_containment(aid, 5, "Killed by operator; token revoked")
    return agent_dict(ID.REGISTRY.get(aid))


# ------------------------------------------------------------------ sessions & calls
class SessionBody(__import__("pydantic").BaseModel):
    agent_id: str
    task: str = "manual session"


@app.post("/sessions")
def new_session(b: SessionBody):
    need_agent(b.agent_id)
    with GLOCK:
        s = GW.start_session(b.agent_id, b.task, via="lab")
    return {"session_id": s.id}


@app.post("/sessions/{sid}/end")
def end_session(sid: str):
    with GLOCK:
        try:
            return GW.end_session(sid)
        except KeyError:
            raise Err(404, "unknown_session", "No such session.")


class CallBody(__import__("pydantic").BaseModel):
    agent_id: str
    session_id: Optional[str] = None
    tool: str
    args: dict[str, Any] = {}
    protection: str = "tessera"
    hour: Optional[int] = None


def _verdict_out(v) -> dict:
    d = v.model_dump(mode="json")
    out = getattr(v, "_output", None)
    if out is not None:
        d["output"] = out
    _note_trail(v)
    return d


@app.post("/gateway/call")
def gateway_call(b: CallBody):
    need_agent(b.agent_id)
    if b.tool not in TOOLS:
        raise Err(422, "unknown_tool", f"Unknown tool '{b.tool}'. See /tools.")
    with GLOCK:
        sid = b.session_id
        if not sid or sid not in GW.sessions:
            sid = GW.start_session(b.agent_id, "manual call", via="lab", protection=b.protection if b.protection in ("tessera", "iam_only") else "tessera").id
        try:
            v = GW.handle(b.agent_id, sid, b.tool, b.args)
        except ValueError as e:
            raise Err(422, "bad_args", str(e))
    return _verdict_out(v)


_HIJACK_SESSIONS: dict[str, str] = {}


@app.post("/hijack/call")
def hijack_call(b: CallBody):
    a = need_agent(b.agent_id)
    if b.tool not in TOOLS:
        raise Err(422, "unknown_tool", f"Unknown tool '{b.tool}'. See /tools.")
    with GLOCK:
        sid = _HIJACK_SESSIONS.get(b.agent_id)
        if not sid or sid not in GW.sessions or GW.sessions[sid].ended or len(GW.sessions[sid].verdicts) > 60:
            sid = GW.start_session(b.agent_id, "(stolen token) attacker session", via="stolen_token", host=ID.STOLEN_HOST, hour=b.hour if b.hour is not None else 3,
                                   protection=b.protection if b.protection in ("tessera", "iam_only") else "tessera").id
            _HIJACK_SESSIONS[b.agent_id] = sid
        try:
            v = GW.handle(b.agent_id, sid, b.tool, b.args, via="stolen_token", host=ID.STOLEN_HOST)
        except ValueError as e:
            raise Err(422, "bad_args", str(e))
    return _verdict_out(v)


@app.get("/approvals")
def approvals():
    return [x for x in GW.approvals.values() if x["status"] == "pending"]


class ApproveBody(__import__("pydantic").BaseModel):
    approver: str = "analyst"


@app.post("/approvals/{aid}/approve")
def approve(aid: str, b: ApproveBody = Body(default=ApproveBody())):
    with GLOCK:
        try:
            v = GW.approve(aid, b.approver[:60])
        except KeyError:
            raise Err(404, "no_pending_approval", "That approval isn't pending any more.")
    return _verdict_out(v)


@app.post("/approvals/{aid}/reject")
def reject(aid: str, b: ApproveBody = Body(default=ApproveBody())):
    with GLOCK:
        try:
            GW.reject(aid, b.approver[:60])
        except KeyError:
            raise Err(404, "no_pending_approval", "That approval isn't pending any more.")
    return {"ok": True}


# ------------------------------------------------------------------ content
@app.get("/tools")
def tools():
    return public_catalog()


@app.get("/documents")
def documents():
    return [d.public() for d in DOCS.REGISTRY.values()]


@app.get("/documents/{did}/page/{page}.png")
def doc_page(did: str, page: int):
    if did not in DOCS.REGISTRY:
        raise Err(404, "unknown_document", "No such document.")
    try:
        png = DOCS.page_png(did, page)
    except (KeyError, IndexError):
        raise Err(404, "no_such_page", "That document has no such page (or isn't a PDF).")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=300"})


@app.get("/documents/{did}")
def document(did: str):
    d = DOCS.REGISTRY.get(did)
    if not d:
        raise Err(404, "unknown_document", "No such document.")
    out = d.public()
    out["text"] = d.analysis.visible_text if d.analysis else ""
    out["full_text"] = d.analysis.text if d.analysis else ""
    return out


@app.post("/documents/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        with GLOCK:
            d = DOCS.add_upload(file.filename or "upload", data)
    except ValueError as e:
        raise Err(422, "bad_upload", str(e))
    return d.public()


class TextDocBody(__import__("pydantic").BaseModel):
    title: str = "Pasted document"
    text: str
    hide: str = "none"


@app.post("/documents/text")
def text_doc(b: TextDocBody):
    if b.hide not in ("none", "white", "tiny", "offpage", "lowcontrast"):
        raise Err(422, "bad_hide", "hide must be none, white, tiny, offpage or lowcontrast.")
    try:
        with GLOCK:
            d = DOCS.add_text_doc(b.title, b.text, b.hide)
    except ValueError as e:
        raise Err(422, "bad_text", str(e))
    return d.public()


# ------------------------------------------------------------------ scenarios & runs
@app.get("/scenarios")
def scenarios():
    return SC.SCENARIOS


class RunBody(__import__("pydantic").BaseModel):
    attacker: Optional[str] = None
    disabled_layers: list[str] = []
    gullibility: float = 1.0
    protection: str = "tessera"
    declared: bool = True
    pace: float = 0.3


def _busy():
    n = sum(1 for r in RUNS.values() if r.state != "finished")
    if n >= 6:
        raise Err(429, "too_many_runs", "Six runs are already in progress. Wait a moment or press Reset.")


def _check_layers(ls: list[str]) -> set:
    bad = [l for l in ls if l not in LAYERS]
    if bad:
        raise Err(422, "bad_layer", f"Unknown layer(s): {', '.join(bad)}. Use {', '.join(LAYERS)}.")
    return set(ls)


@app.post("/scenarios/{sid}/run")
def run_scenario(sid: str, b: RunBody = Body(default=RunBody())):
    if sid not in {s["id"] for s in SC.SCENARIOS}:
        raise Err(404, "unknown_scenario", f"No scenario '{sid}'.")
    if b.protection not in ("tessera", "iam_only"):
        raise Err(422, "bad_protection", "protection must be tessera or iam_only")
    _busy()
    r = SC.run_scenario(sid, b.attacker or "static", _check_layers(b.disabled_layers), min(1.0, max(0.0, b.gullibility)), b.protection, min(1.0, max(0.0, b.pace)), b.declared)
    return {"run_id": r.id}


class LabBody(__import__("pydantic").BaseModel):
    agent_id: str
    document_id: str
    task: Optional[str] = None
    gullibility: float = 0.9
    disabled_layers: list[str] = []
    protection: str = "tessera"
    pace: float = 0.3


@app.post("/lab/run")
def lab_run(b: LabBody):
    need_agent(b.agent_id)
    if b.document_id not in DOCS.REGISTRY:
        raise Err(404, "unknown_document", "Pick a document from the library, or paste/upload one first.")
    if b.protection not in ("tessera", "iam_only"):
        raise Err(422, "bad_protection", "protection must be tessera or iam_only")
    _busy()
    r = SC.lab_run(b.agent_id, b.document_id, b.task, min(1.0, max(0.0, b.gullibility)), _check_layers(b.disabled_layers), b.protection, min(1.0, max(0.0, b.pace)))
    return {"run_id": r.id}


@app.get("/runs/{rid}")
def get_run(rid: str):
    r = RUNS.get(rid)
    if not r:
        raise Err(404, "unknown_run", "No such run.")
    if r.state != "finished":
        r.utility = compute_utility(r)
    return r.public()


class RedBody(__import__("pydantic").BaseModel):
    scenario: str = "S1"
    attacker: str = "static"
    disabled_layers: list[str] = []
    protection: str = "tessera"
    pace: float = 0.2


@app.post("/redteam/run")
def redteam(b: RedBody):
    return run_scenario(b.scenario, RunBody(attacker=b.attacker, disabled_layers=b.disabled_layers, protection=b.protection, pace=b.pace))


# ------------------------------------------------------------------ cases
@app.get("/cases")
def cases(status: Optional[str] = None, limit: int = 100):
    cs = sorted(GW.cases.values(), key=lambda c: -c.updated_ts)
    if status:
        cs = [c for c in cs if c.status == status]
    return [c.model_dump(mode="json") for c in cs[:limit]]


def _thread(c, verdicts) -> list[dict]:
    out = []
    for v in verdicts:
        for name, o in v.arg_origins.items():
            if o.control and o.trust == "untrusted" and o.source_id:
                ch = GW.chunks.get(o.source_id)
                if not ch:
                    continue
                val = str(v.args.get(name, ""))
                span = next((h for h in ch.hidden if val and (val.split("//")[-1][:20] in h["text"] or val[:30] in h["text"])), (ch.hidden[0] if ch.hidden else None))
                if not span or not span.get("bbox"):
                    continue            # nothing to point at on the page (visible text): the provenance graph shows it instead
                out.append({"from": {"doc": ch.doc_id, "page": span["page"] if span else None, "bbox": span["bbox"] if span else None, "text": (span["text"] if span else ch.text[:200])[:300], "chunk": ch.id, "label": ch.label,
                                     "technique": span["kind"] if span else "visible text"},
                            "to": {"verdict_id": v.id, "step": v.step, "tool": v.tool, "arg": name, "decision": v.decision}})
    return out


@app.get("/cases/{cid}")
def case_detail(cid: str):
    c = GW.cases.get(cid)
    if not c:
        raise Err(404, "unknown_case", "No such case.")
    vs = [GW.verdicts[i] for i in c.verdict_ids if i in GW.verdicts]
    s = GW.sessions.get(c.session_id)
    all_vs = list(s.verdicts) if s else vs
    chunks = [ch.public() for ch in (s.chunks if s else [])]
    rids = {v.receipt_id for v in all_vs if v.receipt_id}
    rec = [r.model_dump(mode="json") for r in CHAIN.items if r.id in rids or (r.kind == "containment" and r.payload.get("session") == c.session_id) or (r.kind == "approval" and r.payload.get("verdict") in {v.id for v in all_vs})]
    cont = [r.payload | {"receipt_id": r.id, "ts": r.ts} for r in CHAIN.items if r.kind == "containment" and (r.payload.get("session") == c.session_id or r.payload.get("agent") == c.agent_id)]
    util = None
    for r in RUNS.values():
        if c.session_id in r.session_ids and r.utility:
            util = r.utility; break
    return {"case": c.model_dump(mode="json"), "verdicts": [v.model_dump(mode="json") for v in all_vs], "chunks": chunks, "thread": _thread(c, all_vs), "containment": cont, "receipts": rec, "utility": util or compute_utility_for_session(s)}


def compute_utility_for_session(s) -> dict:
    if not s:
        return {}
    done = sum(1 for v in s.verdicts if v.executed); tot = len(s.verdicts)
    return {"legit_total": tot, "legit_done": done, "legit_pending_approval": sum(1 for v in s.verdicts if v.decision == "STEP_UP" and not v.executed), "legit_blocked": sum(1 for v in s.verdicts if v.decision == "DENY"), "retention": round(done / tot, 3) if tot else 1.0}


@app.get("/verdicts/{vid}/counterfactual")
def counterfactual(vid: str):
    v = GW.verdicts.get(vid)
    if not v:
        raise Err(404, "unknown_verdict", "No such verdict.")
    return v.counterfactual


# ------------------------------------------------------------------ contracts
def _contract_summary(role: str) -> dict:
    c = GW.contracts[role]
    con = c["contract"]
    return {"role": role, "id": con.id, "name": con.name, "version": con.version, "yaml": c["yaml"], "summary": f"{len(con.tools)} tools · never reads {', '.join(con.never_read) or 'nothing restricted'} · sends only to {', '.join(con.egress_allowlist) or 'nobody'}"}


@app.get("/contracts")
def contracts():
    return [_contract_summary(r) for r in GW.contracts]


@app.get("/contracts/{role}")
def contract_one(role: str):
    if role not in GW.contracts:
        raise Err(404, "unknown_role", "No contract for that role.")
    c = GW.contracts[role]
    return {**_contract_summary(role), "parsed": c["contract"].model_dump(mode="json"), "cedar": c["compiled"].text, "digest": c["compiled"].digest}


class YamlBody(__import__("pydantic").BaseModel):
    yaml: str
    approver: Optional[str] = None


@app.post("/contracts/validate")
def contract_validate(b: YamlBody):
    try:
        c = CT.parse(b.yaml)
        comp = CD.compile_contract(c)
        return {"ok": True, "errors": [], "cedar": comp.text, "digest": comp.digest}
    except CT.ContractError as e:
        return {"ok": False, "errors": e.errors}
    except ValueError as e:
        return {"ok": False, "errors": [{"path": "", "message": str(e)[:300]}]}


PROBES = [("files.read", {"path": "/hr/exec_comp_FY26_final.xlsx"}), ("files.read", {"path": "/finance/vendor_bank_details_FINAL.xlsx"}), ("hr.lookup_employee", {"employee_id": "E-1001"}),
          ("http.post", {"url": "https://collect.evil.example/u", "body": "x"}), ("email.send", {"to": "x@evil.example", "subject": "s", "body": "b"}), ("payments.create", {"po_id": "PO-1", "account": "ACC-X", "amount_inr": 900000}),
          ("purchasing.create_request", {"supplier_id": "SUP-ACME", "sku": "SKU-44", "quantity": 100, "amount_inr": 900000}), ("crm.lookup", {"customer_id": "C-204"}), ("http.get", {"url": "https://evil.example"})]


def _cedar_only(role: str, con, comp, tool: str, args: dict) -> bool:
    from ..provenance.ledger import extract_destination, domain_allowed
    from ..sim.catalog import resolve
    dc, _, decoy = resolve(tool, args)
    dest = extract_destination(tool, args); ok = domain_allowed(dest, con.egress_allowlist)
    rule = con.tools.get(tool)
    a: dict[str, Any] = {}
    for k in ("amount_inr", "quantity"):
        if k in args:
            a[k] = int(args[k])
    if "supplier_id" in args:
        a["supplier_in_catalog"] = str(args["supplier_id"]) in TL.SUPPLIERS
    if tool == "files.read":
        a["path_in_scope"] = CD.glob_match(str(args.get("path", "")), rule.paths) if rule and rule.paths else True
    ctx = {"args": a, "session": {"integrity": "trusted", "confidentiality": "low"}, "egress_allowed_after_sensitive": ok, "provenance": {"any_untrusted_arg": False}, "dest_allowlisted": ok,
           "approval": {"valid": False}, "tool_schema_hash": TOOLS[tool].pinned_hash}
    return CD.evaluate(comp, "agt_dryrun", tool, dc, decoy, ctx)["decision"] == "Allow"


@app.post("/contracts/{role}/dryrun")
def contract_dryrun(role: str, b: YamlBody):
    import random
    from ..sim import traffic
    if role not in GW.contracts:
        raise Err(404, "unknown_role", "No contract for that role.")
    try:
        new = CT.parse(b.yaml); ncomp = CD.compile_contract(new)
    except CT.ContractError as e:
        raise Err(422, "invalid_contract", "That contract has errors: " + "; ".join(x["message"] for x in e.errors[:3]), e.errors)
    old = GW.contracts[role]["contract"]; ocomp = GW.contracts[role]["compiled"]
    if new.id != role:
        raise Err(422, "id_mismatch", f"The contract id must stay '{role}'.")
    rng = random.Random(99); steps = 0; blocked: dict[str, dict] = {}; allowed_before = 0
    for _ in range(300):
        for st in traffic.gen_session(role, rng)["steps"]:
            steps += 1
            if _cedar_only(role, old, ocomp, st["tool"], st["args"]):
                allowed_before += 1
                if not _cedar_only(role, new, ncomp, st["tool"], st["args"]):
                    e = blocked.setdefault(st["tool"], {"tool": st["tool"], "count": 0, "example": st["args"]}); e["count"] += 1
    newly_allowed = []
    for t, a in PROBES:
        if not _cedar_only(role, old, ocomp, t, a) and _cedar_only(role, new, ncomp, t, a):
            newly_allowed.append({"tool": t, "count": 1, "example": a, "risky": True})
    widening = bool(newly_allowed) or bool(set(new.tools) - set(old.tools)) or bool(set(old.never_read) - set(new.never_read)) or bool(set(new.egress_allowlist) - set(old.egress_allowlist)) or any(
        (new.tools[t].where.get(k, {}).get("max", 0) > old.tools[t].where.get(k, {}).get("max", 0)) for t in new.tools if t in old.tools for k in new.tools[t].where)
    warns = []
    if newly_allowed:
        warns.append(f"This change would let the {old.name} do things it was explicitly blocked from: " + ", ".join(sorted({x['tool'] for x in newly_allowed})) + ".")
    if set(old.never_read) - set(new.never_read):
        warns.append("You removed data classes from never_read: " + ", ".join(set(old.never_read) - set(new.never_read)) + ".")
    if blocked:
        warns.append(f"{sum(x['count'] for x in blocked.values())} of {steps} normal steps in the last 300 sessions would now be blocked: this may break legitimate work.")
    return {"sessions_replayed": 300, "steps_replayed": steps, "newly_blocked": sorted(blocked.values(), key=lambda x: -x["count"]), "newly_allowed": newly_allowed,
            "benign_blocked_rate": round(sum(x["count"] for x in blocked.values()) / max(1, allowed_before), 4), "widening": widening, "warnings": warns}


@app.put("/contracts/{role}")
def contract_put(role: str, b: YamlBody):
    if role not in GW.contracts:
        raise Err(404, "unknown_role", "No contract for that role.")
    dr = contract_dryrun(role, b)
    if dr["widening"] and not (b.approver and b.approver.strip()):
        raise Err(409, "needs_approval", "This change widens what the agent may do. A second person must approve it (enter an approver name).", dr["warnings"])
    try:
        c = CT.parse(b.yaml)
    except CT.ContractError as e:
        raise Err(422, "invalid_contract", "That contract has errors.", e.errors)
    with GLOCK:
        c.version = GW.contracts[role]["contract"].version + 1
        GW.set_contract(role, CT.dump(c) if False else b.yaml.replace(f"version: {c.version - 1}", f"version: {c.version}", 1))
        CHAIN.add("contract_change", {"role": role, "version": c.version, "widening": dr["widening"], "approver": b.approver or "n/a"})
    return {**_contract_summary(role), "dryrun": dr}


# ------------------------------------------------------------------ changes
class ChangeBody(__import__("pydantic").BaseModel):
    role: str
    kind: str = "new_tool_version"
    tool: Optional[str] = None
    description: str = ""
    duration_min: int = 30


@app.get("/changes")
def changes():
    return [c.model_dump(mode="json") for c in GW.changes]


@app.post("/changes")
def add_change(b: ChangeBody):
    if b.role not in GW.contracts:
        raise Err(422, "unknown_role", "Unknown role.")
    if b.kind not in ("new_tool_version", "new_task_type", "volume_surge", "model_update"):
        raise Err(422, "bad_kind", "Unknown change kind.")
    if b.tool and b.tool not in TOOLS:
        raise Err(422, "unknown_tool", "Unknown tool.")
    now = time.time()
    ev = ChangeEvent(id="chg_" + uuid.uuid4().hex[:6], role=b.role, kind=b.kind, tool=b.tool, description=b.description[:200] or b.kind, start_ts=now, end_ts=now + max(1, min(b.duration_min, 1440)) * 60)
    with GLOCK:
        GW.changes.append(ev)
        CHAIN.add("change", {"id": ev.id, "role": ev.role, "tool": ev.tool, "kind": ev.kind})
    BUS.publish("change", ev.model_dump(mode="json"))
    return ev.model_dump(mode="json")


@app.delete("/changes/{cid}")
def del_change(cid: str):
    with GLOCK:
        GW.changes = [c for c in GW.changes if c.id != cid]
    return {"ok": True}


# ------------------------------------------------------------------ chains
@app.get("/chains")
def chains():
    edges = GW.chain_edges
    tainted_to = {e["to"] for e in edges if e["taint"] == "tainted"}
    pz = next((e["origin"] for e in edges if e["taint"] == "tainted"), None)
    nodes = [{"agent_id": a.id, "name": a.name, "role": a.role, "taint": "tainted" if (a.id in tainted_to or a.id == pz) else "clean", "level": GW.cont.agent[a.id], "patient_zero": a.id == pz} for a in ID.REGISTRY.agents.values()]
    return {"nodes": nodes, "edges": [{"from": e["from"], "to": e["to"], "ts": e["ts"], "taint": e["taint"], "task": e["task"], "chunks": []} for e in edges],
            "cascade": {"patient_zero": pz, "affected": sorted(tainted_to)}}


class FreezeBody(__import__("pydantic").BaseModel):
    patient_zero: str


@app.post("/chains/freeze")
def freeze(b: FreezeBody):
    need_agent(b.patient_zero)
    aff = {e["to"] for e in GW.chain_edges if e["origin"] == b.patient_zero and e["taint"] == "tainted"} | {b.patient_zero}
    with GLOCK:
        for aid in aff:
            if ID.REGISTRY.get(aid):
                GW.set_containment(aid, max(3, GW.cont.agent[aid]), f"Cascade freeze from patient zero {b.patient_zero}")
    return {"frozen": sorted(aff)}


# ------------------------------------------------------------------ receipts
@app.get("/receipts")
def receipts(limit: int = Query(200, le=2000)):
    return [r.model_dump(mode="json") for r in CHAIN.items[-limit:]]


@app.get("/receipts/verify")
def receipts_verify():
    return CHAIN.verify()


class TamperBody(__import__("pydantic").BaseModel):
    idx: int


@app.post("/receipts/tamper")
def receipts_tamper(b: TamperBody):
    if not ALLOW_TAMPER:
        raise Err(403, "disabled", "Tampering is disabled in this deployment.")
    if not CHAIN.tamper(b.idx):
        raise Err(404, "no_such_receipt", "No receipt at that index.")
    return {"ok": True, "idx": b.idx}


@app.get("/receipts/pubkey")
def pubkey():
    return {"alg": "ed25519", "signer": CHAIN.signer, "public_key": CHAIN.pubkey()}


# ------------------------------------------------------------------ bench
@app.get("/bench")
def bench():
    b = EV.cached()
    if not b:
        raise Err(503, "bench_warming", "The benchmark is still running for the first time. Try again in about 30 seconds.")
    return b


@app.post("/bench/run")
def bench_run():
    rid = EV.run_async()
    return {"run_id": rid}
