import { getTranslations } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AuthBadge } from "@/components/auth-badge";
import { MamaMark } from "@/components/illustrations/mama-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Sticky site header.
 *
 * Mobile-first: row 1 = logo + chat CTA, row 2 = language + theme.
 * Desktop (md+): single row. No nav menu (owner 2026-09-26: home is the
 * shop; chat is a page you go to). All tap targets ≥ 44 px.
 */
export async function SiteHeader() {
  const t = await getTranslations();

  const chatCta = (
    <Link
      href="/chat"
      data-chat-cta=""
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <MessageCircle className="size-4.5" aria-hidden="true" />
      {t("Nav.hello")}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Row 1 */}
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <MamaMark className="size-9" />
            <span className="font-display text-xl font-extrabold tracking-tight">
              mamacrochet
            </span>
          </Link>

          {/* Desktop controls */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
            <AuthBadge />
            {chatCta}
          </div>

          {/* Mobile row 1: sign-in state + chat CTA */}
          <div className="flex items-center gap-2 md:hidden">
            <AuthBadge />
            {chatCta}
          </div>
        </div>

        {/* Row 2 — mobile only: language + theme (44 px tap targets) */}
        <div className="flex items-center justify-between gap-3 pb-3 md:hidden">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
