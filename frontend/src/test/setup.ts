// Vitest setup (plan 20261004-0554/04).
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement crypto.randomUUID — mirror Node's webcrypto so
// the guest-id / client-id paths run against a real implementation.
const cryptoObj = globalThis.crypto as Crypto & { randomUUID?: () => string };
if (typeof cryptoObj.randomUUID !== "function") {
  Object.defineProperty(cryptoObj, "randomUUID", {
    value: webcrypto.randomUUID.bind(webcrypto),
  });
}

// React Testing Library auto-cleanup needs the (global) afterEach.
afterEach(() => {
  cleanup();
});
