"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { MessageCircleHeart } from "lucide-react";
import { rememberChatReturnTo } from "@/lib/chat/return-to";

/**
 * Floating chat launcher (plan 06, brand v2): the bottom-corner bubble that
 * takes visitors to /chat — the full chat surface (guest bootstrap, D14).
 *
 * "The floating bubble is only a launcher" (owner 2026-09-26): it navigates,
 * it does not embed a second panel. Owner 2026-10-01: quick access on EVERY
 * page → shown on all viewports (mobile + desktop), superseding the old
 * "mobile-only; desktop keeps the header CTA" decision. Quiet on purpose
 * (no pulse): findable, not noticed.
 *
 * On click it remembers the current URL (sessionStorage) so /chat's exit bar
 * can send the visitor back to the previous page. Hidden where the team
 * works or chat is already the current surface.
 */
export function ChatLauncher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();

  if (new RegExp(`^/${locale}/(chat|staff|admin)(/|$)`).test(pathname)) {
    return null;
  }

  return (
    <a
      href={`/${locale}/chat`}
      onClick={rememberChatReturnTo}
      aria-label={t("launcher")}
      className="fixed bottom-4 end-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
    >
      <MessageCircleHeart className="size-7" aria-hidden="true" />
    </a>
  );
}
