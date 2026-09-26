import { getTranslations } from "next-intl/server";
import { OpenChatButton } from "@/components/open-chat-button";
import { EmptyShelf } from "@/components/illustrations/empty-shelf";

export async function ShopTeaser() {
  const t = await getTranslations("Shop");

  return (
    <section
      id="shop"
      className="mx-auto w-full max-w-6xl scroll-mt-36 md:scroll-mt-24 px-4 py-16 sm:px-6"
      aria-labelledby="shop-title"
    >
      <div className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-card p-8 text-center shadow-sm sm:p-12">
        <EmptyShelf className="mx-auto h-auto w-52 sm:w-60" />
        <h2
          id="shop-title"
          className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {t("comingSoon")}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("body")}
        </p>
        <div className="mt-7 flex justify-center">
          <OpenChatButton label={t("cta")} className="h-11 rounded-full px-5" size="default" />
        </div>
      </div>
    </section>
  );
}
