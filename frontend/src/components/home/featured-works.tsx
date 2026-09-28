import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product-card";
import { toWorkDisplay, type WorkDisplay } from "@/lib/catalog/display";
import { productTitle, categoryName } from "@/lib/catalog/localize";
import { serverFetchCategories, serverFetchProducts } from "@/lib/catalog/server";
import { SAMPLE_WORKS } from "@/lib/sample-works";
import type { AppLocale } from "@/i18n/routing";

const FEATURED_COUNT = 6;

/**
 * Featured works (home, plan 04) — SSR: the most recent listed pieces.
 * Server component fetches the API directly (no browser round-trip); on any
 * failure it degrades to the sample works so the home never renders empty.
 *
 * Category chips are links into the works list (the list owns filtering).
 */
export async function FeaturedWorks() {
  const [t, locale] = await Promise.all([
    getTranslations("Works"),
    getLocale(),
  ]);
  const appLocale: AppLocale = locale as AppLocale;

  const [products, categories] = await Promise.all([
    serverFetchProducts(FEATURED_COUNT),
    serverFetchCategories(),
  ]);

  let works: WorkDisplay[];
  if (products && products.items.length > 0) {
    works = products.items.map((p) =>
      toWorkDisplay(p, productTitle(p, appLocale)),
    );
  } else {
    works = SAMPLE_WORKS.map((w) => ({
      id: w.id,
      title: t(`items.${w.nameKey}`),
      priceUsd: w.priceUsd,
      imageSrc: null,
      art: w.art,
      inStock: true,
      categoryId: null,
    }));
  }

  const chipCategories: { id: string; label: string }[] =
    categories?.length
      ? categories.map((c) => ({ id: c.id, label: categoryName(c, appLocale) ?? "—" }))
      : [];

  return (
    <section id="works" className="scroll-mt-36 pt-8 md:scroll-mt-24" aria-labelledby="works-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 id="works-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/works"
          className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("seeAll")}
          <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </div>

      {chipCategories.length > 0 && (
        <HomeCategoryChips
          categories={chipCategories}
          allLabel={t("categories.all")}
          navLabel={t("navWorksByCategory")}
        />
      )}

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {works.map((w) => (
          <li key={w.id} className="h-full">
            <Link
              href={`/works/${w.id}`}
              className="group flex h-full flex-col transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <ProductCard work={w} locale={appLocale} className="transition-shadow group-hover:shadow-md" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Home category chips — plain links (no client state on the home). The works
 * list page owns interactive filtering; here we just jump into it.
 */
function HomeCategoryChips({
  categories,
  allLabel,
  navLabel,
}: {
  categories: { id: string; label: string }[];
  allLabel: string;
  navLabel: string;
}) {
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label={navLabel}>
      <ChipLink href="/works" active={false}>
        {allLabel}
      </ChipLink>
      {categories.map((c) => (
        <ChipLink key={c.id} href={`/works?category=${c.id}`} active={false}>
          {c.label}
        </ChipLink>
      ))}
    </nav>
  );
}

function ChipLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/70 bg-card text-foreground hover:bg-muted/50")
      }
    >
      {children}
    </Link>
  );
}
