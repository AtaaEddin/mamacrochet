"use client";

import { useTranslations } from "next-intl";
import type { WorkCategory } from "@/lib/sample-works";
import { cn } from "@/lib/utils";

export type CategoryFilter = WorkCategory | "all";

/**
 * Simple category filter chips (home + works list + chat product rail).
 * Categories grow later — plan 04 (many categories, owner directive).
 */
export function WorkCategoryChips({
  value,
  onChange,
  className,
}: {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
  className?: string;
}) {
  const t = useTranslations("Works");
  const options: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: t("categories.all") },
    { value: "bags", label: t("categories.bags") },
    { value: "dolls", label: t("categories.dolls") },
    { value: "small", label: t("categories.small") },
  ];

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label={t("categories.all")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            value === o.value
              ? "border-transparent bg-secondary text-secondary-foreground"
              : "border-border/70 bg-background text-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
