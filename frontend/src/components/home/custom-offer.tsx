import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * "Didn't find your liking?" — the custom-offer block (brand v2).
 * Closes the home page and the works list page: chat is where custom
 * pieces start.
 */
export async function CustomOffer() {
  const t = await getTranslations("CustomOffer");

  return (
    <section aria-labelledby="custom-offer-title" className="py-10 sm:py-14">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center gap-5 rounded-[2.5rem] border border-border/70 bg-card px-6 py-9 text-center shadow-sm sm:flex-row sm:gap-8 sm:text-start">
          {/* Brand character is a static image (owner 2026-10-03): the
              face + body keep their colors in both themes. */}
          <Image
            src="/brand/hanadi-bust.svg"
            alt=""
            width={128}
            height={128}
            aria-hidden={true}
            className="h-auto w-32 shrink-0 sm:w-40"
          />
          <div className="min-w-0">
            <h2
              id="custom-offer-title"
              className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
            >
              {t("title")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("body")}
            </p>
            <Link href="/chat" className="mt-5 inline-block">
              <Button size="lg" className="h-11 rounded-full px-6">
                {t("cta")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
