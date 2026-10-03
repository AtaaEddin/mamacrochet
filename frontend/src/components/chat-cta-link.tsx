"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { rememberChatReturnTo } from "@/lib/chat/return-to";
import * as chatApi from "@/lib/chat/api";

/**
 * Header chat CTA (plan 20261002-1847, sub 03).
 *
 * Guests and users without open conversations: "Say hi". A signed-in
 * customer coming back to the site: thread-aware — "Your chat" + a badge
 * with the number of open (unclosed) conversations, so the way to see the
 * chat UI is visible and concrete, not a generic hi.
 *
 * One lightweight call (GET /chat/threads?closed=false, page 1) after
 * hydration and on every in-site navigation — the header persists across
 * navigations, so the badge refreshes with the pathname (no background
 * polling — this is a self-hosted, low-power target). 401 means
 * guest/anonymous → "Say hi". Initial render is always "Say hi"
 * (hydration-safe); the variant appears only after the fetch resolves.
 */
export function ChatCtaLink() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [openCount, setOpenCount] = useState<number | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    void chatApi.fetchThreads({ closed: false }).then((r) => {
      if (cancelled || id !== requestId.current) return;
      setOpenCount(r.ok ? r.data.threads.length : null);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const variant = openCount !== null && openCount > 0;

  return (
    <Link
      href="/chat"
      data-chat-cta=""
      onClick={rememberChatReturnTo}
      aria-label={variant ? t("yourChatAria", { count: openCount }) : undefined}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <MessageCircle className="size-4.5" aria-hidden="true" />
      <span>{variant ? t("yourChat") : t("hello")}</span>
      {variant && (
        <span
          aria-hidden="true"
          className="rounded-full bg-background/90 px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary"
        >
          {openCount}
        </span>
      )}
    </Link>
  );
}
