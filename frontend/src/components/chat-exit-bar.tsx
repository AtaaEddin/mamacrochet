"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Home, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";

const PILL =
  "inline-flex h-11 items-center gap-1.5 rounded-full border border-border/70 bg-background px-4 " +
  "text-xs font-semibold text-foreground transition-colors hover:bg-muted hover:text-foreground " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

/**
 * Exit bar for /chat (plan: chat-fab-and-exit-nav, owner 2026-10-01):
 * the easy way OUT of the chat — Back (previous page, or the conversations
 * list in thread mode), Home, and the works list. 44 px tall pills with
 * text labels (labeled destinations beat icon-guessing), RTL-safe.
 *
 * Left arrow, not a cross: the arrow reads "return to the previous route"
 * (Baymard back-button research); a cross would read "close chat".
 */
export function ChatExitBar({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}) {
  const t = useTranslations("Chat");

  return (
    <nav aria-label={t("exitLabel")} className="mb-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBack}
        className={`${PILL} max-w-full`}
        title={backLabel}
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        <span className="truncate">{backLabel}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/" className={PILL}>
          <Home className="size-4 shrink-0" aria-hidden="true" />
          {t("home")}
        </Link>
        <Link href="/works" className={PILL}>
          <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
          {t("works")}
        </Link>
      </div>
    </nav>
  );
}
