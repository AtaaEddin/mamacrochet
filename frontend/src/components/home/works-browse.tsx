"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { toWorkDisplay, type WorkDisplay } from "@/lib/catalog/display";
import { productTitle } from "@/lib/catalog/localize";
import { fetchCatalogProducts } from "@/lib/catalog/query";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export interface CategoryChip {
  id: string;
  label: string;
}

interface WorksBrowseProps {
  initialCategory: string | null;
  initialSearch: string | null;
  categories: CategoryChip[];
  allLabel: string;
}

/**
 * Works list (plan 04) — client component owning the interactive catalog:
 * category chips, title search (debounced), and "show more" pagination.
 *
 * Fetches the API directly (public, no auth). Initial paint is a skeleton;
 * a failed fetch shows a retry (the home page is the SSR surface).
 */
export function WorksBrowse({
  initialCategory,
  initialSearch,
  categories,
  allLabel,
}: WorksBrowseProps) {
  const t = useTranslations("Works");
  const locale = useLocale();

  const [category, setCategory] = useState<string | null>(initialCategory);
  const [q, setQ] = useState(initialSearch ?? "");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkDisplay[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const reqRef = useRef(0);

  // Every list fetch goes through fetchList — invoked only from event
  // handlers and the debounce timeout (never synchronously from an effect
  // body). Stale responses are dropped via reqRef.
  const fetchList = useCallback(
    (
      search: string,
      catId: string | null,
      targetPage: number,
      append: boolean,
    ) => {
      const req = ++reqRef.current;
      setLoading(true);
      setFailed(false);
      return fetchCatalogProducts({
        categoryId: catId,
        titleSearch: search || null,
        page: targetPage,
        pageSize: PAGE_SIZE,
      }).then((res) => {
        if (req !== reqRef.current) return; // superseded
        setLoading(false);
        if (!res) {
          setFailed(true);
          if (!append) {
            setItems([]);
            setTotal(0);
          }
          return;
        }
        const mapped: WorkDisplay[] = res.items.map((p) =>
          toWorkDisplay(p, productTitle(p, locale)),
        );
        setTotal(Number(res.total));
        setItems((prev) => (append ? [...prev, ...mapped] : mapped));
        setPage(targetPage);
      });
    },
    [locale],
  );

  // Filter (search / category) changed → restart at page 1. Runs inside the
  // debounce timeout, so the effect body sets no state directly.
  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchList(q.trim(), category, 1, false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, category, fetchList]);

  const hasMore = items.length < total;

  return (
    <section className="pt-8" aria-labelledby="works-all-title">
      <h1
        id="works-all-title"
        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {t("allTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("allSubtitle")}</p>

      <label className="relative mt-4 block max-w-sm">
        <span className="sr-only">{t("search")}</span>
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 w-full rounded-full border border-border/70 bg-card ps-9 pe-4 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </label>

      {categories.length > 0 && (
        <CategoryChips
          categories={categories}
          value={category}
          onChange={setCategory}
          allLabel={allLabel}
          className="mt-4"
        />
      )}

      <div className="mt-5">
        {loading && items.length === 0 ? (
          <SkeletonGrid />
        ) : failed && items.length === 0 ? (
          <ErrorState onRetry={() => void fetchList(q.trim(), category, 1, false)} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((w) => (
                <li key={w.id} className="h-full">
                  <Link
                    href={`/works/${w.id}`}
                    className="group flex h-full flex-col transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <ProductCard
                      work={w}
                      locale={locale}
                      className="transition-shadow group-hover:shadow-md"
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {loading && <LoadingBar />}
            {!hasMore && total > PAGE_SIZE && (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                {t("endOfList")}
              </p>
            )}
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  className="h-11 rounded-full px-6"
                  disabled={loading}
                  onClick={() => void fetchList(q.trim(), category, page + 1, true)}
                >
                  {loading ? t("loading") : t("showMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function CategoryChips({
  categories,
  value,
  onChange,
  allLabel,
  className,
}: {
  categories: CategoryChip[];
  value: string | null;
  onChange: (v: string | null) => void;
  allLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Category">
      <Chip active={value === null} onClick={() => onChange(null)}>
        {allLabel}
      </Chip>
      {categories.map((c) => (
        <Chip key={c.id} active={value === c.id} onClick={() => onChange(c.id)}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/70 bg-card text-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-56 animate-pulse rounded-3xl bg-muted/60 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function LoadingBar() {
  return (
    <div className="mt-4 flex justify-center" aria-hidden="true">
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-muted-foreground/40 motion-reduce:animate-none" />
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("Works");
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border/70 py-12 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold">{t("empty.title")}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t("empty.body")}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("Works");
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/70 py-12 text-center">
      <p className="text-sm font-semibold">{t("error.title")}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t("error.body")}</p>
      <Button variant="secondary" className="h-10 rounded-full px-5" onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
