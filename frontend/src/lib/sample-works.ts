/**
 * SAMPLE works shown on the home + works list pages until real products
 * exist (plan 04).
 *
 * Plan 04 replaces this with the real "most loved" selection (highest
 * rated / most ordered first) + category rows (D20: many categories
 * later) + the dynamic search API (D19). Prices display USD only (D11).
 */
export type WorkArtKind =
  | "sunflowerTote"
  | "pumpkin"
  | "owlBag"
  | "strawberry"
  | "bird"
  | "teacup";

export type WorkCategory = "bags" | "dolls" | "small";

export type SampleWork = {
  id: string;
  art: WorkArtKind;
  /** Key into the Works.items message namespace. */
  nameKey: string;
  category: WorkCategory;
  priceUsd: number;
  rating: number;
  orders: number;
};

export const WORK_CATEGORIES: WorkCategory[] = ["bags", "dolls", "small"];

export const SAMPLE_WORKS: SampleWork[] = [
  { id: "w1", art: "sunflowerTote", nameKey: "sunflowerTote", category: "bags", priceUsd: 24, rating: 4.9, orders: 212 },
  { id: "w2", art: "owlBag", nameKey: "owlBag", category: "bags", priceUsd: 32, rating: 4.8, orders: 187 },
  { id: "w3", art: "pumpkin", nameKey: "pumpkin", category: "dolls", priceUsd: 18, rating: 4.9, orders: 154 },
  { id: "w4", art: "strawberry", nameKey: "strawberry", category: "small", priceUsd: 8, rating: 4.7, orders: 143 },
  { id: "w5", art: "bird", nameKey: "bird", category: "dolls", priceUsd: 22, rating: 4.8, orders: 121 },
  { id: "w6", art: "teacup", nameKey: "teacup", category: "small", priceUsd: 27, rating: 4.7, orders: 98 },
];
