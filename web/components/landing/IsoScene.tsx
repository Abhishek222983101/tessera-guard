"use client";
import React from "react";

/* Isometric product scene: agents → TESSERA gateway → company tools, with a poisoned document being stopped.
   Pure SVG: projection helper + three-face boxes, animated packets and dashes. */
const S = 36, CX = 380, CY = 118;
const P = (x: number, y: number, z = 0): [number, number] => [CX + (x - y) * S * 0.866, CY + (x + y) * S * 0.5 - z * S];
const pts = (a: [number, number][]) => a.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

function Box({ x, y, z = 0, w, d, h, top = "#2c2c33", left = "#1b1b20", right = "#232329", stroke = "#3b3b44", glow, children }: { x: number; y: number; z?: number; w: number; d: number; h: number; top?: string; left?: string; right?: string; stroke?: string; glow?: string; children?: React.ReactNode }) {
  const T = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const L = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const R = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  return (
    <g strokeLinejoin="round" strokeWidth="1" stroke={stroke}>
      {glow && <ellipse cx={P(x + w / 2, y + d / 2, z)[0]} cy={P(x + w / 2, y + d / 2, z)[1] + 4} rx={w * S * 0.95} ry={w * S * 0.5} fill={glow} opacity=".22" stroke="none" />}
      <polygon points={pts(L)} fill={left} /><polygon points={pts(R)} fill={right} /><polygon points={pts(T)} fill={top} />
      {children}
    </g>
  );
}

export default function IsoScene({ className = "" }: { className?: string }) {
  const floor: [number, number][] = [P(-0.5, -0.5), P(12.5, -0.5), P(12.5, 12.5), P(-0.5, 12.5)];
  const gridLines = Array.from({ length: 13 }, (_, i) => i);
  const okPath = (x1: number, y1: number, x2: number, y2: number) => `M${P(x1, y1).join(",")} L${P(x2, y2).join(",")}`;
  const A = okPath(2.1, 3.3, 5, 5.2), B = okPath(2.1, 6, 5, 6), C = okPath(2.1, 8.7, 5, 6.8);
  const T1 = okPath(7.2, 5.2, 9.6, 3.3), T2 = okPath(7.2, 6, 9.6, 6), T3 = okPath(7.2, 6.8, 9.6, 8.7);
  const bad = `M${P(4.3, 1.6).join(",")} L${P(4.3, 4.6).join(",")} L${P(5, 4.9).join(",")}`;
  return (
    <svg viewBox="0 0 760 470" className={className} role="img" aria-label="Isometric diagram: agents pass through the Tessera gateway to company tools; a poisoned document is blocked" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="iso-fade" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id="gate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a3a43" /><stop offset="1" stopColor="#1e1e24" /></linearGradient>
      </defs>
      <ellipse cx="380" cy="260" rx="360" ry="190" fill="url(#iso-fade)" />
      <polygon points={pts(floor)} fill="#101013" stroke="#2a2a31" />
      {gridLines.map((i) => (<g key={i} stroke="#1f1f25" strokeWidth="1">
        <line x1={P(i, -0.5)[0]} y1={P(i, -0.5)[1]} x2={P(i, 12.5)[0]} y2={P(i, 12.5)[1]} /><line x1={P(-0.5, i)[0]} y1={P(-0.5, i)[1]} x2={P(12.5, i)[0]} y2={P(12.5, i)[1]} /></g>))}

      {/* paths on the floor */}
      {[A, B, C, T1, T2, T3].map((d, i) => (<path key={i} d={d} fill="none" stroke="#3fb27f" strokeOpacity=".75" strokeWidth="2" className="iso-dash" />))}
      <path d={bad} fill="none" stroke="#f0545a" strokeWidth="2" className="iso-dash" />
      {[A, B, C, T1, T2, T3].map((d, i) => (<circle key={"c" + i} r="3.2" fill="#3fb27f"><animateMotion dur={`${2.4 + (i % 3) * 0.5}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" path={d} /></circle>))}

      {/* poisoned document (flat slab) */}
      <Box x={3.4} y={0.2} w={1.8} d={1.5} h={0.12} top="#e9e9ec" left="#9a9aa2" right="#b4b4bb" stroke="#555">
        <line x1={P(3.65, 0.65, 0.12)[0]} y1={P(3.65, 0.65, 0.12)[1]} x2={P(4.9, 0.65, 0.12)[0]} y2={P(4.9, 0.65, 0.12)[1]} stroke="#d8d8dc" strokeWidth="3" />
        <line x1={P(3.65, 1.0, 0.12)[0]} y1={P(3.65, 1.0, 0.12)[1]} x2={P(4.5, 1.0, 0.12)[0]} y2={P(4.5, 1.0, 0.12)[1]} stroke="#f0545a" strokeWidth="3" />
      </Box>
      <text x={P(3.2, 0.1)[0] - 10} y={P(3.2, 0.1)[1] - 14} fontSize="13" fill="#a1a1aa" fontFamily="var(--font-geist-sans)">Supplier PDF · hidden line</text>

      {/* blocked marker */}
      <g className="iso-bob">
        <Box x={4.05} y={4.0} w={0.55} d={0.55} h={0.55} top="#f0545a" left="#a93a3f" right="#c8454b" stroke="#f0545a" glow="#f0545a" />
        <text x={P(4.3, 4.3, 0.55)[0] - 4} y={P(4.3, 4.3, 0.55)[1] + 4} fontSize="12" fontWeight="700" fill="#fff">×</text>
      </g>

      {/* agents */}
      {[{ y: 2.8, n: "Procurement" }, { y: 5.5, n: "Research" }, { y: 8.2, n: "Finance" }].map((a, i) => (
        <g key={a.n} className="iso-bob" style={{ animationDelay: `${i * 0.7}s` }}>
          <Box x={1} y={a.y} w={1.1} d={1.1} h={1} top="#34343c" left="#1d1d23" right="#27272e" glow="#5b9dff">
            <circle cx={P(1.55, a.y + 0.55, 1)[0]} cy={P(1.55, a.y + 0.55, 1)[1]} r="4" fill="#5b9dff" />
          </Box>
          <text x={P(0.6, a.y + 0.5)[0] - 92} y={P(0.6, a.y + 0.5)[1] + 4} fontSize="13" fill="#a1a1aa" fontFamily="var(--font-geist-sans)">{a.n}</text>
        </g>))}

      {/* gateway */}
      <g>
        <Box x={5} y={4.9} w={2.2} d={2.2} h={0.5} top="#2f2f37" left="#1b1b20" right="#24242a" />
        <g className="iso-bob" style={{ animationDuration: "6s" }}>
          <Box x={5.35} y={5.25} z={0.5} w={1.5} d={1.5} h={2.2} top="url(#gate)" left="#18181d" right="#202026" stroke="#4a4a55" glow="#f2f2f3" />
          {/* mark on the top face */}
          {[[0, 0, "#f2f2f3"], [0.62, 0, "#8a8a93"], [0, 0.62, "#8a8a93"], [0.62, 0.62, "#f0545a"]].map(([dx, dy, c], i) => {
            const x0 = 5.55 + (dx as number), y0 = 5.45 + (dy as number), z = 2.7, s = 0.5;
            return <polygon key={i} points={pts([P(x0, y0, z), P(x0 + s, y0, z), P(x0 + s, y0 + s, z), P(x0, y0 + s, z)])} fill={c as string} />;
          })}
        </g>
        <text x={P(5.3, 7.4)[0] - 36} y={P(5.3, 7.4)[1] + 22} fontSize="13" fontWeight="600" letterSpacing="2" fill="#f2f2f3" fontFamily="var(--font-geist-sans)">TESSERA GATEWAY</text>
      </g>

      {/* company tools */}
      {[{ y: 2.8, n: "ERP & payments" }, { y: 5.5, n: "Files & HR" }, { y: 8.2, n: "Email & web" }].map((a, i) => (
        <g key={a.n}>
          <Box x={9.7} y={a.y} w={1.4} d={1.1} h={0.7 + (i % 2) * 0.3} top="#2c2c33" left="#1a1a1f" right="#222228" />
          <text x={P(11.1, a.y + 0.5)[0] + 6} y={P(11.1, a.y + 0.5)[1] + 4} fontSize="13" fill="#a1a1aa" fontFamily="var(--font-geist-sans)">{a.n}</text>
        </g>))}
    </svg>
  );
}
