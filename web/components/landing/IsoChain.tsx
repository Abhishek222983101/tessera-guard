"use client";
import { curve, path, Box, Glow, Plate, Press, Signal, type Box3 } from "react-isokit";
import { Callout } from "react-isokit/drafting";
import "react-isokit/styles.css";
import "react-isokit/themes.css";

export interface IsoNode { id: string; name: string; taint: string; pz: boolean; level: number }
export interface IsoEdge { from: string; to: string; taint: string }
const OK = "#3fb27f", BAD = "#f0545a", AMB = "#f5b83d";
const BASE: Box3 = { x: 0, y: 0, z: 0, w: 214, d: 170, h: 8 };
const W = 62, D = 46, H = 32;
const SLOT = [[14, 16], [136, 16], [14, 108], [136, 108]];

/** Agents as isometric machines on one platform. Red cable = tainted handoff. */
export default function IsoChain({ nodes, edges, onSelectEdge }: { nodes: IsoNode[]; edges: IsoEdge[]; onSelectEdge?: (i: number) => void }) {
  const order = [...nodes].sort((a, b) => Number(b.pz) - Number(a.pz) || Number(b.taint === "tainted") - Number(a.taint === "tainted"));
  const pos = new Map(order.map((n, i) => [n.id, SLOT[i % 4]] as const));
  const box = (id: string): Box3 => { const [x, y] = pos.get(id) ?? SLOT[0]; return { x, y, z: 8, w: W, d: D, h: H }; };
  const cable = (a: string, b: string) => {
    const A = box(a), B = box(b); const ay = A.y + D / 2, by = B.y + D / 2; const z = 9.4;
    const sameRow = Math.abs(A.y - B.y) < 10;
    return sameRow ? curve([A.x + W, ay, 14], [A.x + W + 14, ay, z], [B.x - 14, by, z], [B.x, by, z], 24)
      : curve([A.x + W / 2, A.y + D, 14], [A.x + W / 2, A.y + D + 14, z], [B.x + W / 2, B.y - 14, z], [B.x + W / 2, B.y, z], 24);
  };
  return (
    <Plate theme="dark" credit={false} className="hero-iso" aspect={1.25} pad={0.03} fit={[BASE, ...order.map((n) => box(n.id))]}
      label="Isometric map of the agent fleet. Cables show handoffs between agents; red cables carry tainted work from the infected agent to the one it contaminated."
      readout={edges.some((e) => e.taint === "tainted") ? "tainted handoff detected" : "no contamination"}>
      <g>
        <Box {...BASE} r={10} />
        {edges.map((e, i) => pos.has(e.from) && pos.has(e.to) ? <g key={i}><path className="ik-line" d={path(cable(e.from, e.to))} style={{ stroke: e.taint === "tainted" ? BAD : OK, strokeWidth: 1.6 }} /><Signal points={cable(e.from, e.to)} delay={i * 200} duration={1400} className={e.taint === "tainted" ? "sig-bad" : undefined} /></g> : null)}
        {order.map((n) => {
          const t = n.taint === "tainted"; const b = box(n.id);
          const first = edges.findIndex((e) => e.to === n.id);
          const body = (
            <g>
              <Box {...b} r={5}
                top={<><text className="ik-label" x={6} y={D - 6}>{n.name.replace(" Agent", "").toUpperCase()}</text><circle className="ik-fill" cx={W - 7} cy={7} r={1.3} /></>}
                front={<>
                  <rect className="ik-screen" x={5} y={5} width={W - 10} height={H - 14} rx={3} />
                  <text className="ik-screen-text ik-dim" x={9} y={13} fontSize={5}>{n.level >= 3 ? "frozen · L" + n.level : n.pz ? "patient zero" : t ? "received taint" : "healthy"}</text>
                  <text className="ik-screen-text" x={9} y={21} fontSize={6.2} fill={n.level >= 3 ? AMB : t ? BAD : OK}>{n.level >= 3 ? "QUARANTINED" : t ? "TAINTED" : "CLEAN"}</text>
                </>}
                side={<Glow on className="lamp-glow"><circle cx={D / 2} cy={9} r={2.3} fill={t ? BAD : n.level >= 3 ? AMB : OK} /></Glow>} />
            </g>
          );
          return first >= 0 && onSelectEdge ? <Press key={n.id} label={`Show the handoff into ${n.name}`} onPress={() => onSelectEdge(first)}>{body}</Press> : <g key={n.id}>{body}</g>;
        })}
        {(() => { const pz = order.find((n) => n.pz); if (!pz) return null; const b = box(pz.id); return <Callout at={[b.x + W, b.y + D, b.z + H - 6]} dx={26} dy={44} label="patient zero" />; })()}
      </g>
    </Plate>
  );
}
