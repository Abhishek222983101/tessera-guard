# TESSERA Lab — API contract (FROZEN for the console)

Base URL: `http://localhost:8080` (env `NEXT_PUBLIC_API`). JSON everywhere. CORS open for localhost:3000.
Pydantic source of truth: `core/tessera/models.py` (Verdict, Case, Receipt, Signal, ChangeEvent...). JSON Schemas are exported to `contracts/*.schema.json` by `just contracts`.
Errors: HTTP 4xx/5xx always `{"error": {"code": "string", "message": "human readable", "details": [...]?}}`. The console must show `message`, never a stack trace.
Time: `ts` = unix seconds (float).

## Vocabulary
- Decision: `ALLOW | DENY | MODIFY | STEP_UP | DEFER`
- Band: `normal (<30) | elevated (30-59) | high (60-79) | critical (>=80)`
- Containment level: 0 observe · 1 step-up · 2 narrow · 3 quarantine · 4 decoy sandbox · 5 killed
- Layers (waterfall/colours): `contract, provenance, decoy, content, chain, context, sequence, params, intent, drift`
- Trust: `trusted | mixed | untrusted` · arg origin: `user | trusted_tool | untrusted_chunk | model_unknown | mixed`
- Agents seeded: `agt_proc_01` Procurement, `agt_supp_01` Support, `agt_fin_01` Finance-AP, `agt_res_01` Research.
- Scenario ids: `S1`..`S8` (see /scenarios).

## Live stream (SSE)  `GET /stream?since=<seq>`
`event:` name + `data:` JSON, each with `seq` (monotonic int). Replay: `GET /events?since=<seq>&limit=500` returns `{events:[{seq,type,data}], last_seq}` (use on reconnect).
Types:
- `verdict` → `Verdict` (every gateway call, both lanes: includes `iam` for the classic-IAM lane)
- `session` → `{session_id, agent_id, task, state: "started"|"ended", utility?: {...}}`
- `case` → `Case` (opened/updated)
- `containment` → `{agent_id, session_id?, from, to, reason, scope: "session"|"agent", receipt_id}`
- `approval` → `{id, status: "pending"|"approved"|"rejected", verdict_id, agent_id, tool, args, risk}`
- `run` → `{run_id, scenario?, state: "started"|"progress"|"finished", progress: 0..1, utility?, outcome?}`
- `change` → `ChangeEvent`
- `reset` → `{}` (console clears its state)
- `heartbeat` every 15 s.

## Verdict (key fields; see models.py)
`id, event_id, ts, session_id, step, agent_id, role, tool, effect, args, arg_origins{argName:{origin,source_id,source_label,trust,control,match}}, decision, reason_code, risk (0-100), band, signals[{layer,score,flags[],evidence[{text,ref,bbox,page,doc}],shadow}], waterfall[{layer,delta,cumulative}], floor{name,value}|null, session_risk, containment_level, summary (one sentence), iam{valid,scope_ok,reason,label}, cedar{decision,policies[]}, safe_alternative, approval_id, case_id, receipt_id, latency_ms, executed, output_chunk, via ("agent"|"stolen_token"|"lab"), counterfactual[{label,risk_after,changes[]}], kind ("attack"|"unexplained_shift"|"benign")`.
`iam.label` is the one-liner for the left lane, e.g. `"token valid · scope files.* allows files.read"`; `iam.valid` is true on every attack in the lab (that is the point).

## Agents & fleet
- `GET /agents` → `[{id,name,role,status:"active"|"contained"|"killed",level,session_level_max,maturity(0..1),sessions_seen,risk_now,open_cases,scopes[],hosts[],created_ts,utility_retention}]`
- `GET /agents/{id}` → agent + `twin` = `{role_contract_summary, tool_usage:[{tool,count,share}], transitions:[{from,to,p,count}], envelopes:[{tool,param,median,mad,min,max}], volume:[{session,steps,bytes_out}], cusum:[{session,value,alarm}], thresholds{...}, cohort:{peer_shift:number, fleet_shift:bool}, baseline:{state:"cold"|"warming"|"mature", n_sessions}, decoys:[{path,touched}], change_windows:[ChangeEvent], risk_history:[{ts,risk}], position:{x,y,z,radius_ratio}}`
- `POST /agents` `{template: "role.procurement"|..., name?}` → new agent with zero history (cold start). Returns agent (+ `token` for the Hijack console only).
- `POST /agents/{id}/containment` `{level:0-5, reason}` · `POST /agents/{id}/release` `{approver}` · `POST /agents/{id}/kill`
- `GET /fleet` → `{kpis:{agents,open_cases,contained,pending_approvals,utility_retention,false_alerts_per_1000,gateway_p95_ms}, orbit:[{agent_id,name,role,position:{x,y,z},drift(0..2),radius,level,risk_now,trail:[{x,y,z}]}], chains:[{from,to,taint,ts}]}` (feeds the 3D Orbit).

## Sessions, calls, approvals
- `POST /sessions` `{agent_id, task}` → `{session_id}`; `POST /sessions/{id}/end`
- `POST /gateway/call` `{agent_id, session_id, tool, args}` → `Verdict` (+ `output` text if executed). The lab uses this; real agents would use token auth.
- `POST /hijack/call` `{agent_id, tool, args}` → `Verdict` — "stolen token" mode; `via:"stolen_token"`, odd host. Returns also `iam` for the left lane.
- `GET /approvals` → pending list; `POST /approvals/{id}/approve` · `/reject` → re-executes (approve) and returns the new Verdict.

## Content, tools, scenarios
- `GET /tools` → Tool Catalog `[{name,description,effect,data_class,output_trust,control_args,data_args,fields[{name,type,example,control}],pinned_hash}]`
- `GET /documents` → `[{id,path,title,kind,origin,poisoned,technique,blurb,pages,analysis{hidden_text,hidden[{kind,text,page,bbox,detail}],injection_score,injection_hits[],pages}}]` (note: `poisoned` is lab ground truth, show it only in the Attack Lab library as a "ground truth" badge)
- `GET /documents/{id}` → doc + `text` (visible) + `full_text` (what an LLM extractor ingests)
- `GET /documents/{id}/page/{n}.png` → page image (PDF). Bboxes in `analysis.hidden[].bbox` are in PDF points (A4 595x842, origin top-left); the PNG is rendered at scale 1.6 → multiply by 1.6 to overlay.
- `POST /documents/upload` multipart `file` (pdf/html/txt/md, ≤5 MB) → doc · `POST /documents/text` `{title,text,hide:"none"|"white"|"tiny"|"offpage"|"lowcontrast"}` → doc
- `GET /scenarios` → `[{id,name,short,challenge("C-1".."C-6"),agent_id,description,attacker_modes[],expected}]`
- `POST /scenarios/{id}/run` `{attacker?: "static"|"adaptive"|"mimicry"|"slow_ramp", disabled_layers?: string[], gullibility?: number}` → `{run_id}` (events stream over SSE; also `GET /runs/{run_id}` → result with utility + outcome)
- `POST /lab/run` `{agent_id, document_id, task?, gullibility (0..1, default 0.9), disabled_layers?}` → `{run_id}`; judges pick a doc (library, pasted text, or upload) and a target agent.
- `GET /runs/{run_id}` → `{state, scenario?, session_id, verdict_ids[], case_ids[], utility{legit_total,legit_done,legit_pending_approval,legit_blocked,retention}, outcome{attack_steps,attack_blocked,exfil_succeeded:boolean}, narrative[]}`

## Cases (explanations)
- `GET /cases?status=&limit=` → `Case[]` (title, summary, severity, max_risk, owasp[], kind, status, containment_level, patient_zero, root_cause{doc,chunk,text,bbox,page,step})
- `GET /cases/{id}` → `{case, verdicts: Verdict[], chunks:[{id,source,label,trust,integrity,hidden_text,injection_score,text_excerpt,doc,step}], thread:{from:{doc,page,bbox,text,chunk}, to:{verdict_id,step,tool,arg}}[], containment:[...], receipts:[...], utility}`
- `GET /verdicts/{id}/counterfactual` → `[{label,risk_after,band_after,changes[]}]`

## Contracts (Contract Studio)
- `GET /contracts` → `[{role,id,name,version,yaml,summary}]` · `GET /contracts/{role}` → `{yaml, parsed, cedar (compiled policy text), digest}`
- `POST /contracts/validate` `{yaml}` → `{ok, errors:[{path,line?,message}], cedar?, digest?}`
- `POST /contracts/{role}/dryrun` `{yaml}` → `{sessions_replayed, newly_blocked:[{tool,count,example}], newly_allowed:[...], benign_blocked_rate, widening:boolean, warnings[]}`
- `PUT /contracts/{role}` `{yaml, approver?}` → applies; widening (newly allowed tools / data classes) requires `approver` else `409 needs_approval`.

## Changes (legit-change registry)
- `GET /changes` · `POST /changes` `{role,kind,tool?,description,duration_min}` · `DELETE /changes/{id}`

## Chains
- `GET /chains` → `{nodes:[{agent_id,name,role,taint:"clean"|"tainted",level,patient_zero:boolean}], edges:[{from,to,ts,taint,task,chunks[]}], cascade:{patient_zero, affected[]}}` · `POST /chains/freeze` `{patient_zero}`

## Receipts (signed, hash-chained)
- `GET /receipts?limit=` → `Receipt[]` · `GET /receipts/verify` → `{ok, checked, broken_at: idx|null, reason?}` · `POST /receipts/tamper` `{idx}` (lab only) · `GET /receipts/pubkey`

## Evaluation / bench
- `GET /bench` → `benchmark.json` `{commit, seed, generated_at, tags:{...}, metrics:[{id,name,value,unit,tag:"MEASURED"|"TARGET",note,n}], ablation:[{layer_off,blocked_rate,utility}], cold_start:[{n_sessions,detect_rate}], calibration:[{bin,pred,obs,n}], adaptive:[{attacker,success_rate,n}], latency:{p50,p95,p99}}` · `POST /bench/run` → `{run_id}` (small live re-run)

## Redteam
- `POST /redteam/run` `{scenario, attacker, disabled_layers[]}` → `{run_id}` (same as scenario run) · result via `GET /runs/{id}`

## Misc
- `GET /health` → `{ok, version, uptime_s, cedar:"ok", llm:"off"|"on", seed, mode:"live"}` · `POST /reset` → re-seeds the world (SSE `reset`).
- `GET /about` → `{real:[...], simulated:[...], standards:[...]}`
