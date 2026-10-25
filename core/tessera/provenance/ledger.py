"""Provenance ledger + Argument-Provenance Matching (APM-lite).

Every tool output becomes a labelled chunk. For each outgoing action, APM answers: where did each argument value come from?
Control args (path, recipient, URL, account) must not originate in untrusted content; data args may.
"""
from __future__ import annotations
import re, urllib.parse
from dataclasses import dataclass, field
from typing import Any, Optional

from rapidfuzz import fuzz

from ..models import ArgOrigin
from ..sim.catalog import TOOLS

URL_RX = re.compile(r"https?://[^\s\"'<>)]+", re.I)
EMAIL_RX = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PATH_RX = re.compile(r"/[\w.\-]+(?:/[\w.\-]+)+")


@dataclass
class Chunk:
    id: str
    session_id: str
    step: int
    source: str                  # user | tool:<name> | agent:<id>
    label: str                   # human label (doc title / path)
    trust: str                   # trusted | untrusted
    text: str
    doc_id: Optional[str] = None
    sensitive: bool = False
    data_class: str = ""
    hidden_text: bool = False
    injection_score: float = 0.0
    hidden: list[dict] = field(default_factory=list)
    inherited: bool = False

    def public(self) -> dict:
        return {"id": self.id, "source": self.source, "label": self.label, "trust": self.trust, "doc": self.doc_id, "step": self.step,
                "sensitive": self.sensitive, "data_class": self.data_class, "hidden_text": self.hidden_text,
                "injection_score": self.injection_score, "hidden": self.hidden[:5], "text_excerpt": self.text[:600], "inherited": self.inherited}


def _norm(s: str) -> str:
    s = urllib.parse.unquote(str(s)).lower()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"^https?://", "", s).rstrip("/")
    return s.replace("​", "")


def _numbers(text: str) -> set[int]:
    out = set()
    for m in re.finditer(r"\d[\d,]*(?:\.\d+)?", text):
        try:
            out.add(int(float(m.group(0).replace(",", ""))))
        except ValueError:
            pass
    return out


def _find(value: str, chunk_text: str, numeric: bool) -> Optional[str]:
    """-> match kind or None."""
    if not value or len(value) < 3:
        return None
    if value in chunk_text:
        return "exact"
    nv, nt = _norm(value), _norm(chunk_text)
    if len(nv) >= 4 and nv in nt:
        return "normalized"
    if len(value) >= 8 and fuzz.partial_ratio(value.lower(), chunk_text.lower()) >= 92:
        return "fuzzy"
    # host / domain / email / path pieces of the value present in the text
    for rx in (URL_RX, EMAIL_RX):
        for m in rx.finditer(str(value)):
            host = urllib.parse.urlparse(m.group(0)).netloc.lower() if m.group(0).startswith("http") else m.group(0).split("@")[-1].lower()
            if host and host in chunk_text.lower():
                return "normalized"
    return None


def apm(tool: str, args: dict[str, Any], chunks: list[Chunk], user_text: str) -> tuple[dict[str, ArgOrigin], bool, dict]:
    """-> (arg_origins, any_untrusted_control_arg, extras{carries_sensitive,sensitive_chunks[]})"""
    spec = TOOLS[tool]
    origins: dict[str, ArgOrigin] = {}
    any_untrusted_control = False
    extras: dict[str, Any] = {"carries_sensitive": False, "sensitive_chunks": [], "untrusted_control": []}
    for name, raw in args.items():
        v = raw if isinstance(raw, str) else str(raw)
        control = name in spec.control_args
        numeric = isinstance(raw, (int, float)) and not isinstance(raw, bool)
        o = ArgOrigin(origin="model_unknown", trust="trusted", control=control)
        if _find(v, user_text, numeric) or (numeric and int(raw) in _numbers(user_text)):
            o = ArgOrigin(origin="user", trust="trusted", control=control, source_label="your task", match="exact")
        else:
            hits_u, hits_t = None, None
            for ch in reversed(chunks):
                if ch.source == "user":
                    continue
                m = _find(v, ch.text, numeric) if not numeric else ("numeric" if int(raw) in _numbers(ch.text) and int(raw) > 99 else None)
                if m:
                    if ch.trust == "untrusted" and hits_u is None:
                        hits_u = (ch, m)
                    elif ch.trust == "trusted" and hits_t is None:
                        hits_t = (ch, m)
            if hits_u and hits_t:
                ch, m = hits_u
                o = ArgOrigin(origin="mixed", trust="mixed", control=control, source_id=ch.id, source_label=ch.label, match=m)
            elif hits_u:
                ch, m = hits_u
                o = ArgOrigin(origin="untrusted_chunk", trust="untrusted", control=control, source_id=ch.id, source_label=ch.label, match=m)
            elif hits_t:
                ch, m = hits_t
                o = ArgOrigin(origin="trusted_tool", trust="trusted", control=control, source_id=ch.id, source_label=ch.label, match=m)
        origins[name] = o
        if control and o.trust == "untrusted":
            any_untrusted_control = True
            extras["untrusted_control"].append(name)
        # does this value carry sensitive content out?
        if not control and isinstance(raw, str) and len(raw) >= 30:
            for ch in chunks:
                if ch.sensitive and any(len(ln.strip()) >= 20 and ln.strip() in raw for ln in ch.text.splitlines()):
                    extras["carries_sensitive"] = True
                    extras["sensitive_chunks"].append(ch.id)
    return origins, any_untrusted_control, extras


def extract_destination(tool: str, args: dict[str, Any]) -> Optional[str]:
    """Registrable host the action sends data to (for allow-listing)."""
    if tool == "http.post":
        u = str(args.get("url", ""))
        h = urllib.parse.urlparse(u if "://" in u else "https://" + u).netloc.lower().split(":")[0]
        return h or None
    if tool == "email.send":
        to = str(args.get("to", ""))
        return to.split("@")[-1].lower() if "@" in to else None
    return None


def domain_allowed(dest: Optional[str], allow: list[str]) -> bool:
    if not dest:
        return False
    return any(dest == d or dest.endswith("." + d) for d in allow)
