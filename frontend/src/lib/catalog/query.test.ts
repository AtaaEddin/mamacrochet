import { describe, expect, it } from "vitest";

import { buildProductsQuery } from "./query";

describe("buildProductsQuery", () => {
  it("defaults: first page of 12, newest first", () => {
    expect(buildProductsQuery()).toEqual({
      $top: 12,
      $skip: 0,
      $orderby: "createdAt desc",
    });
  });

  it("composes $top/$skip from page + pageSize", () => {
    expect(buildProductsQuery({ page: 3, pageSize: 24 })).toEqual({
      $top: 24,
      $skip: 48,
      $orderby: "createdAt desc",
    });
  });

  it("clamps pageSize to [1, 96] and page to >= 1", () => {
    expect(buildProductsQuery({ pageSize: 0 })).toMatchObject({ $top: 1 });
    expect(buildProductsQuery({ pageSize: 999 })).toMatchObject({ $top: 96 });
    expect(buildProductsQuery({ page: 0 })).toMatchObject({ $skip: 0 });
    expect(buildProductsQuery({ page: -3 })).toMatchObject({ $skip: 0 });
  });

  it("filters by category id", () => {
    expect(buildProductsQuery({ categoryId: "cat-1" }).$filter).toBe(
      "category eq 'cat-1'",
    );
  });

  it("searches titles (escaped, trimmed)", () => {
    expect(
      buildProductsQuery({ titleSearch: "O'Neil" }).$filter,
    ).toBe("contains(title, 'O''Neil')");
    expect(buildProductsQuery({ titleSearch: "  bag  " }).$filter).toBe(
      "contains(title, 'bag')",
    );
  });

  it("ignores blank search / empty category", () => {
    expect(buildProductsQuery({ titleSearch: "   " })).not.toHaveProperty(
      "$filter",
    );
    expect(buildProductsQuery({ categoryId: null })).not.toHaveProperty(
      "$filter",
    );
  });

  it("combines both clauses with OData infix and", () => {
    expect(
      buildProductsQuery({ categoryId: "c", titleSearch: "bag" }).$filter,
    ).toBe("category eq 'c' and contains(title, 'bag')");
  });
});
