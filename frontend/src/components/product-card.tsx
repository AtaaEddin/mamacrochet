import { WorkArt } from "@/components/illustrations/work-art";
import type { WorkDisplay } from "@/lib/catalog/display";
import { cn } from "@/lib/utils";

/**
 * Presentational product card (plan 04) — renders a `WorkDisplay` whether it
 * came from the API (real photo) or the sample data (illustration).
 *
 * Server + client safe: `locale` is passed in (server components can't use
 * `useLocale`), and there are no hooks, so the same card works in the SSR
 * home/works pages and in client islands.
 */
export function ProductCard({
  work,
  locale,
  className,
}: {
  work: WorkDisplay;
  locale: string;
  className?: string;
}) {
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(work.priceUsd);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card text-start shadow-sm",
        className,
      )}
    >
      <span className="block aspect-square w-full overflow-hidden bg-muted/50">
        {work.imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- API file host, lazy
          <img
            src={work.imageSrc}
            alt={work.title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : work.art ? (
          <span className="block size-full p-4">
            <WorkArt kind={work.art} className="size-full" />
          </span>
        ) : (
          <span
            className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            ·
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col p-3.5 sm:p-4">
        <span className="text-sm font-bold leading-snug [display:flow-root]">
          {work.title}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">
            {price}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <span
              className={cn(
                "size-1.5 rounded-full",
                work.inStock ? "bg-brand-olive" : "bg-brand-gold",
              )}
              aria-hidden="true"
            />
            {work.inStock ? "In stock" : "Made to order"}
          </span>
        </span>
      </span>
    </div>
  );
}
