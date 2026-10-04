import { describe, expect, it } from "vitest";

import type { User } from "./auth";
import { isStaff, postAuthPath } from "./auth";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    displayName: "User",
    email: "user@example.com",
    phone: "0500000000",
    country: null,
    language: "en",
    roles: ["customer"],
    avatarUrl: null,
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    mustChangePassword: false,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    lastLoginAt: null,
    ...overrides,
  };
}

describe("isStaff", () => {
  it("employee and admin are staff; plain customer is not", () => {
    expect(isStaff(user({ roles: ["customer"] }))).toBe(false);
    expect(isStaff(user({ roles: ["customer", "employee"] }))).toBe(true);
    expect(isStaff(user({ roles: ["admin"] }))).toBe(true);
  });
});

describe("postAuthPath", () => {
  it("forced password change wins over everything", () => {
    const user_ = user({ mustChangePassword: true, roles: ["admin"] });
    expect(postAuthPath(user_, "/orders")).toBe("/change-password");
    expect(postAuthPath(user(), "/change-password")).toBe("/change-password");
  });

  it("staff go to the chat workspace (next is ignored)", () => {
    const employee = user({ roles: ["customer", "employee"] });
    expect(postAuthPath(employee, "/orders")).toBe("/chat");
    expect(postAuthPath(user({ roles: ["admin"] }), null)).toBe("/chat");
  });

  it("customer: an internal ?next= is honored", () => {
    const customer = user();
    expect(postAuthPath(customer, "/orders?next=1")).toBe("/orders?next=1");
    expect(postAuthPath(customer, "/")).toBe("/");
  });

  it("customer: external/malicious next falls back to the account page", () => {
    const customer = user();
    expect(postAuthPath(customer, "https://evil.example")).toBe("/account");
    expect(postAuthPath(customer, "https://evil.example")).toBe("/account");
    expect(postAuthPath(customer, "//evil.example/x")).toBe("/account");
    expect(postAuthPath(customer, "evil.example")).toBe("/account");
    expect(postAuthPath(customer, null)).toBe("/account");
  });
});
