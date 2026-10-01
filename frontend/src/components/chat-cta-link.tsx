"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { rememberChatReturnTo } from "@/lib/chat/return-to";

/**
 * Header "Say hi" chat CTA — client component (so the header itself can stay
 * a server component): remembers the current URL before navigating, the same
 * way the floating bubble does (plan: chat-fab-and-exit-nav).
 */
export function ChatCtaLink() {
  const t = useTranslations("Nav");
  return (
    <Link
      href="/chat"
      data-chat-cta=""
      onClick={rememberChatReturnTo}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <MessageCircle className="size-4.5" aria-hidden="true" />
      {t("hello")}
    </Link>
  );
}
