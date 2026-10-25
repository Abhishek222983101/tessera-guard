"""Tool Catalog (SYSTEM-ARCHITECTURE §6.3): effect, data class, output trust, which args are CONTROL args.

Control args decide *where* an action goes or *what it touches* (path, recipient, URL, supplier, account).
Data args are payload (body, amount, notes). Untrusted content may flow into data args; it may not steer control args.
"""
from __future__ import annotations
import hashlib
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Tool:
    name: str
    description: str
    effect: str
    data_class: str
    output_trust: str            # trusted | untrusted
    control_args: list[str] = field(default_factory=list)
    data_args: list[str] = field(default_factory=list)
    fields: list[dict[str, Any]] = field(default_factory=list)   # UI form spec for the Hijack console
    pinned_hash: str = ""

    def __post_init__(self):
        if not self.pinned_hash:
            self.pinned_hash = schema_hash(self.name, self.description)


def schema_hash(name: str, description: str) -> str:
    return hashlib.sha256(f"{name}\n{description}".encode()).hexdigest()[:16]


def _f(name, typ="string", example=None, control=False):
    return {"name": name, "type": typ, "example": example, "control": control}


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("suppliers.search", "Search the approved supplier catalog by name.", "read", "supplier.catalog", "trusted",
         [], ["query"], [_f("query", example="ACME")]),
    Tool("suppliers.get_price", "Get the catalog price for a supplier SKU.", "read", "supplier.catalog", "trusted",
         ["supplier_id"], ["sku"], [_f("supplier_id", example="SUP-ACME", control=True), _f("sku", example="SKU-44")]),
    Tool("purchasing.create_request", "Create a purchase request (draft PO) for approval.", "write", "supplier.catalog", "trusted",
         ["supplier_id"], ["amount_inr", "sku", "quantity"],
         [_f("supplier_id", example="SUP-ACME", control=True), _f("sku", example="SKU-44"), _f("quantity", "number", 100), _f("amount_inr", "number", 180000)]),
    Tool("files.read", "Read a file from the company file share.", "read", "dynamic", "dynamic",
         ["path"], [], [_f("path", example="/docs/suppliers/acme_q4.pdf", control=True)]),
    Tool("hr.lookup_employee", "Look up an employee record in the HR system.", "read", "hr.confidential", "trusted",
         ["employee_id"], [], [_f("employee_id", example="E-1001", control=True)]),
    Tool("crm.lookup", "Look up a customer in the CRM.", "read", "customer.pii", "trusted",
         ["customer_id"], [], [_f("customer_id", example="C-204", control=True)]),
    Tool("erp.get_po", "Fetch a purchase order / invoice from the ERP.", "read", "finance.confidential", "trusted",
         ["po_id"], [], [_f("po_id", example="PO-7781", control=True)]),
    Tool("erp.create_po_v2", "Create a purchase order (v2 schema, adds cost-centre).", "write", "supplier.catalog", "trusted",
         ["supplier_id"], ["amount_inr", "cost_centre"],
         [_f("supplier_id", example="SUP-ACME", control=True), _f("amount_inr", "number", 90000), _f("cost_centre", example="CC-12")]),
    Tool("payments.create", "Create an outgoing payment to a registered vendor account.", "write", "finance.confidential", "trusted",
         ["account", "po_id"], ["amount_inr"],
         [_f("po_id", example="PO-7781", control=True), _f("account", example="ACC-ACME-01", control=True), _f("amount_inr", "number", 120000)]),
    Tool("email.send", "Send an email.", "egress", "system", "trusted",
         ["to"], ["subject", "body"], [_f("to", example="buyer@corp.example", control=True), _f("subject", example="Price check"), _f("body", example="ACME quote attached")]),
    Tool("http.get", "Fetch a web page.", "read", "web.external", "untrusted",
         ["url"], [], [_f("url", example="https://news.example/markets", control=True)]),
    Tool("http.post", "POST data to an HTTP endpoint.", "egress", "system", "trusted",
         ["url"], ["body"], [_f("url", example="https://collect.evil.example/u", control=True), _f("body", example="...")]),
    Tool("calc.run", "Evaluate a spreadsheet-style formula.", "exec", "system", "trusted",
         [], ["expr"], [_f("expr", example="180000*1.18")]),
    Tool("agent.delegate", "Delegate a sub-task to another agent (carries context).", "delegate", "system", "trusted",
         ["to_agent"], ["task"], [_f("to_agent", example="agt_finance_01", control=True), _f("task", example="Pay invoice PO-7781")]),
]}

SUPPLIER_DOMAINS = {"corp.example", "acme-supply.example", "globex.example", "initech.example", "umbrella.example", "stark.example", "customer.example"}  # company + partner domains

# files.read path -> (data_class, output_trust, decoy)
def classify_path(path: str) -> tuple[str, str, bool]:
    p = path.lower()
    if "payroll_backup" in p or "vendor_bank_details_final" in p:
        return ("hr.confidential" if "payroll" in p else "finance.confidential", "trusted", True)
    if p.startswith("/hr/"):
        return "hr.confidential", "trusted", False
    if p.startswith("/finance/"):
        return "finance.confidential", "trusted", False
    if p.startswith("/kb/"):
        return "kb.public", "trusted", False
    if p.startswith("/docs/"):
        return "public.docs", "untrusted", False       # supplier/partner-originated documents
    return "unknown", "untrusted", False


def resolve(tool: str, args: dict) -> tuple[str, str, bool]:
    """-> (data_class, output_trust, decoy) for this concrete call."""
    t = TOOLS[tool]
    if tool == "files.read":
        return classify_path(str(args.get("path", "")))
    return t.data_class, t.output_trust, False


def public_catalog() -> list[dict]:
    return [dict(name=t.name, description=t.description, effect=t.effect, data_class=t.data_class, output_trust=t.output_trust,
                 control_args=t.control_args, data_args=t.data_args, fields=t.fields, pinned_hash=t.pinned_hash) for t in TOOLS.values()]
