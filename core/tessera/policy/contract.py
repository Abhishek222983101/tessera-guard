"""Role Contract: the declared role as data. YAML in, validated model out (with human-readable errors)."""
from __future__ import annotations
import re
from typing import Any
import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator

from ..sim.catalog import TOOLS

DATA_CLASSES = ["supplier.catalog", "public.docs", "hr.confidential", "finance.confidential", "customer.pii", "kb.public", "web.external", "system", "unknown"]
# arguments the gateway derives and hands to Cedar (see policy/cedar.py SCHEMA)
DERIVED_ARGS = {"amount_inr": "Long", "quantity": "Long", "supplier_in_catalog": "Bool", "path_in_scope": "Bool"}
DOMAIN = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")


class ToolRule(BaseModel):
    where: dict[str, dict[str, Any]] = {}      # {param: {max: n} | {eq: bool}}
    step_up_over: dict[str, int] = {}          # {param: n} -> human approval above n
    paths: list[str] = []                      # glob allow-list for files.read (/docs/suppliers/**)
    note: str = ""


class Budgets(BaseModel):
    max_steps_per_session: int = 40
    max_bytes_out_per_session: int = 20_000
    max_bytes_out_per_day: int = 60_000


class Contract(BaseModel):
    id: str
    name: str
    purpose: str
    version: int = 1
    tools: dict[str, ToolRule]
    never_read: list[str] = []
    egress_allowlist: list[str] = []
    budgets: Budgets = Budgets()
    expected_flow: list[str] = []              # documentation: typical task flow, shown in the Twin page

    @field_validator("id")
    @classmethod
    def _id(cls, v):
        if not re.fullmatch(r"role\.[a-z0-9_]{2,30}", v):
            raise ValueError("id must look like role.procurement")
        return v


class ContractError(Exception):
    def __init__(self, errors: list[dict]):
        self.errors = errors
        super().__init__("; ".join(e["message"] for e in errors))


def parse(text: str) -> Contract:
    if len(text) > 20_000:
        raise ContractError([{"path": "", "message": "contract too large (20 KB max)"}])
    if re.search(r"(^|[\s\[{,:])[&*][A-Za-z0-9_-]+", text):
        raise ContractError([{"path": "yaml", "message": "YAML anchors and aliases are not allowed in contracts"}])
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as e:
        line = getattr(getattr(e, "problem_mark", None), "line", None)
        raise ContractError([{"path": "yaml", "line": (line + 1) if line is not None else None, "message": f"YAML error: {getattr(e, 'problem', e)}"}])
    if not isinstance(raw, dict):
        raise ContractError([{"path": "", "message": "contract must be a YAML mapping"}])
    try:
        c = Contract.model_validate(raw)
    except ValidationError as e:
        raise ContractError([{"path": ".".join(str(p) for p in er["loc"]), "message": er["msg"]} for er in e.errors()])
    errs = []
    for t, rule in c.tools.items():
        if t not in TOOLS:
            errs.append({"path": f"tools.{t}", "message": f"unknown tool '{t}' (not in the Tool Catalog)"})
            continue
        for k, cond in rule.where.items():
            if k not in DERIVED_ARGS:
                errs.append({"path": f"tools.{t}.where.{k}", "message": f"'{k}' is not a constrainable argument. Use one of {sorted(DERIVED_ARGS)}"})
            elif not (set(cond) <= {"max", "eq"} and cond):
                errs.append({"path": f"tools.{t}.where.{k}", "message": "use {max: <number>} or {eq: true|false}"})
        for k in rule.step_up_over:
            if k not in DERIVED_ARGS:
                errs.append({"path": f"tools.{t}.step_up_over.{k}", "message": f"'{k}' is not a constrainable argument"})
        if rule.paths and t != "files.read":
            errs.append({"path": f"tools.{t}.paths", "message": "paths only applies to files.read"})
    for dc in c.never_read:
        if dc not in DATA_CLASSES:
            errs.append({"path": "never_read", "message": f"unknown data class '{dc}'. Use one of {DATA_CLASSES}"})
    for d in c.egress_allowlist:
        if not DOMAIN.match(d):
            errs.append({"path": "egress_allowlist", "message": f"'{d}' is not a plain domain (example: corp.example)"})
    if errs:
        raise ContractError(errs)
    return c


def dump(c: Contract) -> str:
    return yaml.safe_dump(c.model_dump(mode="json"), sort_keys=False, allow_unicode=True)


DEFAULT_CONTRACTS: dict[str, str] = {
"role.procurement": """id: role.procurement
name: Procurement Agent
purpose: Checks supplier prices and drafts purchase requests under INR 5 lakh.
version: 3
tools:
  suppliers.search: {}
  suppliers.get_price: {}
  files.read:
    paths: ["/docs/suppliers/**"]
    note: supplier quotes and invoices only
  purchasing.create_request:
    where:
      amount_inr: {max: 500000}
      supplier_in_catalog: {eq: true}
    step_up_over: {amount_inr: 250000}
  erp.create_po_v2:
    where:
      amount_inr: {max: 500000}
      supplier_in_catalog: {eq: true}
  email.send:
    note: internal and approved supplier domains only
never_read: [hr.confidential, finance.confidential, customer.pii]
egress_allowlist: [corp.example, acme-supply.example, globex.example, initech.example]
budgets: {max_steps_per_session: 30, max_bytes_out_per_session: 4000, max_bytes_out_per_day: 12000}
expected_flow: [suppliers.search, files.read, suppliers.get_price, purchasing.create_request, email.send]
""",
"role.support": """id: role.support
name: Customer Support Agent
purpose: Answers customer questions from the CRM and the knowledge base.
version: 2
tools:
  crm.lookup: {}
  files.read:
    paths: ["/kb/**"]
  email.send: {}
never_read: [hr.confidential, finance.confidential, supplier.catalog]
egress_allowlist: [corp.example, customer.example]
budgets: {max_steps_per_session: 20, max_bytes_out_per_session: 3000, max_bytes_out_per_day: 9000}
expected_flow: [crm.lookup, files.read, email.send]
""",
"role.finance_ap": """id: role.finance_ap
name: Finance AP Agent
purpose: Pays approved supplier invoices that match a purchase order.
version: 4
tools:
  erp.get_po: {}
  files.read:
    paths: ["/docs/suppliers/**"]
  payments.create:
    where:
      amount_inr: {max: 300000}
    step_up_over: {amount_inr: 150000}
  email.send: {}
  calc.run: {}
never_read: [hr.confidential, customer.pii]
egress_allowlist: [corp.example]
budgets: {max_steps_per_session: 20, max_bytes_out_per_session: 2000, max_bytes_out_per_day: 6000}
expected_flow: [erp.get_po, files.read, calc.run, payments.create]
""",
"role.research": """id: role.research
name: Market Research Agent
purpose: Reads public web pages and summarises market trends; hands finance tasks to other agents.
version: 1
tools:
  http.get: {}
  files.read:
    paths: ["/docs/market/**", "/docs/suppliers/**"]
  agent.delegate: {}
  email.send: {}
never_read: [hr.confidential, finance.confidential, customer.pii, supplier.catalog]
egress_allowlist: [corp.example]
budgets: {max_steps_per_session: 25, max_bytes_out_per_session: 3000, max_bytes_out_per_day: 9000}
expected_flow: [http.get, files.read, email.send]
""",
}
