import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProductDto } from "./localize";
import { fileSrc, toWorkDisplay } from "./display";

function product(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: "p1",
    category: null,
    localizations: [{ language: "en", title: "Bag", description: null }],
    images: [],
    coverImage: null,
    price: "12.50",
    currency: "USD",
    stockUnits: "3",
    inStock: true,
    isListed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("fileSrc", () => {
  const ENV_KEY = "NEXT_PUBLIC_API_URL";

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("resolves API paths against the dev API base by default", () => {
    expect(fileSrc("/files/products/1/a.webp")).toBe(
      "http://localhost:8085/files/products/1/a.webp",
    );
  });

  it("resolves against NEXT_PUBLIC_API_URL when set", () => {
    process.env[ENV_KEY] = "https://shop.example/api";
    expect(fileSrc("/files/products/1/a.webp")).toBe(
      "https://shop.example/api/files/products/1/a.webp",
    );
  });

  it("keeps a same-origin subpath base as a prefix (prod: /api)", () => {
    process.env[ENV_KEY] = "/api";
    expect(fileSrc("/files/products/1/a.webp")).toBe(
      "/api/files/products/1/a.webp",
    );
    process.env[ENV_KEY] = "/api/";
    expect(fileSrc("/files/products/1/a.webp")).toBe(
      "/api/files/products/1/a.webp",
    );
  });

  it("keeps signed-URL queries as queries (no percent-encoded '?')", () => {
    const signed = "/files/chat/t1/a.png?sig=abc&exp=123";
    expect(fileSrc(signed)).toBe(
      "http://localhost:8085/files/chat/t1/a.png?sig=abc&exp=123",
    );
    process.env[ENV_KEY] = "/api";
    expect(fileSrc(signed)).toBe("/api/files/chat/t1/a.png?sig=abc&exp=123");
  });

  it("returns null for absent paths", () => {
    expect(fileSrc(null)).toBeNull();
    expect(fileSrc(undefined)).toBeNull();
    expect(fileSrc("")).toBeNull();
  });
});

describe("toWorkDisplay", () => {
  it("maps a full product to the card model", () => {
    const display = toWorkDisplay(
      product({
        price: "42",
        category: {
          id: "cat",
          names: [{ language: "en", name: "Bags" }],
          sortOrder: 0,
          isListed: true,
        },
        coverImage: {
          id: "img",
          url: "/files/products/p1/cover.webp",
          thumbUrl: "/files/products/p1/cover-thumb.webp",
          sortOrder: 0,
          width: "800",
          height: "600",
        },
        inStock: false,
      }),
      "Pretty Bag",
    );
    expect(display).toEqual({
      id: "p1",
      title: "Pretty Bag",
      priceUsd: 42,
      imageSrc: "http://localhost:8085/files/products/p1/cover.webp",
      art: null,
      inStock: false,
      categoryId: "cat",
    });
  });

  it("is null-safe: no cover, no category, default art", () => {
    const display = toWorkDisplay(product(), "Plain Bag", "pumpkin");
    expect(display.imageSrc).toBeNull();
    expect(display.categoryId).toBeNull();
    expect(display.art).toBe("pumpkin");
    expect(display.inStock).toBe(true);
  });
});
