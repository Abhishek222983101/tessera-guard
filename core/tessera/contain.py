"""Containment ladder. Narrow *capabilities per session*, not the whole agent, until the evidence says otherwise.

L0 observe · L1 step-up risky effects · L2 narrow (write/delegate need a human; egress only to the allow-list)
L3 quarantine (read-only, outputs sanitised) · L4 decoy sandbox (tarpit) · L5 killed (token revoked).
Levels 1-2 live on the *session*; 3+ are sticky on the *agent* until a human releases it.
"""
from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

LEVEL_NAMES = ["Observe", "Step-up", "Narrow", "Quarantine", "Decoy sandbox", "Killed"]
MUTATING = {"write", "exec", "delegate"}


@dataclass
class Transition:
    agent_id: str
    session_id: Optional[str]
    frm: int
    to: int
    reason: str
    scope: str


class Containment:
    def __init__(self):
        self.agent: dict[str, int] = defaultdict(int)
        self.session: dict[str, int] = defaultdict(int)
        self.criticals: dict[str, int] = defaultdict(int)   # per session
        self.agent_criticals: dict[str, int] = defaultdict(int)
        self.decoy_hit: set[str] = set()

    def reset(self):
        self.__init__()

    def effective(self, agent_id: str, session_id: str) -> int:
        return max(self.agent[agent_id], self.session[session_id])

    def start_session(self, agent_id: str, session_id: str):
        self.session[session_id] = 0

    def escalate(self, agent_id: str, session_id: str, risk: float, triggers: set[str], decision: str) -> list[Transition]:
        out: list[Transition] = []
        cur = self.effective(agent_id, session_id)
        if cur >= 5:
            return out
        if risk >= 80 and decision in ("DENY", "STEP_UP"):
            self.criticals[session_id] += 1; self.agent_criticals[agent_id] += 1
        want, reason, scope = cur, "", "session"
        c = self.criticals[session_id]
        if "decoy_touch" in triggers:
            want, reason, scope = max(want, 3), "A decoy no real job touches was accessed", "agent"
        if c >= 3 and cur >= 3:
            want, reason, scope = max(want, 4), "Repeated critical attempts while quarantined", "agent"
        elif c >= 3:
            want, reason, scope = max(want, 3), "Three critical actions in one session", "agent"
        elif c >= 1 and cur < 2:
            want, reason, scope = 2, "Critical action blocked: capabilities narrowed for this session", "session"
        elif risk >= 60 and cur < 1:
            want, reason, scope = 1, "High risk: risky effects now need a human", "session"
        if want > cur:
            if want >= 3:
                self.agent[agent_id] = want
            self.session[session_id] = max(self.session[session_id], want)
            out.append(Transition(agent_id, session_id, cur, want, reason, scope))
        return out

    def set_level(self, agent_id: str, level: int, reason: str, session_id: Optional[str] = None) -> Transition:
        frm = self.agent[agent_id]
        self.agent[agent_id] = level
        if session_id:
            self.session[session_id] = level
        return Transition(agent_id, session_id, frm, level, reason, "agent")

    def release(self, agent_id: str) -> Transition:
        frm = self.agent[agent_id]
        self.agent[agent_id] = 0
        for sid in list(self.session):
            pass
        self.agent_criticals[agent_id] = 0
        return Transition(agent_id, None, frm, 0, "Released by a human approver", "agent")


def gate(level: int, effect: str, dest_ok: bool, untrusted_control: bool, approved: bool) -> tuple[Optional[str], str]:
    """-> (decision override | None, reason_code). Applied after Cedar says ALLOW."""
    if level >= 5:
        return "DENY", "KILLED"
    if level == 4:
        return "ALLOW", "TARPIT"            # executed in the sandbox by the gateway
    if level >= 3:
        if effect != "read":
            return "DENY", "QUARANTINED"
        return "MODIFY", "QUARANTINE_SANITISED"
    if level == 2:
        if effect in MUTATING and not approved:
            return "STEP_UP", "NARROWED_NEEDS_APPROVAL"
        if effect == "egress" and (not dest_ok or untrusted_control):
            return "DENY", "NARROWED_EGRESS"
    if level == 1 and effect in MUTATING | {"egress"} and not approved:
        return "STEP_UP", "STEP_UP_LEVEL1"
    return None, ""
