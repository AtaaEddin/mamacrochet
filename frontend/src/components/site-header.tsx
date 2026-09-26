import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { OpenChatButton } from "@/components/open-chat-button";
import { BunnyMark } from "@/components/illustrations/bunny-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Sticky site header.
 *
 * Mobile-first: row 1 = logo + chat CTA, row 2 = language + theme.
 * Desktop (md+): single row — logo, anchor nav, controls.
 * All tap targets ≥ 44 px (ui-design hard rule).
 */
export async function SiteHeader() {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Row 1 */}
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <BunnyMark className="size-9" />
            <span className="font-display text-xl font-extrabold tracking-tight">
              mamacrochet
            </span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <a
              href="#how-it-works"
              className="rounded-full px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("Nav.howItWorks")}
            </a>
            <a
              href="#shop"
              className="rounded-full px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("Nav.shop")}
            </a>
          </nav>

          {/* Desktop controls */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
            <OpenChatButton className="rounded-full" />
          </div>

          {/* Mobile chat CTA (row 1) */}
          <OpenChatButton className="rounded-full md:hidden" />
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
