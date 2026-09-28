/**
 * Order lifecycle flow (plan 05). Isomorphic (server + client safe).
 *
 * `ORDER_FLOW` is the happy-path status sequence for the customer status
 * board stepper. `cancelled` is a terminal side-state (reachable from
 * open/in_progress) and is never part of the happy path.
 */
export const ORDER_FLOW = [
  "open",
  "in_progress",
  "ready_for_payment",
  "paid",
  "delivered",
  "closed",
] as const;

export type OrderStatusKind = (typeof ORDER_FLOW)[number] | "cancelled";

export function isOrderStatus(value: string): value is OrderStatusKind {
  return (
    value === "open" ||
    value === "in_progress" ||
    value === "ready_for_payment" ||
    value === "paid" ||
    value === "delivered" ||
    value === "closed" ||
    value === "cancelled"
  );
}

/**
 * 0-based index of `status` within the happy path. `cancelled` and unknown
 * statuses return -1 (rendered outside the stepper).
 */
export function statusFlowIndex(status: string): number {
  const i = (ORDER_FLOW as readonly string[]).indexOf(status);
  return i;
}
