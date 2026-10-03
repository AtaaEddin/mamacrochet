import { CustomOffer } from "@/components/home/custom-offer";
import { WorksBrowse } from "@/components/home/works-browse";
import { serverFetchCategories } from "@/lib/catalog/server";
import { categoryName } from "@/lib/catalog/localize";
import { getLocale, getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";

interface WorksPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

/**
 * Works list page (plan 04): full catalog + category filter + title search +
 * "show more" pagination. A thin server wrapper — it resolves the URL state
 * (category/q) and the category chips (SSR), then hands off to the client
 * list which owns the interactive fetching.
 */
export default async function WorksPage({ searchParams }: WorksPageProps) {
  const [params, locale, t] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("Works"),
  ]);
  const appLocale: AppLocale = locale as AppLocale;

  const categories = await serverFetchCategories();
  const chips =
    categories?.length
      ? categories.map((c) => ({
          id: c.id,
          label: categoryName(c, appLocale) ?? "—",
        }))
      : [];

  const initialCategory = params.category ?? null;
  const initialSearch = params.q?.trim() ? params.q.trim() : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <WorksBrowse
        initialCategory={initialCategory}
        initialSearch={initialSearch}
        categories={chips}
        allLabel={t("categories.all")}
      />
      <CustomOffer />
    </div>
  );
}
