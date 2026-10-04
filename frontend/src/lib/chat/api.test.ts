import { beforeEach, describe, expect, it, vi } from "vitest";

import * as chat from "./api";

vi.mock("@/lib/api/generated-client", () => {
  return {
    Chat: {
      bootstrapVisitorThread: vi.fn(),
    },
    Staff: {
      searchCustomers: vi.fn(),
    },
  };
});

import { Chat } from "@/lib/api/generated-client";

const sdk = Chat as unknown as {
  bootstrapVisitorThread: ReturnType<typeof vi.fn>;
};

const OK = {
  data: {
    thread: { id: "thread-1" },
    token: "tok-1",
  },
  error: undefined,
};

beforeEach(() => {
  sdk.bootstrapVisitorThread.mockReset();
  sdk.bootstrapVisitorThread.mockResolvedValue(OK);
});

describe("bootstrapVisitorThread", () => {
  it("dedupes concurrent bootstraps per device (one POST /chat/visitor)", async () => {
    let released: () => void = () => {};
    const gate = new Promise<void>((res) => {
      released = () => res();
    });
    sdk.bootstrapVisitorThread.mockImplementationOnce(async () => {
      await gate;
      return OK;
    });

    const a = chat.bootstrapVisitorThread("guest-a");
    const b = chat.bootstrapVisitorThread("guest-a");
    // Still in flight: a third concurrent caller joins the same call.
    const c = chat.bootstrapVisitorThread("guest-a");
    released();
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(sdk.bootstrapVisitorThread).toHaveBeenCalledTimes(1);
    expect(sdk.bootstrapVisitorThread.mock.calls[0]?.[0]).toEqual({
      body: { guestId: "guest-a", name: null, website: null, reset: false },
    });
    expect(ra).toEqual({
      ok: true,
      data: { thread: { id: "thread-1" }, token: "tok-1" },
    });
    expect(rb).toBe(ra);
    expect(rc).toEqual(ra);
  });

  it("a later call (after settle) hits the API again", async () => {
    const first = await chat.bootstrapVisitorThread("guest-b");
    const second = await chat.bootstrapVisitorThread("guest-b");
    expect(sdk.bootstrapVisitorThread).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it("reset=true is a separate in-flight key (no cross-reset sharing)", async () => {
    let released: () => void = () => {};
    const gate = new Promise<void>((res) => {
      released = () => res();
    });
    sdk.bootstrapVisitorThread.mockImplementationOnce(
      async () => (await gate, OK),
    );
    sdk.bootstrapVisitorThread.mockImplementationOnce(
      async () => (await gate, OK),
    );

    const plain = chat.bootstrapVisitorThread("guest-c", false);
    const reset = chat.bootstrapVisitorThread("guest-c", true);
    released();
    const [rp, rr] = await Promise.all([plain, reset]);

    expect(sdk.bootstrapVisitorThread).toHaveBeenCalledTimes(2);
    expect(rp.ok && rr.ok).toBe(true);
    const resetCalls = sdk.bootstrapVisitorThread.mock.calls.filter(
      (c) => c[0]?.body?.reset === true,
    );
    expect(resetCalls).toHaveLength(1);
  });

  it("surfaces the ApiError envelope and lets the next call retry", async () => {
    sdk.bootstrapVisitorThread.mockImplementationOnce(async () => ({
      data: undefined,
      error: { code: "rate_limited", message: "Slow down." },
    }));

    const first = await chat.bootstrapVisitorThread("guest-d");
    expect(first).toEqual({
      ok: false,
      error: { code: "rate_limited", message: "Slow down." },
    });

    const second = await chat.bootstrapVisitorThread("guest-d");
    expect(second.ok).toBe(true);
    expect(sdk.bootstrapVisitorThread).toHaveBeenCalledTimes(2);
  });

  it("maps a network failure to a network error envelope", async () => {
    sdk.bootstrapVisitorThread.mockRejectedValueOnce(new Error("offline"));
    const r = await chat.bootstrapVisitorThread("guest-e");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("network");
  });
});
