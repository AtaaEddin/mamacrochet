import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Site chrome (header + footer) for the regular pages. The `/chat` app
 * screen deliberately lives OUTSIDE this route group: no header, no footer,
 * and therefore no page scroll — only the chat's own lists scroll
 * (plan 20261002-1847, sub-plan 01).
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
