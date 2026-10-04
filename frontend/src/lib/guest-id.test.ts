import { beforeEach, describe, expect, it } from "vitest";

import { getGuestId } from "./guest-id";

const STORAGE_KEY = "hc.guestId";
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("getGuestId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a valid v4 guid and persists it", () => {
    const first = getGuestId();
    expect(first).toMatch(V4);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(first);
  });

  it("returns the same id on every call (stable per device)", () => {
    expect(getGuestId()).toBe(getGuestId());
  });

  it("reuses a valid stored guid", () => {
    const stored = "12345678-1234-4abc-8def-123456789abc";
    window.localStorage.setItem(STORAGE_KEY, stored);
    expect(getGuestId()).toBe(stored);
  });

  it("replaces an invalid stored value with a fresh guid", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-a-guid");
    const fresh = getGuestId();
    expect(fresh).toMatch(V4);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(fresh);
  });

  it("survives a throwing localStorage (private mode) with an in-memory id", () => {
    const storage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    try {
      const fresh = getGuestId();
      expect(fresh).toMatch(V4);
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        writable: true,
        value: storage,
      });
    }
  });
});
