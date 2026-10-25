"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { get, ApiError } from "./api";

export interface ApiState<T> { data: T; loading: boolean; error: string | null; sample: boolean; reload: () => void }
/** GET with graceful degradation: if the core is unreachable we show labelled sample data; real HTTP errors surface as messages. */
export function useApi<T>(path: string | null, fallback: T, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const fb = useRef(fallback); useEffect(() => { fb.current = fallback; });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    get<T>(path).then((d) => { if (live) { setData(d); setSample(false); setError(null); } })
      .catch((e: unknown) => { if (!live) return; if (e instanceof ApiError && e.status === 0) { setData(fb.current); setSample(true); setError(null); } else setError(e instanceof Error ? e.message : "Something went wrong"); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n, ...deps]);
  return { data, loading, error, sample, reload: useCallback(() => { setLoading(true); setN((x) => x + 1); }, []) };
}
