import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Thin intro strip (brand v2): one line about how ordering works,
 * CTA straight to the chat page. The works list follows immediately.
 */
export async function IntroBar() {
  const t = await getTranslations("IntroBar");

  return (
    <div className="border-b border-border/60 bg-card/80">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-2 px-4 py-2 text-center sm:px-6 lg:flex-nowrap lg:justify-between lg:text-start">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{t("title")}.</span>{" "}
          {t("body")}
        </p>
        <Link
          href="/chat"
          className="-my-2 inline-flex items-center rounded-md px-3 py-2.5 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("cta")}
        </Link>
      </div>
    </div>
  );
}
