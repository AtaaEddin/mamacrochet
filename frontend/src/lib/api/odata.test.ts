import { describe, expect, it } from "vitest";

import { escapeOData } from "./odata";

describe("escapeOData", () => {
  it("doubles single quotes (OData string literal escaping)", () => {
    expect(escapeOData("O'Brien")).toBe("O''Brien");
    expect(escapeOData("''")).toBe("''''");
  });

  it("leaves other characters untouched", () => {
    expect(escapeOData("bag & pouch")).toBe("bag & pouch");
    expect(escapeOData("")).toBe("");
  });
});
