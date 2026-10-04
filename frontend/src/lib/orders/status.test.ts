import { describe, expect, it } from "vitest";

import { isOrderStatus, ORDER_FLOW, statusFlowIndex } from "./status";

describe("ORDER_FLOW", () => {
  it("is the happy-path sequence", () => {
    expect(ORDER_FLOW).toEqual([
      "open",
      "in_progress",
      "ready_for_payment",
      "paid",
      "delivered",
      "closed",
    ]);
  });
});

describe("isOrderStatus", () => {
  it("accepts every lifecycle status", () => {
    for (const status of [
      "open",
      "in_progress",
      "ready_for_payment",
      "paid",
      "delivered",
      "closed",
      "cancelled",
    ]) {
      expect(isOrderStatus(status)).toBe(true);
    }
  });

  it("rejects unknown, empty, and case-variant values", () => {
    expect(isOrderStatus("")).toBe(false);
    expect(isOrderStatus(" ")).toBe(false);
    expect(isOrderStatus("Open")).toBe(false);
    expect(isOrderStatus("shipped")).toBe(false);
    expect(isOrderStatus("ready_for_payment ")).toBe(false);
  });
});

describe("statusFlowIndex", () => {
  it("indexes the happy path in order", () => {
    expect(statusFlowIndex("open")).toBe(0);
    expect(statusFlowIndex("in_progress")).toBe(1);
    expect(statusFlowIndex("ready_for_payment")).toBe(2);
    expect(statusFlowIndex("paid")).toBe(3);
    expect(statusFlowIndex("delivered")).toBe(4);
    expect(statusFlowIndex("closed")).toBe(5);
  });

  it("returns -1 for cancelled and unknown statuses", () => {
    expect(statusFlowIndex("cancelled")).toBe(-1);
    expect(statusFlowIndex("nope")).toBe(-1);
    expect(statusFlowIndex("")).toBe(-1);
  });
});
