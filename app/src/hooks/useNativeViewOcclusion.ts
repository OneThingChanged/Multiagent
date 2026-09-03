import { useEffect, useLayoutEffect } from "react";
import { acquireNativeViewOcclusion } from "../lib/nativeViewOcclusion";

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Temporarily hides Electron native content views while renderer UI must be
 * visually on top. Blockers are reference-counted, so nested overlays cannot
 * reveal a browser until the last overlay has closed.
 */
export function useNativeViewOcclusion(active = true) {
  useClientLayoutEffect(() => {
    if (!active) return;
    return acquireNativeViewOcclusion();
  }, [active]);
}
