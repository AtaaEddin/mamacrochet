"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { WorkCard } from "@/components/work-card";
import {
  WorkCategoryChips,
  type CategoryFilter,
} from "@/components/work-category-chips";
import { SAMPLE_WORKS } from "@/lib/sample-works";

/**
 * Works list page (brand v2) — the full (sample) catalog with the same
 * simple category filter. A separate page because categories will multiply
 * (owner directive). Cards go to the chat with the work attached.
 * Pagination ("show more") arrives with real data (plan 04).
 */
export function WorksBrowse() {
  const t = useTranslations("Works");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filtered = SAMPLE_WORKS.filter(
    (w) => category === "all" || w.category === category,
  );

  return (
    <section className="pt-8" aria-labelledby="works-all-title">
      <h1
        id="works-all-title"
        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {t("allTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("allSubtitle")}</p>

      <WorkCategoryChips value={category} onChange={setCategory} className="mt-4" />

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((w) => (
          <li key={w.id} className="h-full">
            <Link
              href={`/chat?work=${w.id}`}
              title={t("ask")}
              className="group flex h-full flex-col transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <WorkCard work={w} className="h-full transition-shadow group-hover:shadow-md" />
              <span className="flex items-center justify-end gap-1 px-1 pt-2 text-xs font-bold text-primary">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {t("ask")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
