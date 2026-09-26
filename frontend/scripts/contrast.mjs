#!/usr/bin/env node
/**
 * WCAG AA contrast check for the mamacrochet brand tokens.
 *
 * Parses the `:root` (light) and `.dark` blocks of `src/app/globals.css`,
 * converts OKLCH values to sRGB relative luminance, and verifies that every
 * text/surface pair meets WCAG AA (4.5:1).
 *
 * Usage: node scripts/contrast.mjs   (exit 1 on failure)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

function parseBlock(selector) {
  const re = new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = css.match(re);
  if (!match) throw new Error(`Block ${selector} not found in globals.css`);
  const vars = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*(--[\w-]+):\s*(.+?);/);
    if (m) vars[m[1].slice(2)] = m[2];
  }
  return vars;
}

/** oklch(L C H [/ alpha]) -> { l, a, b } */
function parseOklch(value) {
  const m = value.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/,
  );
  if (!m) return null;
  const [l, c, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const rad = (h * Math.PI) / 180;
  return { L: l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

/** OKLCH -> relative luminance (WCAG) */
function luminance(oklch) {
  const { L, a, b } = oklch;
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  // The matrix output is already linear-light sRGB; clamp out-of-gamut values.
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(bl);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function contrast(fg, bg) {
  const l1 = luminance(parseOklch(fg));
  const l2 = luminance(parseOklch(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
];

let failed = false;

for (const [theme, selector] of [
  ["light", ":root"],
  ["dark", ".dark"],
]) {
  const vars = parseBlock(selector);
  console.log(`\n${theme === "light" ? ":root (light)" : ".dark (dark)"}`);
  for (const [fg, bg] of PAIRS) {
    const fgVal = vars[fg];
    const bgVal = vars[bg];
    if (!fgVal || !bgVal) {
      console.log(`  SKIP  ${fg} / ${bg} (missing)`);
      continue;
    }
    if (bgVal.includes("/")) {
      console.log(`  SKIP  ${fg} / ${bg} (alpha surface)`);
      continue;
    }
    const ratio = contrast(fgVal, bgVal);
    const ok = ratio >= 4.5;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2)}:1  ${fg} on ${bg} (need 4.50:1)`,
    );
  }
}

console.log(failed ? "\nContrast check FAILED (WCAG AA 4.5:1)." : "\nAll text/surface pairs pass WCAG AA (4.5:1).");
process.exit(failed ? 1 : 0);
