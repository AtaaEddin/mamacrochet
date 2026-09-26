import { getTranslations } from "next-intl/server";

const STEPS = [1, 2, 3] as const;

export async function HowItWorks() {
  const t = await getTranslations("HowItWorks");

  return (
    <section
      id="how-it-works"
      className="scroll-mt-36 md:scroll-mt-24 bg-muted/40"
      aria-labelledby="how-it-works-title"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2
          id="how-it-works-title"
          className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {t("title")}
        </h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step}
              className="relative rounded-3xl border border-border/60 bg-card p-6 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground"
              >
                {step}
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">
                {t(`step${step}Title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`step${step}Body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
