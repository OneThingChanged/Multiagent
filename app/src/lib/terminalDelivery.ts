import type { TerminalDataPayload, TerminalReplay } from "../platform/ipcContract";

export type TerminalDeliveryState = {
  lastSequence: number;
  syncing: boolean;
  pendingOutput: TerminalDataPayload[];
};

type DeliveryResult = "applied" | "duplicate" | "legacy" | "queued" | "gap";
type ImmediateDeliveryResult = Exclude<DeliveryResult, "queued">;
type TerminalSegment = Omit<TerminalDataPayload, "id"> & { id?: string };

function isSequenced(payload: TerminalSegment) {
  return Number.isInteger(payload.sequenceStart) &&
    Number.isInteger(payload.sequenceEnd) &&
    payload.sequenceStart! >= 0 &&
    payload.sequenceEnd! >= payload.sequenceStart!;
}

function applyNow(
  state: TerminalDeliveryState,
  payload: TerminalSegment,
  write: (data: string) => void
): ImmediateDeliveryResult {
  if (!isSequenced(payload)) {
    if (payload.data) write(payload.data);
    return "legacy";
  }

  const start = payload.sequenceStart!;
  const end = payload.sequenceEnd!;
  if (payload.resetRequired) {
    if (payload.data) write(payload.data);
    state.lastSequence = end;
    return "applied";
  }
  if (end <= state.lastSequence) return "duplicate";
  if (start > state.lastSequence) return "gap";

  const overlap = Math.max(0, state.lastSequence - start);
  const remaining = payload.data.slice(overlap);
  if (remaining) write(remaining);
  state.lastSequence = end;
  return "applied";
}

export function beginTerminalSync(state: TerminalDeliveryState) {
  state.syncing = true;
}

export function deliverTerminalData(
  state: TerminalDeliveryState,
  payload: TerminalDataPayload,
  write: (data: string) => void
): DeliveryResult {
  if (state.syncing) {
    state.pendingOutput.push(payload);
    return "queued";
  }
  const result = applyNow(state, payload, write);
  if (result === "gap") {
    state.pendingOutput.push(payload);
    state.syncing = true;
  }
  return result;
}

export function completeTerminalSync(
  state: TerminalDeliveryState,
  replay: TerminalReplay,
  write: (data: string) => void
): ImmediateDeliveryResult {
  const replayResult = applyNow(state, replay, write);
  if (replayResult === "gap") return "gap";

  const queued = state.pendingOutput.splice(0).sort((a, b) =>
    (a.sequenceStart ?? Number.MAX_SAFE_INTEGER) -
    (b.sequenceStart ?? Number.MAX_SAFE_INTEGER)
  );
  state.syncing = false;
  let finalResult: ImmediateDeliveryResult = replayResult;
  for (let index = 0; index < queued.length; index += 1) {
    const result = applyNow(state, queued[index], write);
    if (result === "gap") {
      state.pendingOutput.push(...queued.slice(index));
      state.syncing = true;
      return "gap";
    }
    finalResult = result;
  }
  return finalResult;
}
