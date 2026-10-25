"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { docPageUrl, PDF_SCALE } from "@/lib/api";

export interface Highlight { id: string; page: number; bbox: number[]; text: string; kind?: string }
export interface DocViewerHandle { highlightEl(id: string): HTMLElement | null }

/** Page image + hidden-text overlays. Highlights are keyboard-focusable; hovering one announces which actions it caused (via onActivate). */
const DocViewer = forwardRef<DocViewerHandle, {
  docId: string; title?: string; pages: number; highlights: Highlight[]; activeId?: string | null; onActivate?: (id: string | null) => void; page?: number; onPage?: (p: number) => void;
}>(function DocViewer({ docId, title, pages, highlights, activeId, onActivate, page: pageProp, onPage }, ref) {
  const [pageState, setPageState] = useState(highlights[0]?.page ?? 1);
  const page = pageProp ?? pageState; const setPage = (p: number) => { setPageState(p); onPage?.(p); };
  const els = useRef<Record<string, HTMLElement | null>>({});
  const [loaded, setLoaded] = useState(false); const [failed, setFailed] = useState(false);
  useImperativeHandle(ref, () => ({ highlightEl: (id) => els.current[id] ?? null }));
  const hs = highlights.filter((h) => h.page === page);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <FileText size={16} className="text-faint" aria-hidden /><span className="min-w-0 flex-1 truncate text-[15px] text-bone">{title ?? docId}</span>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => { setLoaded(false); setPage(page - 1); }} className="rounded-md p-1.5 text-muted enabled:hover:bg-panel2 disabled:opacity-30"><ChevronLeft size={16} /></button>
        <span className="mono tnum text-[13px] text-muted">{page} / {pages}</span>
        <button aria-label="Next page" disabled={page >= pages} onClick={() => { setLoaded(false); setPage(page + 1); }} className="rounded-md p-1.5 text-muted enabled:hover:bg-panel2 disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
      <div className="relative bg-ink p-4">
        <div className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-lg ring-1 ring-line" style={{ aspectRatio: "595 / 842" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={docPageUrl(docId, page)} alt={`Page ${page} of ${title ?? docId}`} className="absolute inset-0 h-full w-full bg-[#161618]" style={{ filter: "invert(.9) hue-rotate(180deg) contrast(.95)" }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
          {!loaded && !failed && <div className="absolute inset-0 animate-pulse bg-white/10" />}
          {failed && <div className="absolute inset-0 flex items-center justify-center bg-panel2 p-4 text-center text-[15px] text-muted">Page preview isn&apos;t available.</div>}
          {hs.map((h) => {
            const [x0, y0, x1, y1] = h.bbox.map((v) => v * PDF_SCALE); const W = 595.28 * PDF_SCALE, H = 841.89 * PDF_SCALE; const on = activeId === h.id;
            const off = x1 < 0; // off-page text: pin to the left edge
            const left = off ? 0 : (x0 / W) * 100, width = off ? 6 : Math.max(((x1 - x0) / W) * 100, 4), top = (y0 / H) * 100, height = Math.max(((y1 - y0) / H) * 100, 1.4);
            return (
              <button key={h.id} ref={(el) => { els.current[h.id] = el; }} type="button" onMouseEnter={() => onActivate?.(h.id)} onMouseLeave={() => onActivate?.(null)} onFocus={() => onActivate?.(h.id)} onBlur={() => onActivate?.(null)}
                aria-label={`Hidden text: ${h.text}`} title={h.text}
                className="absolute rounded-[2px] outline-offset-2" style={{ left: `${left}%`, top: `${top - 0.6}%`, width: `${width}%`, height: `${height + 1.2}%`, background: on ? "rgba(240,84,90,.40)" : "rgba(240,84,90,.22)", border: "1.5px solid var(--blood)", boxShadow: on ? "0 0 0 3px rgba(240,84,90,.28)" : undefined, transition: "background 150ms, box-shadow 150ms" }} />);
          })}
        </div>
        {hs.length > 0 && <p className="mx-auto mt-3 max-w-[560px] text-[15px] text-muted"><b className="font-medium text-blood">Hidden text.</b> A person sees a blank gap; the agent reads it.</p>}
      </div>
    </div>);
});
export default DocViewer;
