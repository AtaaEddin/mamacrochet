"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, PackageOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductDto } from "@/lib/catalog/localize";
import { productTitle } from "@/lib/catalog/localize";
import { GuestOrderForm } from "./guest-order-form";
import { OrderSuccessDialog } from "./order-success-dialog";

/**
 * Order actions on a product message in the chat (plan 05): the in-chat
 * creation flow. In-stock work → "order this" (kind=catalog); made-to-order
 * work → "request this as custom" (kind=custom, the work as reference,
 * spec prefilled). Both open the guest-capable form; on success the
 * confirmation dialog sets the expectation (staff reach out in chat,
 * confirmation at ready_for_payment — plans 06/07).
 *
 * Rendered under a guest-side product bubble only.
 */
export function OrderProductActions({
  product,
  locale,
}: {
  product: ProductDto;
  locale: string;
}) {
  const t = useTranslations("Orders.create");
  const [open, setOpen] = useState<null | "catalog" | "custom">(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const title = productTitle(product, locale);

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.inStock ? (
          <>
            <Button
              size="sm"
              onClick={() => setOpen("catalog")}
              className="gap-1.5"
            >
              <PackageOpen className="size-3.5" aria-hidden="true" />
              {t("orderThis")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen("custom")}
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t("customLikeThis")}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setOpen("custom")}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("requestCustom")}
          </Button>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => (o ? undefined : setOpen(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {open === "catalog"
                ? t("dialogTitleCatalog")
                : t("dialogTitleCustom")}
              <span className="mt-1 block text-sm font-medium text-muted-foreground">
                {title}
              </span>
            </DialogTitle>
            <DialogDescription>
              {open === "catalog" ? t("dialogBodyCatalog") : t("dialogBodyCustom")}
            </DialogDescription>
          </DialogHeader>
          {open !== null ? (
            <GuestOrderForm
              kind={open}
              productId={product.id}
              productName={title}
              defaultSpec={open === "custom" ? t("specPrefillChat", { name: title }) : null}
              onSuccess={() => {
                setOpen(null);
                setSuccessOpen(true);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <OrderSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        onDone={() => setSuccessOpen(false)}
      />
    </>
  );
}

/**
 * Order-creation success note — the "it's received" state (plan 05).
 * Kept here for reuse outside the dialog (e.g. inline confirmation).
 */
export function OrderSuccessNote() {
  const t = useTranslations("Orders.create");
  return (
    <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
      <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t("successInline")}
    </p>
  );
}
