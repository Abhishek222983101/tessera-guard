import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
export function layout<N extends Node, E extends Edge>(nodes: N[], edges: E[], dir: "LR" | "TB" = "LR", w = 170, h = 40, ranksep = 70): N[] {
  const g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: dir, nodesep: 24, ranksep }); g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: w, height: h })); edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => { const p = g.node(n.id); return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } }; });
}
