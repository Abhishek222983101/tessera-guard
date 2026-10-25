import random, sys
from collections import Counter
from tessera import world
from tessera.gateway import GATEWAY as G
from tessera.sim import traffic
from tessera import identity as ID
world.boot(); rng = random.Random(777)
risks=[]; dec=Counter(); n=0
for role,aid in [("role.procurement","agt_proc_01"),("role.support","agt_supp_01"),("role.finance_ap","agt_fin_01"),("role.research","agt_res_01")]:
    for i in range(300):
        s_=traffic.gen_session(role, rng)
        s=G.start_session(aid, s_["task"], hour=s_["hour"])
        for st in s_["steps"]:
            v=G.handle(aid,s.id,st["tool"],st["args"]); risks.append(v.risk); dec[v.decision]+=1; n+=1
            if v.risk>=30 and n<4000 and len(risks)%1==0 and v.decision!="ALLOW": print("FP", role, st["tool"], v.decision, v.reason_code, v.risk, {x.layer:round(x.score,2) for x in v.signals if x.score})
        G.end_session(s.id)
import numpy as np
print("steps",n,"p50",np.percentile(risks,50),"p99",np.percentile(risks,99),"max",max(risks),"frac>=30",sum(r>=30 for r in risks)/n, dec)
