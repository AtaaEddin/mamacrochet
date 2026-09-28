import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/en", { waitUntil: "networkidle" });
try {
  await page.waitForFunction(
    () => {
      const el = document.querySelector("span[role='status']");
      return el && /API online|API offline/.test(el.textContent ?? "");
    },
    { timeout: 20000 },
  );
  const pill = await page.locator("span[role='status']").textContent();
  console.log("PILL TEXT:", JSON.stringify(pill));
  const ok = /API online/.test(pill);
  console.log(ok ? "E2E PASS: browser -> CORS -> API -> Postgres via Aspire" : "E2E FAIL: API not reachable from browser");
  await page.locator("footer").screenshot({ path: "/tmp/hanadicrochet-shots/footer-e2e-pill.png" });
  process.exit(ok ? 0 : 1);
} catch {
  const pill = await page.locator("span[role='status']").textContent().catch(() => "(no pill)");
  console.log("E2E FAIL: pill never settled. text:", JSON.stringify(pill));
  process.exit(1);
} finally {
  await browser.close();
}
