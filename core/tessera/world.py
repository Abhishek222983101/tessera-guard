"""Boot / reset the whole lab world, deterministically."""
from __future__ import annotations
from . import identity as ID
from .bus import BUS
from .config import SEED
from .gateway import GATEWAY
from .receipts import CHAIN
from .sim import docs as DOCS, tools as TL
from .twin.model import STORE


def boot(seed: int = SEED):
    DOCS.seed_documents()
    TL.WORLD.reset()
    ID.REGISTRY.seed()
    CHAIN.reset()
    GATEWAY.reset()
    STORE.train(seed)
    for a in ID.REGISTRY.agents.values():
        STORE.twin(a.id, a.role, mature=True)
        a.sessions_seen = STORE.agents[a.id].sessions_seen
    BUS.clear()
