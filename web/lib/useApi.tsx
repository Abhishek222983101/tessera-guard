"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { get, ApiError } from "./api";

/** GET with loading/error state and optional polling. Keeps the previous data while refreshing. */
export function useApi<T>(path: string | null, opts: { poll?: number; refreshKey?: unknown } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try { const d = await get<T>(path); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError(e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong")); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after the awaited fetch
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load, opts.refreshKey, path]);
  useEffect(() => { if (!opts.poll || !path) return; const t = setInterval(load, opts.poll); return () => clearInterval(t); }, [load, opts.poll, path]);
  return { data, error, loading, reload: load };
}

export function ErrorNote({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-md border border-blood/40 bg-blood/10 px-3 py-2 text-[13px]">
      <span className="flex-1">{error.message}</span>
      {onRetry && <button onClick={onRetry} className="rounded border border-line2 px-2 py-0.5 text-[12px] text-muted hover:text-bone">Try again</button>}
    </div>);
}
