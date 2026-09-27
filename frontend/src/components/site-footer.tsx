import { getTranslations } from "next-intl/server";
import { MamaMark } from "@/components/illustrations/mama-mark";
import { ApiStatus } from "@/components/api-status";

export async function SiteFooter() {
  const t = await getTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-card/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:px-6">
        <div className="flex items-center gap-2.5">
          <MamaMark className="size-8" />
          <span className="font-display text-lg font-bold">{t("Metadata.name")}</span>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("Footer.tagline")}
        </p>
        <p className="text-xs text-muted-foreground/70">
          © {year} {t("Metadata.name")}. {t("Footer.rights")}
        </p>
        <ApiStatus />
      </div>
    </footer>
  );
}
