import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";

const buildKey = (baseKey: string, pathname: string) => `${baseKey}:${pathname}`;

export function useSessionState<T>(
  baseKey: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const { pathname } = useLocation();
  const key = useMemo(() => buildKey(baseKey, pathname), [baseKey, pathname]);
  const isHydratedRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) {
        return JSON.parse(raw) as T;
      }
    } catch {}
    return initialValue;
  });

  useEffect(() => {
    // When pathname changes, rehydrate from new key
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) {
        setState(JSON.parse(raw) as T);
        isHydratedRef.current = true;
        return;
      }
    } catch {}
    setState(initialValue);
    isHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}

export default useSessionState;


