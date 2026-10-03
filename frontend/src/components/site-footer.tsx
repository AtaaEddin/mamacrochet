import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { ApiStatus } from "@/components/api-status";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-card/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:px-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/hanadi-mark.svg"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="size-8"
          />
          <span className="font-display text-lg font-bold">{t("Metadata.name")}</span>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("Footer.tagline")}
        </p>
        <nav
          aria-label={t("Footer.navLabel")}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Link
            href="/login"
            className="rounded-sm px-1 text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("Auth.signIn")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/register"
            className="rounded-sm px-1 text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("Auth.createAccount")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/join"
            className="rounded-sm px-1 text-foreground/80 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("Footer.join")}
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground/70">
          © {year} {t("Metadata.name")}. {t("Footer.rights")}
        </p>
        <ApiStatus />
      </div>
    </footer>
  );
}
