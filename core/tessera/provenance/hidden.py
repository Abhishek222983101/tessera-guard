"""Content analysis: hidden text in PDFs/HTML and instruction-like phrases (the 'indirect prompt injection' signal).

Hidden-text techniques covered: white/near-white on white, <=2pt fonts, text outside the page box,
zero-width characters, HTML display:none / visibility:hidden / font-size:0 / comments / white-on-white.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field, asdict
from typing import Any

import pymupdf as fitz  # PyMuPDF
from bs4 import BeautifulSoup, Comment

ZW = re.compile("[​‌‍⁠﻿]")

# phrase -> weight. Visible AND hidden text is scanned; hidden text multiplies the weight.
INJECTION_PATTERNS: list[tuple[str, float, str]] = [
    (r"ignore (all |any )?(the )?(previous|prior|above) (instructions|rules|prompts?)", 0.9, "override"),
    (r"disregard (all |any )?(the )?(previous|prior|above)", 0.9, "override"),
    (r"(you are|you're) now (in )?(a |an )?[\w -]{3,30}(mode|agent|assistant)", 0.6, "role_swap"),
    (r"\b(also|then|next|before (replying|responding|finishing)|first|additionally)\b[^.\n]{0,60}\b(read|open|fetch|retrieve|access|send|post|upload|forward|email|transfer|pay)\b", 0.7, "extra_task"),
    (r"\b(send|post|upload|forward|exfiltrate)\b[^.\n]{0,80}(https?://|\b[\w.-]+@[\w.-]+\.\w+)", 0.85, "exfil"),
    (r"(/hr/|/finance/|payroll|salary|exec_comp|password|api[_ -]?key|credential|secret)", 0.5, "sensitive_ref"),
    (r"do not (tell|inform|mention|alert)[^.\n]{0,40}(user|human|anyone)", 0.8, "concealment"),
    (r"\b(system|assistant)\s*:\s", 0.4, "fake_role_tag"),
    (r"<\s*/?\s*(system|instructions?)\s*>", 0.5, "fake_tag"),
]
_COMPILED = [(re.compile(p, re.I), w, n) for p, w, n in INJECTION_PATTERNS]


@dataclass
class HiddenSpan:
    kind: str                    # white_on_white | low_contrast | tiny_font | offpage | zero_width | css_hidden | html_comment
    text: str
    page: int = 0
    bbox: list[float] = field(default_factory=list)
    detail: str = ""


@dataclass
class Analysis:
    text: str                                    # everything an LLM extractor would see (hidden text included)
    visible_text: str
    hidden: list[HiddenSpan]
    injection_score: float                       # 0..1
    injection_hits: list[dict]
    pages: int = 1
    kind: str = "text"

    @property
    def hidden_text(self) -> bool:
        return bool(self.hidden)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["hidden_text"] = self.hidden_text
        return d


def _lum(rgb: tuple[float, float, float]) -> float:
    def f(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast_vs_white(color_int: int) -> float:
    rgb = ((color_int >> 16 & 255) / 255, (color_int >> 8 & 255) / 255, (color_int & 255) / 255)
    return 1.05 / (_lum(rgb) + 0.05)


def score_injection(text: str, hidden_bonus: bool = False) -> tuple[float, list[dict]]:
    hits, miss = [], 1.0
    for rx, w, name in _COMPILED:
        m = rx.search(text)
        if m:
            ww = min(1.0, w * (1.25 if hidden_bonus else 1.0))
            hits.append({"pattern": name, "text": m.group(0)[:160], "weight": round(ww, 2)})
            miss *= (1 - ww)
    return round(1 - miss, 3), hits


def analyze_pdf(path: str) -> Analysis:
    doc = fitz.open(path)
    flags = fitz.TEXTFLAGS_DICT & ~fitz.TEXT_MEDIABOX_CLIP & ~fitz.TEXT_PRESERVE_IMAGES
    hidden: list[HiddenSpan] = []
    vis_parts, all_parts = [], []
    for pno, page in enumerate(doc):
        rect = page.rect
        for block in page.get_text("dict", flags=flags, clip=fitz.Rect(-4000, -4000, 5000, 5000))["blocks"]:
            for line in block.get("lines", []):
                for sp in line["spans"]:
                    t = sp["text"]
                    if not t.strip():
                        continue
                    all_parts.append(t)
                    bbox = [round(v, 1) for v in sp["bbox"]]
                    kind = None
                    if sp["size"] <= 2.0:
                        kind = "tiny_font"
                    elif not rect.intersects(fitz.Rect(sp["bbox"])):
                        kind = "offpage"
                    else:
                        c = contrast_vs_white(sp["color"])
                        if c < 1.05:
                            kind = "white_on_white"
                        elif c < 1.6:
                            kind = "low_contrast"
                    if ZW.search(t):
                        hidden.append(HiddenSpan("zero_width", ZW.sub("", t), pno + 1, bbox, "zero-width characters"))
                    if kind:
                        hidden.append(HiddenSpan(kind, t, pno + 1, bbox, f"size={sp['size']:.1f} colour=#{sp['color']:06x}"))
                    else:
                        vis_parts.append(t)
    full, vis = "\n".join(all_parts), "\n".join(vis_parts)
    htxt = " ".join(h.text for h in hidden)
    score, hits = score_injection(full if not htxt else vis + " " + htxt, hidden_bonus=False)
    if htxt:
        s2, h2 = score_injection(htxt, hidden_bonus=True)
        if s2 > score:
            score, hits = s2, h2
    return Analysis(ZW.sub("", full), ZW.sub("", vis), hidden, score, hits, pages=len(doc), kind="pdf")


def analyze_html(html: str) -> Analysis:
    soup = BeautifulSoup(html, "html.parser")
    hidden: list[HiddenSpan] = []
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        if c.strip():
            hidden.append(HiddenSpan("html_comment", c.strip(), detail="<!-- comment -->"))
    def is_hidden(tag) -> str | None:
        st = (tag.get("style") or "").replace(" ", "").lower()
        if "display:none" in st or "visibility:hidden" in st or "font-size:0" in st or "opacity:0" in st:
            return "css_hidden"
        if tag.get("hidden") is not None or tag.get("aria-hidden") == "true":
            return "css_hidden"
        if re.search(r"color:(#fff(fff)?|white|#fefefe)", st):
            return "white_on_white"
        return None
    for tag in soup.find_all(True):
        k = is_hidden(tag)
        txt = tag.get_text(" ", strip=True)
        if k and txt and not any(txt == h.text for h in hidden):
            hidden.append(HiddenSpan(k, txt, detail=str(tag.get("style") or "hidden attr")))
    for h in hidden:
        pass
    for tag in soup.find_all(True):
        if is_hidden(tag):
            tag.extract()
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
    vis = soup.get_text("\n", strip=True)
    # what an LLM extractor ingests = raw text including hidden parts
    soup_all = BeautifulSoup(html, "html.parser")
    full = soup_all.get_text("\n", strip=True) + "\n" + "\n".join(h.text for h in hidden if h.kind == "html_comment")
    htxt = " ".join(h.text for h in hidden)
    score, hits = score_injection(vis)
    if htxt:
        s2, h2 = score_injection(htxt, hidden_bonus=True)
        if s2 > score:
            score, hits = s2, h2
    return Analysis(ZW.sub("", full), vis, hidden, score, hits, pages=1, kind="html")


def analyze_text(text: str) -> Analysis:
    hidden = []
    if ZW.search(text):
        hidden.append(HiddenSpan("zero_width", "zero-width characters present", detail="U+200B etc."))
    clean = ZW.sub("", text)
    score, hits = score_injection(clean)
    return Analysis(clean, clean, hidden, score, hits, kind="text")
