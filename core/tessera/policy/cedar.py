"""Contract -> Cedar. Schema + policies validated in spike S1 (cedar CLI 4.14 and cedarpy agree on all decisions).

Deny-overrides: Cedar's `forbid` always wins over `permit`; no matching permit = default deny.
"""
from __future__ import annotations
import fnmatch, hashlib, re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import cedarpy

from .contract import Contract
from ..sim.catalog import TOOLS

SCHEMA = """
entity Role;
entity DataClass;
entity Agent in [Role] = { never_read: Set<DataClass> };
entity Tool = { effect: String, data_class: DataClass, pinned_hash: String, decoy: Bool };
action call appliesTo {
  principal: [Agent],
  resource: [Tool],
  context: {
    args: { amount_inr?: Long, quantity?: Long, supplier_in_catalog?: Bool, path_in_scope?: Bool },
    session: { integrity: String, confidentiality: String },
    egress_allowed_after_sensitive: Bool,
    provenance: { any_untrusted_arg: Bool },
    dest_allowlisted: Bool,
    approval: { valid: Bool },
    tool_schema_hash: String
  }
};
"""

_SCHEMA_H = cedarpy.Schema.from_str(SCHEMA)


def _q(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def compile_policies(c: Contract) -> str:
    role = _q(c.id)
    out: list[str] = [f"// compiled from {c.id} v{c.version}"]
    n = 0
    for tool, rule in c.tools.items():
        conds: list[str] = []
        for k, cond in rule.where.items():
            if "max" in cond:
                conds.append(f"context.args has {k} && context.args.{k} <= {int(cond['max'])}")
            if "eq" in cond:
                val = "" if cond["eq"] else "!"
                conds.append(f"context.args has {k} && {val}context.args.{k}")
        if rule.paths:
            conds.append("context.args has path_in_scope && context.args.path_in_scope")
        if TOOLS[tool].effect == "egress":
            conds.append("context.dest_allowlisted")
        when = f"\nwhen {{ {' && '.join(conds)} }}" if conds else ""
        out.append(f'@id("permit.{_q(tool)}")\npermit (principal in Role::"{role}", action == Action::"call", resource == Tool::"{_q(tool)}"){when};')
        n += 1
    out += [
        '@id("forbid.never_read")\nforbid (principal, action == Action::"call", resource)\nwhen { principal.never_read.contains(resource.data_class) };',
        '@id("forbid.decoy")\nforbid (principal, action == Action::"call", resource)\nwhen { resource.decoy };',
        '@id("forbid.egress_after_sensitive")\nforbid (principal, action == Action::"call", resource)\nwhen { resource.effect == "egress" && context.session.confidentiality == "sensitive" && !context.egress_allowed_after_sensitive };',
        '@id("forbid.untrusted_control_arg")\nforbid (principal, action == Action::"call", resource)\nwhen { ["egress","write","exec","delegate"].contains(resource.effect) && context.provenance.any_untrusted_arg && !context.dest_allowlisted }\nunless { context.approval.valid };',
        '@id("forbid.tool_drift")\nforbid (principal, action == Action::"call", resource)\nwhen { context.tool_schema_hash != resource.pinned_hash };',
    ]
    return "\n\n".join(out)


@dataclass
class Compiled:
    contract: Contract
    text: str
    policy_set: Any
    digest: str


_CACHE: dict[str, Compiled] = {}


def compile_contract(c: Contract) -> Compiled:
    text = compile_policies(c)
    # key on the WHOLE contract (never_read, allow-list, budgets live in entities/config, not in the policy text)
    dig = hashlib.sha256((text + c.model_dump_json()).encode()).hexdigest()[:12]
    if dig in _CACHE:
        return _CACHE[dig]
    v = cedarpy.validate_policies(text, SCHEMA)
    if not v.validation_passed:
        raise ValueError(f"compiled Cedar failed validation: {v}")
    comp = Compiled(c, text, cedarpy.PolicySet.from_str(text), dig)
    if len(_CACHE) > 64:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[dig] = comp
    return comp


def glob_match(path: str, globs: list[str]) -> bool:
    for g in globs:
        rx = re.escape(g).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
        if re.fullmatch(rx, path):
            return True
    return False


def _entities(c: Contract, agent_id: str, tool: str, data_class: str, decoy: bool, pinned: str) -> list[dict]:
    dcs = {dc for dc in set(c.never_read) | {data_class}}
    ents: list[dict] = [{"uid": {"type": "Role", "id": c.id}, "attrs": {}, "parents": []}]
    ents += [{"uid": {"type": "DataClass", "id": d}, "attrs": {}, "parents": []} for d in sorted(dcs)]
    ents.append({"uid": {"type": "Agent", "id": agent_id}, "attrs": {"never_read": [{"__entity": {"type": "DataClass", "id": d}} for d in c.never_read]},
                 "parents": [{"type": "Role", "id": c.id}]})
    ents.append({"uid": {"type": "Tool", "id": tool}, "attrs": {"effect": TOOLS[tool].effect, "data_class": {"__entity": {"type": "DataClass", "id": data_class}},
                                                                 "pinned_hash": pinned, "decoy": decoy}, "parents": []})
    return ents


def evaluate(comp: Compiled, agent_id: str, tool: str, data_class: str, decoy: bool, ctx: dict) -> dict:
    """-> {decision: Allow|Deny, policies: [ids], errors: [...]}"""
    c = comp.contract
    if tool not in TOOLS:
        return {"decision": "Deny", "policies": ["unknown_tool"], "errors": []}
    ents = _entities(c, agent_id, tool, data_class, decoy, TOOLS[tool].pinned_hash)
    req = {"principal": {"type": "Agent", "id": agent_id}, "action": {"type": "Action", "id": "call"},
           "resource": {"type": "Tool", "id": tool}, "context": ctx}
    r = cedarpy.is_authorized(req, comp.policy_set, ents, schema=_SCHEMA_H)
    ids = []
    ann = getattr(r.diagnostics, "id_annotations_by_reason", None) or {}
    for reason in (r.diagnostics.reasons or []):
        ids.append(ann.get(reason, reason) if isinstance(ann, dict) else reason)
    dec = str(r.decision.value) if hasattr(r.decision, "value") else str(r.decision)
    if dec == "Deny" and not ids:
        ids = ["default_deny.no_permit"]
    return {"decision": dec, "policies": ids, "errors": [str(e) for e in (r.diagnostics.errors or [])]}
