"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { ORDER_FLOW, statusFlowIndex } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/**
 * The customer-facing status board stepper (plan 05): the happy path
 * open → … → closed as a soft step strip. Done steps are filled, the
 * current one is ringed, the rest are muted. A cancelled order renders
 * the terminal note instead of the strip.
 *
 * Mobile-first: labels sit under each dot (tiny on phones), the strip
 * scrolls horizontally if the labels grow (ar).
 */
export function OrderStatusSteps({ status }: { status: string }) {
  const t = useTranslations("Orders");

  if (status === "cancelled") {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive"
      >
        <X className="size-4 shrink-0" aria-hidden="true" />
        <span>{t("cancelledBanner")}</span>
      </div>
    );
  }

  const currentIndex = statusFlowIndex(status);

  return (
    <ol
      aria-label={t("boardTitle")}
      className="-mx-1 flex items-start overflow-x-auto px-1 pb-1"
    >
      {ORDER_FLOW.map((step, i) => {
        const done = currentIndex >= 0 && i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-0 flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors sm:size-8",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary bg-background text-primary ring-4 ring-ring/40"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      current ? "bg-primary" : "bg-muted-foreground/50",
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "mt-1.5 max-w-full truncate px-0.5 text-center text-[10px] font-bold leading-tight sm:text-xs",
                  current
                    ? "text-foreground"
                    : done
                      ? "text-foreground/80"
                      : "text-muted-foreground",
                )}
              >
                {t(`steps.${step}`)}
              </span>
            </div>
            {i < ORDER_FLOW.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 mt-3.5 h-0.5 min-w-3 flex-1 rounded-full sm:mt-4",
                  currentIndex >= 0 && i < currentIndex
                    ? "bg-primary"
                    : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
