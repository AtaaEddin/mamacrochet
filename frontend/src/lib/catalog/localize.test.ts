import { describe, expect, it } from "vitest";

import type { CategoryDto, ProductDto } from "@/lib/api/generated-client";
import { categoryName, productDescription, productTitle } from "./localize";

function product(
  localizations: ProductDto["localizations"],
): ProductDto {
  return {
    id: "p1",
    category: null,
    localizations,
    images: [],
    coverImage: null,
    price: "10",
    currency: "USD",
    stockUnits: "1",
    inStock: true,
    isListed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
  };
}

function category(names: CategoryDto["names"]): CategoryDto {
  return { id: "c1", names, sortOrder: 0, isListed: true };
}

describe("productTitle", () => {
  it("prefers the requested locale, then en, then any row", () => {
    const p = product([
      { language: "en", title: "En Bag", description: null },
      { language: "ar", title: "حقيبة", description: null },
      { language: "tr", title: "Torba", description: null },
    ]);
    expect(productTitle(p, "ar")).toBe("حقيبة");
    expect(productTitle(p, "en")).toBe("En Bag");
    // Unknown locale falls back to en.
    expect(productTitle(p, "fr")).toBe("En Bag");
  });

  it("falls back to the first row when no en row exists (belt & braces)", () => {
    const p = product([
      { language: "tr", title: "Torba", description: null },
      { language: "ar", title: "حقيبة", description: null },
    ]);
    expect(productTitle(p, "en")).toBe("Torba");
  });

  it("returns an em dash when there is no row at all", () => {
    expect(productTitle(product([]), "en")).toBe("—");
  });
});

describe("productDescription", () => {
  it("returns the trimmed description for the locale", () => {
    const p = product([
      { language: "en", title: "Bag", description: "  Soft and roomy. " },
      { language: "ar", title: "حقيبة", description: null },
    ]);
    expect(productDescription(p, "en")).toBe("Soft and roomy.");
    expect(productDescription(p, "ar")).toBeNull();
  });

  it("returns null when no description is set anywhere", () => {
    const p = product([
      { language: "en", title: "Bag", description: null },
    ]);
    expect(productDescription(p, "en")).toBeNull();
  });
});

describe("categoryName", () => {
  it("prefers the requested locale, then en, then any row", () => {
    const c = category([
      { language: "en", name: "Bags" },
      { language: "ar", name: "حقائب" },
    ]);
    expect(categoryName(c, "ar")).toBe("حقائب");
    expect(categoryName(c, "de")).toBe("Bags");
  });

  it("is null-safe", () => {
    expect(categoryName(null, "en")).toBeNull();
    expect(categoryName(undefined, "en")).toBeNull();
    expect(categoryName(category([]), "en")).toBeNull();
  });
});
