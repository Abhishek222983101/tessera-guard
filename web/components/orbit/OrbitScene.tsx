/* eslint-disable react-hooks/refs, react-hooks/immutability, react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization, @typescript-eslint/no-unused-expressions -- three.js scene graph is mutated imperatively by design */
"use client";
/* Signature moment #3 — The Orbit. Each agent is a node held inside a translucent role shell (its permitted behaviour).
   Distance from the shell centre = drift (1.0 = on the boundary). Drift pulls the node through the shell; containment rings tighten. */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitNode } from "@/lib/types";
import { levelName, bandColor } from "@/components/ui/bits";

export interface OrbitChain { from: string; to: string; taint?: string }
interface Props { orbit: OrbitNode[]; onSelect: (agentId: string) => void; mode?: "3d" | "2d"; selectedId?: string; chains?: OrbitChain[]; height?: number | string }

const RING = 3.1;                       // radius of the ring the shells sit on
const homeOf = (i: number, n: number) => { const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2; return new THREE.Vector3(Math.cos(a) * RING, 0, Math.sin(a) * RING); };
const offsetOf = (o: OrbitNode) => { const v = new THREE.Vector3(o.position.x, o.position.y, o.position.z); if (v.lengthSq() < 1e-6) v.set(0.3, 0.2, 0.1); return v.normalize().multiplyScalar(Math.min(o.drift, 2.2) * o.radius * 0.95); };
const riskColor = (r: number, killed: boolean) => new THREE.Color(killed ? "#8a8fb5" : bandColor(r).replace("var(--blood)", "#ff5a5f").replace("var(--ember)", "#ff8a3d").replace("var(--amber)", "#ffc233").replace("var(--moss)", "#34d399"));

const shellVert = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const shellFrag = `uniform vec3 uColor; uniform float uPulse; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.4); float a = (f*0.9 + 0.05) * uOpacity + uPulse*f*0.8; gl_FragColor = vec4(uColor, clamp(a,0.0,0.95)); }`;

function Node({ o, home, selected, onSelect, onHover }: { o: OrbitNode; home: THREE.Vector3; selected: boolean; onSelect: () => void; onHover: (h: boolean) => void }) {
  const g = useRef<THREE.Group>(null!); const core = useRef<THREE.Mesh>(null!); const shellMat = useRef<THREE.ShaderMaterial>(null!);
  const ringA = useRef<THREE.Mesh>(null!); const ringB = useRef<THREE.Mesh>(null!); const ringC = useRef<THREE.Mesh>(null!);
  const cur = useRef(home.clone().add(offsetOf(o))); const flash = useRef(0); const wasOut = useRef(false);
  const TR = 48; const trailPos = useRef(new Float32Array(TR * 3)); const trailCol = useRef(new Float32Array(TR * 3));
  const trailGeo = useMemo(() => { const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.BufferAttribute(trailPos.current, 3)); g2.setAttribute("color", new THREE.BufferAttribute(trailCol.current, 3)); g2.setDrawRange(0, 0); return g2; }, []);
  const trailObj = useMemo(() => new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })), [trailGeo]);
  const trailN = useRef(0); const acc = useRef(0);
  const killed = o.level >= 5; const out = o.drift > 1;
  const col = useMemo(() => riskColor(o.risk_now, killed), [o.risk_now, killed]);
  const shellCol = useMemo(() => new THREE.Color(killed ? "#8a8fb5" : out ? "#ff5a5f" : o.level >= 2 ? "#ffc233" : "#6aa8ff"), [out, killed, o.level]);
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#6aa8ff") }, uPulse: { value: 0 }, uOpacity: { value: 0.8 } }), []);

  useFrame((s, dt) => {
    const target = home.clone().add(offsetOf(o));
    if (o.level === 4) target.copy(home).add(new THREE.Vector3(o.radius * 1.9, -o.radius * 0.6, 0));  // pocket / tarpit
    if (killed) target.copy(home).multiplyScalar(0.98);
    cur.current.lerp(target, 1 - Math.pow(0.0015, dt));
    const t = s.clock.elapsedTime; const bob = killed ? 0 : Math.sin(t * 1.4 + home.x) * 0.03;
    core.current.position.set(cur.current.x, cur.current.y + bob, cur.current.z);
    const sc = (killed ? 0.7 : 1) * (1 + (selected ? 0.25 : 0)) * (0.15 + (out ? 0.02 * Math.sin(t * 9) : 0));
    core.current.scale.setScalar(sc);
    if (out && !wasOut.current) flash.current = 1; wasOut.current = out;
    flash.current = Math.max(0, flash.current - dt * 1.4);
    uniforms.uColor.value.lerp(shellCol, 1 - Math.pow(0.01, dt));
    uniforms.uPulse.value = flash.current + (out ? 0.18 + 0.12 * Math.sin(t * 6) : 0);
    uniforms.uOpacity.value = killed ? 0.3 : 0.8;
    const r = o.radius * (o.level >= 3 ? 0.85 : 1);
    shellMat.current && (g.current.children[0].scale.setScalar(r));
    // containment rings: L1 outer, L2 middle, L3 inner — they tighten
    const rings = [ringA.current, ringB.current, ringC.current];
    rings.forEach((m, i) => { if (!m) return; const on = o.level >= i + 1 && o.level < 5; m.visible = on; if (on) { const rr = o.radius * (1.18 - 0.2 * Math.min(o.level, 3) + i * 0.1); m.scale.setScalar(rr); m.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + i) * 0.25; m.rotation.z = t * (0.4 + i * 0.2); } });
    // trail
    acc.current += dt; if (acc.current > 0.05) {
      acc.current = 0; const p = trailPos.current; const c = trailCol.current;
      p.copyWithin(3, 0, (TR - 1) * 3); c.copyWithin(3, 0, (TR - 1) * 3);
      p[0] = core.current.position.x; p[1] = core.current.position.y; p[2] = core.current.position.z;
      const k = Math.min(1, Math.max(0, (o.drift - 0.6) / 0.8)); const cc = new THREE.Color("#6aa8ff").lerp(new THREE.Color("#ff8a3d"), Math.min(1, k * 2)).lerp(new THREE.Color("#ff5a5f"), Math.max(0, k * 2 - 1));
      if (killed) cc.set("#8a8fb5"); c[0] = cc.r; c[1] = cc.g; c[2] = cc.b;
      trailN.current = Math.min(TR, trailN.current + 1);
      trailGeo.setDrawRange(0, trailN.current); (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (trailGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={g} position={home}>
        <mesh>
          <sphereGeometry args={[1, 40, 28]} />
          <shaderMaterial ref={shellMat} vertexShader={shellVert} fragmentShader={shellFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        {[0, 1, 2].map((i) => (<mesh key={i} ref={[ringA, ringB, ringC][i]} visible={false}><torusGeometry args={[1, 0.012, 8, 72]} /><meshBasicMaterial color={o.level >= 3 ? "#ff5a5f" : "#ffc233"} transparent opacity={0.75} /></mesh>))}
        {o.level === 4 && (<mesh position={[o.radius * 1.9, -o.radius * 0.6, 0]}><icosahedronGeometry args={[o.radius * 0.5, 1]} /><meshBasicMaterial color="#b79cff" wireframe transparent opacity={0.5} /></mesh>)}
      </group>
      <primitive object={trailObj} />
      <Html position={[home.x, home.y + o.radius * 1.65, home.z]} center distanceFactor={11} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div style={{ textAlign: "center", fontFamily: "var(--font-geist-sans)", color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,.7)" }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{o.name}</div>
          <div style={{ fontSize: 12.5, color: out ? "#ff8f92" : "#b8bde8" }}>{killed ? "killed" : out ? "acting out of role" : "in role"} · risk {Math.round(o.risk_now)}</div>
        </div></Html>
      <mesh ref={core} position={home} onClick={(e) => { e.stopPropagation(); onSelect(); }} onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }} onPointerOut={() => { onHover(false); document.body.style.cursor = ""; }}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={killed ? 0.15 : 1.4} roughness={0.4} />
      </mesh>
    </>
  );
}

function Arc({ a, b, taint }: { a: THREE.Vector3; b: THREE.Vector3; taint?: string }) {
  const obj = useMemo(() => {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.1, 0));
    const pts = new THREE.QuadraticBezierCurve3(a.clone().setY(0.2), mid, b.clone().setY(0.2)).getPoints(40);
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: taint === "tainted" ? "#ff5a5f" : "#2dd4bf", transparent: true, opacity: 0.85 }));
  }, [a, b, taint]);
  return <primitive object={obj} />;
}

function Rig({ target, resetKey }: { target: THREE.Vector3 | null; resetKey: number }) {
  const { camera } = useThree(); const controls = useRef<any>(null);  // eslint-disable-line @typescript-eslint/no-explicit-any
  const goalPos = useRef(new THREE.Vector3(0, 6.2, 15.5)); const goalTgt = useRef(new THREE.Vector3(0, 0, 0)); const busy = useRef(false);
  useEffect(() => { busy.current = true; if (target) { goalTgt.current.copy(target); goalPos.current.copy(target).add(new THREE.Vector3(0, 1.6, 3.4)); } else { goalTgt.current.set(0, 0, 0); goalPos.current.set(0, 6.2, 15.5); } const t = setTimeout(() => (busy.current = false), 1400); return () => clearTimeout(t); }, [target, resetKey]);
  useFrame((_, dt) => { if (!busy.current || !controls.current) return; const k = 1 - Math.pow(0.02, dt); camera.position.lerp(goalPos.current, k); controls.current.target.lerp(goalTgt.current, k); controls.current.update(); });
  return <OrbitControls ref={controls} enablePan={false} minDistance={2.5} maxDistance={12} maxPolarAngle={Math.PI * 0.62} autoRotate={!target} autoRotateSpeed={0.25} enableDamping />;
}

function Scene({ orbit, onSelect, selectedId, chains, setHover }: { orbit: OrbitNode[]; onSelect: (id: string) => void; selectedId?: string; chains: OrbitChain[]; setHover: (id: string | null) => void }) {
  const homes = useMemo(() => orbit.map((_, i) => homeOf(i, orbit.length)), [orbit.length]);  // eslint-disable-line react-hooks/exhaustive-deps
  const idx = (id: string) => orbit.findIndex((o) => o.agent_id === id);
  return (
    <>
      <color attach="background" args={["#0a0a0b"]} />
      <fog attach="fog" args={["#0a0a0b", 12, 26]} />
      <ambientLight intensity={0.4} />
      <gridHelper args={[26, 26, "#26262b", "#17171a"]} position={[0, -1.6, 0]} />
      {orbit.map((o, i) => (<Node key={o.agent_id} o={o} home={homes[i]} selected={selectedId === o.agent_id} onSelect={() => onSelect(o.agent_id)} onHover={(h) => setHover(h ? o.agent_id : null)} />))}
      {chains.map((c, i) => { const a = idx(c.from), b = idx(c.to); if (a < 0 || b < 0) return null; return <Arc key={i} a={homes[a]} b={homes[b]} taint={c.taint} />; })}
    </>
  );
}

function webglOk() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }

export default function OrbitScene({ orbit, onSelect, mode = "3d", selectedId, chains = [], height = 520 }: Props) {
  const [ok, setOk] = useState<boolean | null>(null); const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState<string | null>(null); const [resetKey, setResetKey] = useState(0);
  const [sel, setSel] = useState<string | undefined>(selectedId);
  useEffect(() => { setOk(webglOk()); const m = window.matchMedia("(prefers-reduced-motion: reduce)"); setReduced(m.matches); const f = () => setReduced(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  useEffect(() => setSel(selectedId), [selectedId]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setSel(undefined); setResetKey((k) => k + 1); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const use2d = mode === "2d" || reduced || ok === false;
  if (ok === null && mode === "3d") return <div style={{ height }} className="card-2 animate-pulse" aria-busy="true" />;
  if (use2d) return <Orbit2D orbit={orbit} onSelect={onSelect} selectedId={selectedId} chains={chains} height={height} />;
  const hovered = orbit.find((o) => o.agent_id === hover);
  const homes = orbit.map((_, i) => homeOf(i, orbit.length));
  const si = orbit.findIndex((o) => o.agent_id === sel);
  const target = si >= 0 ? homes[si] : null;
  return (
    <div className="island-dark relative overflow-hidden" style={{ height }}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 6.2, 15.5], fov: 42 }} gl={{ antialias: true, powerPreference: "high-performance" }} aria-label="3D view of agents inside their role shells">
        <Scene orbit={orbit} onSelect={(id) => { setSel(id); onSelect(id); }} selectedId={sel} chains={chains} setHover={setHover} />
        <Rig target={target} resetKey={resetKey} />
      </Canvas>
      <Legend />
      {hovered && (<div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-[#17171a]/90 px-3.5 py-2.5 text-[15px] text-white backdrop-blur"><div className="text-[15px] font-medium">{hovered.name}</div>
        <div className="mono mt-1 text-[#c9cbe8]">risk {Math.round(hovered.risk_now)} · {levelName(hovered.level)} · drift {hovered.drift.toFixed(2)}</div></div>)}
      {sel && <button onClick={() => { setSel(undefined); setResetKey((k) => k + 1); }} className="absolute right-4 top-4 rounded-lg bg-[#17171a]/90 px-3 py-1.5 text-[13px] text-white hover:bg-[#1f1f23]">Back to all agents <kbd className="mono ml-1 text-[13px] opacity-70">Esc</kbd></button>}
    </div>
  );
}

const Legend = () => (
  <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-[#0a0a0b]/85 px-4 py-2.5 text-[13px] text-[#a1a1aa] backdrop-blur">
    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#6aa8ff]" />agent in its role bubble</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#ff5a5f]" />out of role</span>
    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full border border-[#ffc233]" />containment ring</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#2dd4bf]" />handoff</span>
  </div>
);

/* ---------- 2D radial fallback: same data, flat. Each agent has a spoke; ring at 1.0 is its role boundary. ---------- */
export function Orbit2D({ orbit, onSelect, selectedId, chains = [], height = 520 }: Props) {
  const W = 760, H = 600, cx = W / 2, cy = H / 2, R = 150;
  const n = Math.max(orbit.length, 1);
  const ang = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pos = (i: number, d: number) => [cx + Math.cos(ang(i)) * (60 + d * R * 0.9), cy + Math.sin(ang(i)) * (60 + d * R * 0.9)] as const;
  const idx = (id: string) => orbit.findIndex((o) => o.agent_id === id);
  return (
    <div className="island-dark relative overflow-hidden" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="group" aria-label="Agents by drift from their declared role">
        {[0.5, 1, 1.5].map((d) => (<circle key={d} cx={cx} cy={cy} r={60 + d * R * 0.9} fill="none" stroke={d === 1 ? "#6aa8ff" : "#26262b"} strokeOpacity={d === 1 ? 0.55 : 1} strokeDasharray={d === 1 ? "none" : "3 5"} />))}
        <circle cx={cx} cy={cy} r={60 + 1.5 * R * 0.9} fill="#ff5a5f" fillOpacity={0.05} />
        <text x={cx} y={cy + (60 + R * 0.9) + 14} textAnchor="middle" fill="#8db8ff" fontSize="15">edge of allowed behaviour</text>
        {orbit.map((o, i) => { const [x1, y1] = pos(i, 0); const [x2, y2] = pos(i, Math.min(o.drift, 1.9)); return <line key={o.agent_id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={o.drift > 1 ? "#ff5a5f" : "#4a4d92"} strokeWidth={1.5} />; })}
        {chains.map((c, k) => { const a = idx(c.from), b = idx(c.to); if (a < 0 || b < 0) return null; const [x1, y1] = pos(a, Math.min(orbit[a].drift, 1.9)); const [x2, y2] = pos(b, Math.min(orbit[b].drift, 1.9)); return <path key={k} d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} fill="none" stroke={c.taint === "tainted" ? "#ff5a5f" : "#2dd4bf"} strokeOpacity={0.8} strokeDasharray="4 4" />; })}
        {orbit.map((o, i) => { const [x, y] = pos(i, Math.min(o.drift, 1.9)); const col = o.level >= 5 ? "#8a8fb5" : o.drift > 1 ? "#ff5a5f" : "#6aa8ff"; const sel = selectedId === o.agent_id;
          return (<g key={o.agent_id} tabIndex={0} role="button" aria-label={`${o.name}, risk ${Math.round(o.risk_now)}, ${levelName(o.level)}, drift ${o.drift.toFixed(2)}`} className="cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-white" onClick={() => onSelect(o.agent_id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(o.agent_id)}>
            <circle cx={x} cy={y} r={sel ? 17 : 13} fill="none" stroke={o.level > 0 ? "#ffc233" : "transparent"} strokeWidth={o.level >= 3 ? 2.5 : 1.5} strokeDasharray={o.level > 0 ? "none" : undefined} />
            <circle cx={x} cy={y} r={10} fill={col} /><text x={x} y={y + 32} textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">{o.name}</text>
            <text x={x} y={y + 42} textAnchor="middle" fill="#c9cbe8" fontSize="14" fontFamily="var(--font-geist-mono)">risk {Math.round(o.risk_now)} · L{o.level}</text></g>); })}
      </svg>
      <div className="absolute inset-x-3 bottom-3 rounded-lg bg-[#0a0a0b]/85 px-4 py-2.5 text-[13px] text-[#a1a1aa]">Dot = agent. Circle = edge of allowed behaviour. Further out = more drift.</div>
    </div>
  );
}
