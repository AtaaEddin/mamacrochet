import { getTranslations } from "next-intl/server";
import { Eye, Lightbulb, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

const CARDS = [
  { key: "custom", icon: Scissors, tint: "bg-brand-butter" },
  { key: "ideas", icon: Lightbulb, tint: "bg-brand-lavender" },
  { key: "live", icon: Eye, tint: "bg-brand-sage" },
] as const;

export async function ValueProps() {
  const t = await getTranslations("Values");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {CARDS.map(({ key, icon: Icon, tint }) => (
          <div
            key={key}
            className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none"
          >
            <span
              className={cn(
                "flex size-11 items-center justify-center rounded-2xl",
                tint,
              )}
            >
              <Icon className="size-5 text-foreground" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold">
              {t(`${key}Title`)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`${key}Body`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
