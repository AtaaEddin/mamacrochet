import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { OpenChatButton } from "@/components/open-chat-button";
import { MascotBunny } from "@/components/illustrations/mascot-bunny";
import { YarnBall } from "@/components/illustrations/yarn-ball";

export async function Hero() {
  const t = await getTranslations("Hero");

  return (
    <section className="relative overflow-hidden">
      {/* Ambient pastel wash (cheap to render, no video/3D — plan 11) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 start-[-10%] size-72 rounded-full bg-brand-lavender/45 blur-3xl" />
        <div className="absolute top-1/3 end-[-8%] size-80 rounded-full bg-brand-rose/35 blur-3xl" />
        <div className="absolute bottom-0 start-1/3 size-64 rounded-full bg-brand-butter/40 blur-3xl" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-10 md:pb-24 md:pt-20">
        <div className="max-w-xl animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground shadow-sm">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {t("badge")}
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl md:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <OpenChatButton className="h-12 rounded-full px-6 text-base" />
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center rounded-full border border-border bg-card px-6 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("secondaryCta")}
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm animate-fade-in md:max-w-none">
          <div className="rounded-[2.5rem] border border-border/60 bg-linear-to-b from-card to-muted/50 p-6 shadow-sm sm:p-8">
            <MascotBunny className="h-auto w-full animate-float motion-reduce:animate-none" />
          </div>
          <YarnBall className="absolute -top-5 -start-3 size-12 animate-float [animation-delay:1.4s] motion-reduce:animate-none sm:size-14" />
          <YarnBall className="absolute -bottom-4 -end-3 size-10 animate-float [animation-delay:2.6s] opacity-80 motion-reduce:animate-none sm:size-12" />
        </div>
      </div>
    </section>
  );
}
