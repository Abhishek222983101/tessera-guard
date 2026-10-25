"""Signed, hash-chained receipts. Every decision and every containment transition is evidence a third party can verify."""
from __future__ import annotations
import base64, hashlib, json, threading, time, uuid
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError

from .models import Receipt

GENESIS = "0" * 64


def canon(o) -> bytes:
    return json.dumps(o, sort_keys=True, separators=(",", ":"), default=str).encode()


class ReceiptChain:
    def __init__(self):
        self.lock = threading.Lock()
        self.sk = SigningKey.generate()
        self.signer = "tessera-lab:" + base64.b16encode(bytes(self.sk.verify_key)[:4]).decode().lower()
        self.items: list[Receipt] = []

    def reset(self):
        with self.lock:
            self.sk = SigningKey.generate()
            self.signer = "tessera-lab:" + base64.b16encode(bytes(self.sk.verify_key)[:4]).decode().lower()
            self.items = []

    def add(self, kind: str, payload: dict) -> Receipt:
        with self.lock:
            idx = len(self.items)
            prev = self.items[-1].payload_hash if self.items else GENESIS
            ph = hashlib.sha256(canon({"idx": idx, "prev": prev, "kind": kind, "payload": payload})).hexdigest()
            sig = base64.b64encode(self.sk.sign(ph.encode()).signature).decode()
            r = Receipt(id=f"rc_{idx:06d}", idx=idx, prev_hash=prev, payload_hash=ph, ts=time.time(), kind=kind, payload=payload, signer=self.signer, sig=sig)
            self.items.append(r)
            return r

    def verify(self) -> dict:
        vk: VerifyKey = self.sk.verify_key
        prev = GENESIS
        for r in list(self.items):
            ph = hashlib.sha256(canon({"idx": r.idx, "prev": prev, "kind": r.kind, "payload": r.payload})).hexdigest()
            if r.prev_hash != prev:
                return {"ok": False, "checked": r.idx, "broken_at": r.idx, "reason": "previous-hash link does not match"}
            if ph != r.payload_hash:
                return {"ok": False, "checked": r.idx, "broken_at": r.idx, "reason": "payload was modified after signing"}
            try:
                vk.verify(r.payload_hash.encode(), base64.b64decode(r.sig))
            except BadSignatureError:
                return {"ok": False, "checked": r.idx, "broken_at": r.idx, "reason": "signature invalid"}
            prev = r.payload_hash
        return {"ok": True, "checked": len(self.items), "broken_at": None}

    def tamper(self, idx: int) -> bool:
        """Lab-only: silently edit a stored row (as an attacker with DB access would)."""
        with self.lock:
            if not 0 <= idx < len(self.items):
                return False
            r = self.items[idx]
            p = dict(r.payload)
            p["_tampered"] = True
            for k in ("decision", "risk"):
                if k in p:
                    p[k] = "ALLOW" if k == "decision" else 0
            self.items[idx] = r.model_copy(update={"payload": p})
            return True

    def pubkey(self) -> str:
        return base64.b64encode(bytes(self.sk.verify_key)).decode()


CHAIN = ReceiptChain()
