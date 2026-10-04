import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests (plan 20261004-0554/04) — Vitest on jsdom, React plugin,
// `@` alias matching tsconfig paths. Tests live next to the code:
// src/**/*.test.{ts,tsx}. The e2e smoke is opt-in (sub-plan 05) and not
// part of this suite.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
