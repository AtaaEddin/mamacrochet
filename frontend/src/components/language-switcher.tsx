"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Manual language switcher. Uses next-intl navigation to replace the locale
 * segment (URL prefix + cookie via the intl proxy persist the choice).
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Locale");

  function switchTo(next: string) {
    if (next === locale) return;
    router.replace(pathname, { locale: next as (typeof routing.locales)[number] });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex items-center gap-1 rounded-full bg-muted p-1"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          lang={l}
          onClick={() => switchTo(l)}
          className={cn(
            "flex h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-xs font-bold transition-colors",
            l === locale
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
