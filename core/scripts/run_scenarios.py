import sys, time
from tessera import world
from tessera.gateway import GATEWAY as G
from tessera.sim import scenarios as SC
from tessera.sim.puppet import RUNS
world.boot()
def run(sid, **kw):
    world.boot()
    r=SC.run_scenario(sid, pace=0, **kw); r.thread.join(60)
    print(f"\n== {sid} {kw} state={r.state} err={r.error}")
    print(" utility",r.utility," outcome",r.outcome, r.extra)
    for rec in (r.legit+r.attack)[:60 if sid!='S4' else 0]:
        print(f"   {'L' if rec in r.legit else 'A'} {rec['tool']:26}{rec['decision']:8} exec={rec['executed']!s:5} risk={rec['risk']:5} {rec['label']}")
    return r
for sid in sys.argv[1:]:
    kw={}
    if ":" in sid: sid,k=sid.split(":"); kw["attacker"]=k
    run(sid, **kw)
