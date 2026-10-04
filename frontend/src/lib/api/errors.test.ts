import { describe, expect, it } from "vitest";

import { toApiError } from "./errors";

describe("toApiError", () => {
  it("passes through a valid ApiError envelope", () => {
    const body = { code: "bad_credentials", message: "Bad login." };
    expect(toApiError(body)).toEqual(body);
    expect(toApiError(body, "ignored")).toBe(body);
  });

  it("keeps unknown codes verbatim (UI falls back to the message)", () => {
    const body = { code: "identity_password", message: "Server text" };
    expect(toApiError(body)).toEqual(body);
  });

  it("yields the fallback envelope for null/undefined (network failure)", () => {
    expect(toApiError(null, "offline")).toEqual({
      code: "server_error",
      message: "offline",
    });
    expect(toApiError(undefined, "offline")).toEqual({
      code: "server_error",
      message: "offline",
    });
  });

  it("yields the fallback envelope for non-envelope values", () => {
    expect(toApiError("boom", "fb")).toEqual({
      code: "server_error",
      message: "fb",
    });
    expect(toApiError(42, "fb")).toEqual({ code: "server_error", message: "fb" });
    expect(toApiError({}, "fb")).toEqual({ code: "server_error", message: "fb" });
    expect(
      toApiError({ code: "csrf" }, "fb"),
    ).toEqual({ code: "server_error", message: "fb" });
    expect(
      toApiError({ message: "no code" }, "fb"),
    ).toEqual({ code: "server_error", message: "fb" });
    expect(toApiError(new Error("x"), "fb")).toEqual({
      code: "server_error",
      message: "fb",
    });
  });

  it("uses an empty fallback message when none is given", () => {
    expect(toApiError(null)).toEqual({ code: "server_error", message: "" });
  });
});
