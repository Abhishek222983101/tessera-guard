import os, tempfile, pytest
os.environ.setdefault("TESSERA_DATA", tempfile.mkdtemp(prefix="tessera-test-"))
from tessera import world


@pytest.fixture()
def lab():
    world.boot()
    from tessera.gateway import GATEWAY
    return GATEWAY
