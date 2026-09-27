import type { components } from "@/lib/api/schema";

/** Public profile of a user (login result, /identity/me, admin lists). */
export type User = components["schemas"]["UserDto"];

/** Staff = employee or admin flag (one user is always a customer too). */
export function isStaff(user: User): boolean {
  return user.roles.includes("employee") || user.roles.includes("admin");
}

/**
 * Where a just-signed-in user goes (plan 03):
 * - temporary password → the forced change gate, no way around it
 * - staff → the chat page (the staff workspace grows there, plan 06)
 * - customer → the account page; a `?next=/…` on the login page wins when it
 *   points inside the app (order-confirmation gate, plan 05)
 */
export function postAuthPath(user: User, next: string | null): string {
  if (user.mustChangePassword) return "/change-password";
  if (isStaff(user)) return "/chat";
  return next !== null && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/account";
}
