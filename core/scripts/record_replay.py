"""Record a real S1 run from the live core into the console's offline replay fixture."""
import httpx, json, time, sys
B = "http://localhost:8080"; c = httpx.Client(base_url=B, timeout=30)
c.post("/reset"); time.sleep(0.3)
rid = c.post("/scenarios/S1/run", json={"pace": 0.35}).json()["run_id"]
while c.get(f"/runs/{rid}").json()["state"] != "finished":
    time.sleep(0.4)
evs = [e for e in c.get("/events?since=0&limit=2000").json()["events"] if e["type"] in ("verdict", "case", "containment", "approval", "session", "run")]
out, prev = [], None
for e in evs:
    ts = e["data"].get("ts") if e["type"] == "verdict" else None
    dt = 450
    if ts and prev: dt = int(min(1200, max(150, (ts - prev) * 1000)))
    if ts: prev = ts
    out.append({"type": e["type"], "data": e["data"], "dt": dt})
dest = sys.argv[1] if len(sys.argv) > 1 else "../web/lib/fixtures/s1.json"
json.dump({"events": out, "recorded_from": "live core, scenario S1", "run_id": rid}, open(dest, "w"))
print(len(out), "events ->", dest)
