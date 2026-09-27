"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { WorkCard } from "@/components/work-card";
import {
  WorkCategoryChips,
  type CategoryFilter,
} from "@/components/work-category-chips";
import { SAMPLE_WORKS } from "@/lib/sample-works";

const INITIAL_COUNT = 3;

/**
 * Featured works (home, brand v2) — the works made so far: most-ordered /
 * high-rated only (never the full catalog), a simple category filter on
 * top and a "see all" jump to the works list page. Each card goes straight
 * to the chat with that work attached (chat-first).
 *
 * Sample data until plan 04 ships real products + the "most loved" query.
 */
export function FeaturedWorks() {
  const t = useTranslations("Works");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const filtered = SAMPLE_WORKS.filter(
    (w) => category === "all" || w.category === category,
  );
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_COUNT);

  return (
    <section
      id="works"
      className="scroll-mt-36 pt-8 md:scroll-mt-24"
      aria-labelledby="works-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1
            id="works-title"
            className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/works"
          className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("seeAll")}
          <ArrowUpRight
            className="size-4 rtl:-scale-x-100"
            aria-hidden="true"
          />
        </Link>
      </div>

      <WorkCategoryChips
        value={category}
        onChange={(c) => {
          setCategory(c);
          setExpanded(false);
        }}
        className="mt-4"
      />

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {visible.map((w) => (
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

      {!expanded && filtered.length > INITIAL_COUNT && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            className="h-11 rounded-full px-6"
            onClick={() => setExpanded(true)}
          >
            {t("showMore")}
          </Button>
        </div>
      )}
    </section>
  );
}
