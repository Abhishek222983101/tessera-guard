"""Identity: agent registry, tokens, and the 'classic IAM' check. The token check is intentionally what real IAM does:
valid signature + not expired + scope pattern allows the tool. It is the left lane of the two-lane view."""
from __future__ import annotations
import fnmatch, time, uuid
from dataclasses import dataclass, field
from typing import Optional

import jwt

from .config import JWT_SECRET

ISS = "idp.corp.example"
ROLE_NAMES = {"role.procurement": "Procurement Agent", "role.support": "Support Agent", "role.finance_ap": "Finance AP Agent", "role.research": "Research Agent"}
# Over-broad scopes on purpose: teams grant `files.*` and `http.*` "to be safe". This is the real-world gap.
ROLE_SCOPES = {
    "role.procurement": ["suppliers.*", "purchasing.*", "files.*", "email.*", "http.*", "hr.*", "erp.*", "calc.*"],
    "role.support": ["crm.*", "files.*", "email.*", "http.*", "hr.*"],
    "role.finance_ap": ["erp.*", "files.*", "payments.*", "email.*", "calc.*", "http.*", "hr.*"],
    "role.research": ["http.*", "files.*", "email.*", "agent.*", "suppliers.*", "hr.*"],
}
ROLE_HOSTS = {"role.procurement": ["agent-runtime-01"], "role.support": ["agent-runtime-02"], "role.finance_ap": ["agent-runtime-03"], "role.research": ["agent-runtime-04"]}
STOLEN_HOST = "203.0.113.9"


@dataclass
class Agent:
    id: str
    name: str
    role: str
    scopes: list[str]
    hosts: list[str]
    created_ts: float = field(default_factory=time.time)
    sessions_seen: int = 0
    killed: bool = False
    token_jti: str = ""
    template: bool = False

    def token(self) -> str:
        return jwt.encode({"iss": ISS, "sub": self.id, "aud": "tessera-gateway", "scope": self.scopes, "jti": self.token_jti,
                           "iat": int(time.time()), "exp": int(time.time()) + 3600, "role": self.role}, JWT_SECRET, algorithm="HS256")


class Registry:
    def __init__(self):
        self.agents: dict[str, Agent] = {}
        self.revoked: set[str] = set()

    def seed(self):
        self.agents.clear(); self.revoked.clear()
        for aid, role in [("agt_proc_01", "role.procurement"), ("agt_supp_01", "role.support"), ("agt_fin_01", "role.finance_ap"), ("agt_res_01", "role.research")]:
            self.agents[aid] = Agent(aid, ROLE_NAMES[role], role, ROLE_SCOPES[role], ROLE_HOSTS[role], sessions_seen=0, token_jti=uuid.uuid4().hex[:8])

    def spawn(self, role: str, name: Optional[str] = None) -> Agent:
        if role not in ROLE_NAMES:
            raise KeyError(role)
        n = sum(1 for a in self.agents.values() if a.role == role) + 1
        aid = f"agt_{role.split('.')[1][:4]}_{n:02d}_{uuid.uuid4().hex[:3]}"
        a = Agent(aid, (name or f"{ROLE_NAMES[role]} #{n}")[:60], role, ROLE_SCOPES[role], ROLE_HOSTS[role], token_jti=uuid.uuid4().hex[:8])
        self.agents[aid] = a
        return a

    def get(self, aid: str) -> Optional[Agent]:
        return self.agents.get(aid)

    def revoke(self, aid: str):
        a = self.agents.get(aid)
        if a:
            self.revoked.add(a.token_jti); a.killed = True


def iam_check(token: str, tool: str, registry: Registry) -> dict:
    """What a conventional IAM gateway answers: is this identity valid, and may it call this API?"""
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience="tessera-gateway", issuer=ISS)
    except jwt.ExpiredSignatureError:
        return {"valid": False, "scope_ok": False, "reason": "token expired", "label": "token expired"}
    except jwt.PyJWTError:
        return {"valid": False, "scope_ok": False, "reason": "token invalid", "label": "token invalid"}
    if claims.get("jti") in registry.revoked:
        return {"valid": False, "scope_ok": False, "reason": "token revoked", "label": "token revoked"}
    scopes = claims.get("scope", [])
    hit = next((s for s in scopes if fnmatch.fnmatch(tool, s)), None)
    if hit:
        return {"valid": True, "scope_ok": True, "reason": "ok", "label": f"token valid · scope {hit} allows {tool}"}
    return {"valid": True, "scope_ok": False, "reason": "scope missing", "label": f"token valid · scope does not cover {tool}"}


REGISTRY = Registry()
