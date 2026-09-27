import { Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { WorkArt } from "@/components/illustrations/work-art";
import type { SampleWork } from "@/lib/sample-works";
import { cn } from "@/lib/utils";

/**
 * Presentational work card (brand v2). Wrap it in a <Link> (go to chat
 * with this work) or a <button> (rail: add to chat / drag) per context.
 */
export function WorkCard({
  work,
  compact = false,
  className,
}: {
  work: SampleWork;
  /** Compact = rail size (row-ish card in the chat product rail). */
  compact?: boolean;
  className?: string;
}) {
  const tWorks = useTranslations("Works");
  const locale = useLocale();
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });

  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-3xl border border-border/70 bg-card text-start shadow-sm",
        compact ? "h-auto flex-row items-center gap-3 p-2.5" : "h-full flex-col",
        className,
      )}
    >
      <span
        className={cn(
          "block shrink-0 bg-muted/50",
          compact ? "size-14 rounded-2xl p-1.5" : "aspect-square w-full p-4",
        )}
      >
        <WorkArt kind={work.art} className="h-full w-full" />
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col", compact ? "py-0.5" : "p-3.5 sm:p-4")}>
        <span className={cn("font-bold leading-snug", compact ? "truncate text-sm" : "text-sm")}>
          {tWorks(`items.${work.nameKey}`)}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Star className="size-3.5 fill-brand-gold text-brand-gold" aria-hidden="true" />
          {work.rating.toFixed(1)} · {tWorks("orders", { count: work.orders })}
        </span>
        <span
          className={cn(
            "font-display font-extrabold",
            compact ? "text-sm" : "mt-3 text-base",
          )}
        >
          {fmt.format(work.priceUsd)}
        </span>
      </span>
    </div>
  );
}
