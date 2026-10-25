"use client";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { ReactFlow, Background, Handle, Position, MarkerType, type Edge, type Node, type NodeProps } from "@xyflow/react";
import dagre from "dagre";
import type { Verdict } from "@/lib/types";
import { trustColor } from "@/components/feed/ProvChip";

const NW = 250, NH = 66;
type D = { kind: "src" | "act"; tag: string; title: string; color: string; chip?: string; selected?: boolean };

function Card({ data }: NodeProps<Node<D>>) {
  return (
    <div className="rounded-xl border bg-panel px-3.5 py-2.5 text-left" style={{ width: NW, height: NH, borderColor: data.selected ? "var(--bone)" : "var(--line-2)", boxShadow: data.selected ? "0 0 0 1px var(--bone)" : "none" }}>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0" style={{ background: data.color }} />
      <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
        <span className="h-2 w-2 rounded-full" style={{ background: data.color }} />{data.tag}
        {data.chip && <span className="ml-auto rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal" style={{ color: data.color, background: `color-mix(in srgb, ${data.color} 14%, transparent)` }}>{data.chip}</span>}
      </div>
      <div className="mt-1 truncate text-[15px] font-medium text-bone">{data.title}</div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0" style={{ background: data.color }} />
    </div>
  );
}
const nodeTypes = { card: Card };
const SRC_TAG: Record<string, string> = { user: "You asked", trusted_tool: "Trusted system", untrusted_chunk: "Untrusted text", mixed: "Mixed" };

/** Source → argument → action. Colour = trust of the source; thick line = the value decided where the action went. */
export default function ProvenanceGraph({ verdicts, chunkLabels, selectedId, onSelect, all = false }: { verdicts: Verdict[]; chunkLabels?: Record<string, string>; selectedId?: string | null; onSelect?: (id: string) => void; all?: boolean }) {
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph(); g.setGraph(all ? { rankdir: "TB", nodesep: 60, ranksep: 44 } : { rankdir: "LR", nodesep: 28, ranksep: 130 }); g.setDefaultEdgeLabel(() => ({}));
    const N: Node<D>[] = [], E: Edge[] = []; const seen = new Set<string>();
    const add = (id: string, d: D) => { if (seen.has(id)) return; seen.add(id); g.setNode(id, { width: NW, height: NH }); N.push({ id, type: "card", position: { x: 0, y: 0 }, data: d, draggable: false }); };
    for (const v of verdicts) {
      const aid = "act:" + v.id; const col = v.decision === "DENY" ? "var(--blood)" : v.decision === "STEP_UP" ? "var(--amber)" : "var(--moss)";
      add(aid, { kind: "act", tag: `Step ${v.step}`, title: v.tool, color: col, chip: v.decision === "DENY" ? "Blocked" : v.decision === "STEP_UP" ? "Needs OK" : "Allowed", selected: v.id === selectedId });
      for (const [arg, o] of Object.entries(v.arg_origins ?? {})) {
        if (o.origin === "model_unknown" || !(o.control || o.trust === "untrusted")) continue;
        const sid = o.source_id ? "src:" + o.source_id : "src:" + o.origin;
        const lab = o.source_label ?? (o.source_id && chunkLabels?.[o.source_id]) ?? (o.origin === "user" ? "Your task" : o.origin.replace("_", " "));
        const c = trustColor(o.trust);
        add(sid, { kind: "src", tag: SRC_TAG[o.origin] ?? "Source", title: lab, color: c });
        E.push({ id: `${sid}>${aid}>${arg}`, source: sid, target: aid, label: o.control ? `${arg} · decides where` : arg, labelStyle: { fill: "var(--bone)", fontSize: 12.5 }, labelBgStyle: { fill: "var(--panel-2)" }, labelBgPadding: [6, 3], labelBgBorderRadius: 6,
          style: { stroke: c, strokeWidth: o.control ? 2.2 : 1.2, strokeDasharray: o.control ? undefined : "4 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: c, width: 16, height: 16 } });
        g.setEdge(sid, aid);
      }
    }
    if (all) {  // live view: also chain the steps in order so the flowchart grows with every action
      for (let i = 1; i < verdicts.length; i++) { const a = "act:" + verdicts[i - 1].id, b = "act:" + verdicts[i].id;
        E.push({ id: `seq:${a}>${b}`, source: a, target: b, style: { stroke: "var(--line-2)", strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--faint)", width: 14, height: 14 } }); g.setEdge(a, b); }
    }
    dagre.layout(g); for (const n of N) { const p = g.node(n.id); n.position = { x: p.x - NW / 2, y: p.y - NH / 2 }; }
    return { nodes: N, edges: E };
  }, [verdicts, chunkLabels, selectedId, all]);
  if (!nodes.length) return <div className="flex h-full items-center justify-center text-[15px] text-muted">No data flowed between sources and actions.</div>;
  return (
    <div className="flex h-full w-full flex-col" aria-label="Provenance graph: where each argument came from">
      <div className="flex flex-wrap items-center gap-4 px-4 pt-3 text-[13px] text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ice" />Trusted</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blood" />Untrusted</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 bg-bone" />Chose where it went</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-5 border-t border-dashed border-bone" />Just content</span>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow key={nodes.length} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.3} zoomOnScroll={false} onNodeClick={(_, n) => n.id.startsWith("act:") && onSelect?.(n.id.slice(4))}>
          <Background color="var(--line)" gap={22} />
        </ReactFlow>
      </div>
    </div>);
}
