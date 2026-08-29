type NativeViewOcclusionListener = (occluded: boolean) => void;

const blockers = new Set<symbol>();
const listeners = new Set<NativeViewOcclusionListener>();

function publish() {
  const occluded = blockers.size > 0;
  for (const listener of listeners) listener(occluded);
}

export function areNativeViewsOccluded() {
  return blockers.size > 0;
}

export function acquireNativeViewOcclusion() {
  const blocker = Symbol("native-view-occlusion");
  blockers.add(blocker);
  publish();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    blockers.delete(blocker);
    publish();
  };
}

export function subscribeNativeViewOcclusion(listener: NativeViewOcclusionListener) {
  listeners.add(listener);
  listener(areNativeViewsOccluded());
  return () => {
    listeners.delete(listener);
  };
}
