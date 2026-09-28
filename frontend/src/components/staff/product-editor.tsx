"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CategoryDto, ProductDto } from "@/lib/staff/api";
import {
  createProduct,
  deleteProduct,
  fetchStaffProduct,
  updateProduct,
} from "@/lib/staff/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import { ImageManager } from "./image-manager";

const LANGS = ["en", "ar", "tr"] as const;
type Lang = (typeof LANGS)[number];
const NONE = "__none__";

const TITLE_KEY: Record<Lang, string> = {
  en: "titleEn",
  ar: "titleAr",
  tr: "titleTr",
};
const DESC_KEY: Record<Lang, string> = {
  en: "descEn",
  ar: "descAr",
  tr: "descTr",
};

interface FormState {
  titles: Record<Lang, string>;
  descs: Record<Lang, string>;
  categoryId: string;
  price: string;
  stock: string;
  isListed: boolean;
}

const EMPTY: FormState = {
  titles: { en: "", ar: "", tr: "" },
  descs: { en: "", ar: "", tr: "" },
  categoryId: "",
  price: "",
  stock: "0",
  isListed: true,
};

function fromProduct(p: ProductDto): FormState {
  const pick = (lang: Lang) => p.localizations.find((l) => l.language === lang);
  return {
    titles: {
      en: pick("en")?.title ?? "",
      ar: pick("ar")?.title ?? "",
      tr: pick("tr")?.title ?? "",
    },
    descs: {
      en: pick("en")?.description ?? "",
      ar: pick("ar")?.description ?? "",
      tr: pick("tr")?.description ?? "",
    },
    categoryId: p.category?.id ?? "",
    price: String(p.price),
    stock: String(p.stockUnits),
    isListed: p.isListed,
  };
}

/**
 * Create/edit a product (plan 04). The parent remounts it per product
 * (`key`), so state is fresh: an existing id loads its data, a null id starts
 * an empty "new" form. After a create, `product` is set (gaining an id) and
 * the image manager appears — the editor stays open so photos can be added.
 */
export function ProductEditor({
  productId,
  categories,
  isAdmin,
  onCancel,
}: {
  productId: string | null;
  categories: CategoryDto[];
  isAdmin: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("Staff");

  const [product, setProduct] = useState<ProductDto | null>(null);
  const [loading, setLoading] = useState(productId !== null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load an existing product (fresh mount per id).
  useEffect(() => {
    if (productId === null) return;
    let alive = true;
    fetchStaffProduct(productId).then((p) => {
      if (!alive) return;
      setLoading(false);
      if (p) {
        setProduct(p);
        setForm(fromProduct(p));
      }
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <YarnLoader className="size-10" />
      </div>
    );
  }

  if (productId !== null && product === null) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTitle>{t("productNotFound")}</AlertTitle>
      </Alert>
    );
  }

  const isNew = product === null;

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }
  function patchTitle(lang: Lang, v: string) {
    setForm((prev) => ({ ...prev, titles: { ...prev.titles, [lang]: v } }));
  }
  function patchDesc(lang: Lang, v: string) {
    setForm((prev) => ({ ...prev, descs: { ...prev.descs, [lang]: v } }));
  }

  async function save() {
    if (saving) return;
    setError(null);

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError(t("saveError"));
      return;
    }

    const localizations = [
      { language: "en", title: form.titles.en, description: form.descs.en },
    ];
    if (form.titles.ar.trim())
      localizations.push({
        language: "ar",
        title: form.titles.ar,
        description: form.descs.ar,
      });
    if (form.titles.tr.trim())
      localizations.push({
        language: "tr",
        title: form.titles.tr,
        description: form.descs.tr,
      });

    setSaving(true);
    try {
      if (isNew) {
        const res = await createProduct({
          localizations,
          categoryId: form.categoryId || null,
          price,
          currency: "USD",
          stockUnits: stock,
        });
        if (!res.ok) {
          setError(t("saveError"));
          return;
        }
        setProduct(res.product);
      } else if (product) {
        const res = await updateProduct(product.id, {
          localizations,
          categoryId: form.categoryId || null,
          price,
          currency: "USD",
          stockUnits: stock,
          isListed: form.isListed,
        });
        if (!res.ok) {
          setError(t("saveError"));
          return;
        }
        setProduct(res.product);
      }
    } finally {
      setSaving(false);
    }
  }

  const enEmpty = form.titles.en.trim() === "";

  async function doDelete() {
    if (!product || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteProduct(product.id);
    setDeleting(false);
    if (res.ok) {
      onCancel();
    } else {
      setDeleteError(t("deleteError"));
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          {isNew ? t("newProductTitle") : t("editProduct")}
        </h2>
        <div className="flex gap-2">
          {!isNew && isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              {t("delete")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("backToProducts")}
          </Button>
        </div>
      </div>

      <form
        className="mt-4 grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <p className="mb-2 text-sm font-bold text-muted-foreground">
            {t("localizations")}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {LANGS.map((lang) => (
              <div key={lang} className="grid gap-2">
                <Label htmlFor={`title-${lang}`}>{t(TITLE_KEY[lang])}</Label>
                <Input
                  id={`title-${lang}`}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={form.titles[lang]}
                  placeholder={t("titlePlaceholder")}
                  onChange={(e) => patchTitle(lang, e.currentTarget.value)}
                />
                <Label htmlFor={`desc-${lang}`}>{t(DESC_KEY[lang])}</Label>
                <Textarea
                  id={`desc-${lang}`}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  rows={3}
                  value={form.descs[lang]}
                  placeholder={t("descPlaceholder")}
                  onChange={(e) => patchDesc(lang, e.currentTarget.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t("category")}</Label>
            <Select
              value={form.categoryId === "" ? NONE : form.categoryId}
              onValueChange={(v) => patch({ categoryId: v === NONE ? "" : v ?? "" })}
            >
              <SelectTrigger aria-label={t("category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("uncategorized")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {catName(c, "en")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="price">{t("price")}</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => patch({ price: e.currentTarget.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="stock">{t("stock")}</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => patch({ stock: e.currentTarget.value })}
            />
          </div>

          {!isNew ? (
            <div className="flex items-center gap-3 sm:pt-6">
              <Switch
                id="is-listed"
                checked={form.isListed}
                onCheckedChange={(c) => patch({ isListed: c === true })}
              />
              <Label htmlFor="is-listed">{t("listedSwitch")}</Label>
            </div>
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || enEmpty}>
            {saving ? t("saving") : t("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          {enEmpty ? (
            <span className="text-sm text-muted-foreground">{t("titleRequired")}</span>
          ) : null}
        </div>
      </form>

      {product ? (
        <ImageManager
          productId={product.id}
          images={product.images}
          onImagesChange={(images) =>
            setProduct((prev) => (prev ? { ...prev, images } : prev))
          }
        />
      ) : null}

      {confirmDelete && product ? (
        <AlertDialog open onOpenChange={(open) => !open && setConfirmDelete(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirmDeleteBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {deleteError ? (
                <p className="text-sm text-destructive">{deleteError}</p>
              ) : null}
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void doDelete()}
                disabled={deleting}
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

function catName(c: CategoryDto, locale: string): string {
  const row =
    c.names.find((n) => n.language === locale) ??
    c.names.find((n) => n.language === "en") ??
    c.names[0];
  return row?.name ?? "—";
}
