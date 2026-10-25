"use client";
import { ReactFlow, Background, MarkerType, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { layout } from "@/lib/layout";

const pretty = (n: string) => (n === "<s>" ? "start" : n === "</s>" ? "finish" : n.replace("files.read:", "read · "));
export default function TransitionGraph({ transitions }: { transitions: { from: string; to: string; p: number; count: number }[] }) {
  const { nodes, edges } = useMemo(() => {
    const names = Array.from(new Set(transitions.flatMap((t) => [t.from, t.to])));
    const ns: Node[] = names.map((n) => ({ id: n, data: { label: pretty(n) }, position: { x: 0, y: 0 },
      style: { background: "#17171a", color: "#f2f2f3", border: `1px solid ${n === "<s>" || n === "</s>" ? "#34343b" : "#26262b"}`, borderRadius: 8, fontFamily: "var(--font-geist-mono)", width: 200, padding: 8, fontSize: 13 } }));
    const es: Edge[] = transitions.map((t, i) => ({ id: `${t.from}-${t.to}-${i}`, source: t.from, target: t.to, label: `${Math.round(t.p * 100)}%`, markerEnd: { type: MarkerType.ArrowClosed, color: "#9a8cff" },
      style: { stroke: "#9a8cff", strokeWidth: 1 + t.p * 2.5, opacity: 0.35 + t.p * 0.65 }, labelStyle: { fill: "#f2f2f3", fontSize: 12 }, labelBgStyle: { fill: "#111113" }, labelBgPadding: [5, 2] as [number, number], labelBgBorderRadius: 4 }));
    return { nodes: layout(ns, es, "TB", 200, 40, 44), edges: es };
  }, [transitions]);
  return (
    <div className="h-[380px] overflow-hidden rounded-lg border border-line bg-panel" aria-label="Transition graph: how likely one tool is to follow another">
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.3} colorMode="dark">
        <Background color="#26262b" gap={22} />
      </ReactFlow>
    </div>
  );
}
