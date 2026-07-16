import { describe, expect, it } from "vitest";
import {
  beginTerminalSync,
  completeTerminalSync,
  deliverTerminalData,
  type TerminalDeliveryState,
} from "./terminalDelivery";

function state(): TerminalDeliveryState {
  return { lastSequence: 0, syncing: false, pendingOutput: [] };
}

describe("terminal sequence delivery", () => {
  it("deduplicates replay overlap after a view move", () => {
    const target = state();
    const output: string[] = [];
    deliverTerminalData(target, {
      id: "a", data: "first", sequenceStart: 0, sequenceEnd: 5,
    }, (data) => output.push(data));
    beginTerminalSync(target);
    deliverTerminalData(target, {
      id: "a", data: "third", sequenceStart: 11, sequenceEnd: 16,
    }, (data) => output.push(data));
    completeTerminalSync(target, {
      data: "secondthird",
      sequenceStart: 5,
      sequenceEnd: 16,
      resetRequired: false,
      truncated: false,
    }, (data) => output.push(data));

    expect(output.join("")).toBe("firstsecondthird");
    expect(target.lastSequence).toBe(16);
  });

  it("accepts a bounded reset snapshot after old output was truncated", () => {
    const target = state();
    const output: string[] = [];
    completeTerminalSync(target, {
      data: "retained",
      sequenceStart: 100,
      sequenceEnd: 108,
      resetRequired: true,
      truncated: true,
    }, (data) => output.push(data));
    expect(output).toEqual(["retained"]);
    expect(target.lastSequence).toBe(108);
  });

  it("queues a gap until a replay fills it", () => {
    const target = state();
    const output: string[] = [];
    expect(deliverTerminalData(target, {
      id: "a", data: "later", sequenceStart: 5, sequenceEnd: 10,
    }, (data) => output.push(data))).toBe("gap");
    expect(target.syncing).toBe(true);

    completeTerminalSync(target, {
      data: "firstlater",
      sequenceStart: 0,
      sequenceEnd: 10,
      resetRequired: false,
      truncated: false,
    }, (data) => output.push(data));
    expect(output.join("")).toBe("firstlater");
    expect(target.pendingOutput).toEqual([]);
  });
});
