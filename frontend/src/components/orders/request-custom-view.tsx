"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { GuestOrderForm } from "./guest-order-form";
import { OrderSuccessDialog } from "./order-success-dialog";
import { productTitle } from "@/lib/catalog/localize";
import { toWorkDisplay } from "@/lib/catalog/display";
import type { ProductDto } from "@/lib/catalog/localize";

/**
 * "Request a custom piece" (plan 05): spec + sample images + guest contact.
 * A listed work can be picked as a reference ("like this one, but…"); the
 * picker is optional and degrades to a pure description when the catalog
 * is empty. On success the dialog points to /orders (sign in) and /chat.
 */
export function RequestCustomView({ products }: { products: ProductDto[] }) {
  const t = useTranslations("Orders.custom");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const display = useMemo(
    () =>
      products.map((p) => ({
        product: p,
        work: toWorkDisplay(p, productTitle(p, locale)),
      })),
    [products, locale],
  );

  const selected = display.find((d) => d.product.id === selectedId) ?? null;
  const defaultSpec = selected
    ? t("specPrefill", { name: selected.work.title })
    : null;

  return (
    <div className="py-6 sm:py-8">
      <header className="mb-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-gold/15 px-3 py-1 text-xs font-bold text-brand-gold">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("badge")}
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("intro")}
        </p>
      </header>

      {/* Reference work picker (optional) */}
      {display.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-display text-base font-bold sm:text-lg">
            {t("pickerTitle")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {t("pickerBody")}
          </p>
          <div className="mt-3 grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pe-1 sm:grid-cols-3">
            {display.map(({ product, work }) => {
              const isSelected = selectedId === product.id;
              return (
                <button
                  key={product.id}
                  onClick={() => setSelectedId(isSelected ? null : product.id)}
                  aria-pressed={isSelected}
                  className={`rounded-3xl text-start transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    isSelected ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
                  }`}
                >
                  <ProductCard
                    work={work}
                    locale={locale}
                    className={
                      isSelected
                        ? "border-primary/60 bg-primary/5"
                        : "hover:shadow-md"
                    }
                  />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* The form */}
      <GuestOrderForm
        kind="custom"
        productId={selected?.product.id ?? null}
        productName={selected?.work.title ?? null}
        defaultSpec={defaultSpec}
        onSuccess={() => setSuccessOpen(true)}
      />

      <OrderSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        onDone={() => setSuccessOpen(false)}
      />
    </div>
  );
}
