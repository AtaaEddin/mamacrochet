import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ImageGallery, type GalleryImage } from "@/components/product-image-gallery";
import { toWorkDisplay, fileSrc } from "@/lib/catalog/display";
import {
  productTitle,
  productDescription,
  categoryName,
} from "@/lib/catalog/localize";
import { serverFetchProduct } from "@/lib/catalog/server";
import type { AppLocale } from "@/i18n/routing";

interface WorkDetailProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * Product detail (plan 04) — SSR: one product by id. Not found / hidden /
 * deleted → `notFound()` (renders the locale 404). Gallery is a client
 * island; everything else is server-rendered.
 */
export default async function WorkDetailPage({ params }: WorkDetailProps) {
  const [{ id }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations("Works"),
  ]);
  const appLocale: AppLocale = locale as AppLocale;

  const product = await serverFetchProduct(id);
  if (!product) notFound();

  const title = productTitle(product, appLocale);
  const description = productDescription(product, appLocale);
  const catName = categoryName(product.category, appLocale);
  const price = new Intl.NumberFormat(appLocale, {
    style: "currency",
    currency: "USD",
  }).format(Number(product.price));

  const images: GalleryImage[] = product.images.map((img) => ({
    id: img.id,
    url: fileSrc(img.url) ?? img.url,
    thumbUrl: fileSrc(img.thumbUrl) ?? img.thumbUrl,
  }));

  // A real product (never the sample fallback), so `art` stays `null`.
  const work = toWorkDisplay(product, title);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link
        href="/works"
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t("backToWorks")}
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-8">
        <div>
          <ImageGallery images={images} title={title} art={null} />
        </div>

        <div className="flex flex-col">
          {catName && (
            <span className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {catName}
            </span>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="font-display text-2xl font-extrabold">{price}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <span
                className={
                  "size-2 rounded-full " +
                  (work.inStock ? "bg-brand-olive" : "bg-brand-gold")
                }
                aria-hidden="true"
              />
              {work.inStock ? t("stock.in") : t("stock.madeToOrder")}
            </span>
          </div>

          {description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {description}
            </p>
          )}

          <div className="mt-6">
            <Link
              href={`/chat?work=${work.id}`}
              className={buttonVariants({
                variant: "default",
                className:
                  "h-12 w-full max-w-sm items-center justify-center gap-2 rounded-full text-base font-bold",
              })}
            >
              <MessageCircle className="size-5" aria-hidden="true" />
              {work.inStock ? t("cta.order") : t("cta.requestCustom")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
