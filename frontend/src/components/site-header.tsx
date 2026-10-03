import { Link } from "@/i18n/navigation";
import { AuthBadge } from "@/components/auth-badge";
import { ChatCtaLink } from "@/components/chat-cta-link";
import { HanadiMark } from "@/components/illustrations/hanadi-mark";
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
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Row 1 (gap-2: AR mobile needs ~20px of headroom — logo +
            sign-in + chat CTA must fit 358px at a 390px viewport) */}
        <div className="flex h-16 items-center justify-between gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <HanadiMark className="size-9" />
            <span className="font-display text-xl font-extrabold tracking-tight">
              hanadicrochet
            </span>
          </Link>

          {/* Desktop controls */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
            <AuthBadge />
            <ChatCtaLink />
          </div>

          {/* Mobile row 1: sign-in state + chat CTA */}
          <div className="flex items-center gap-2 md:hidden">
            <AuthBadge />
            <ChatCtaLink />
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
