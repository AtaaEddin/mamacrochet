"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CategoryDto, LocalizedNameInput } from "@/lib/staff/api";
import {
  createCategory,
  deleteCategory,
  fetchStaffCategories,
  updateCategory,
} from "@/lib/staff/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const LANGS = ["en", "ar", "tr"] as const;
type Lang = (typeof LANGS)[number];
const NAME_KEY: Record<Lang, string> = {
  en: "catNameEn",
  ar: "catNameAr",
  tr: "catNameTr",
};

interface CatForm {
  names: Record<Lang, string>;
  sortOrder: string;
  isListed: boolean;
}

const EMPTY_CAT: CatForm = {
  names: { en: "", ar: "", tr: "" },
  sortOrder: "0",
  isListed: true,
};

function fromCategory(c: CategoryDto): CatForm {
  const pick = (lang: Lang) => c.names.find((n) => n.language === lang);
  return {
    names: {
      en: pick("en")?.name ?? "",
      ar: pick("ar")?.name ?? "",
      tr: pick("tr")?.name ?? "",
    },
    sortOrder: String(c.sortOrder),
    isListed: c.isListed,
  };
}

function buildNames(names: Record<Lang, string>): LocalizedNameInput[] {
  const out: LocalizedNameInput[] = [];
  for (const lang of LANGS) {
    const v = names[lang].trim();
    if (v) out.push({ language: lang, name: v });
  }
  return out;
}

/**
 * Category management (plan 04) — list, create, rename, soft-delete.
 * The delete is admin-only on the server (the button is hidden otherwise);
 * a deleted category leaves the list, products keep their reference.
 */
export function CategoryManager({
  isAdmin,
  onBack,
}: {
  isAdmin: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("Staff");

  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CatForm>(EMPTY_CAT);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CatForm>(EMPTY_CAT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    void fetchStaffCategories().then((cats) => setCategories(cats ?? null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchCreate(p: Partial<CatForm>) {
    setCreateForm((prev) => ({ ...prev, ...p }));
  }
  function patchCreateName(lang: Lang, v: string) {
    setCreateForm((prev) => ({ ...prev, names: { ...prev.names, [lang]: v } }));
  }
  function patchEdit(p: Partial<CatForm>) {
    setEditForm((prev) => ({ ...prev, ...p }));
  }
  function patchEditName(lang: Lang, v: string) {
    setEditForm((prev) => ({ ...prev, names: { ...prev.names, [lang]: v } }));
  }

  async function create() {
    if (busy || createForm.names.en.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await createCategory({
      names: buildNames(createForm.names),
      sortOrder: Number(createForm.sortOrder) || 0,
      isListed: createForm.isListed,
    });
    setBusy(false);
    if (res.ok) {
      setCreating(false);
      setCreateForm(EMPTY_CAT);
      load();
    } else {
      setError(t("saveError"));
    }
  }

  async function saveEdit(id: string) {
    if (busy || editForm.names.en.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await updateCategory(id, {
      names: buildNames(editForm.names),
      sortOrder: Number(editForm.sortOrder) || 0,
      isListed: editForm.isListed,
    });
    setBusy(false);
    if (res.ok) {
      setEditId(null);
      load();
    } else {
      setError(t("saveError"));
    }
  }

  async function doDelete() {
    if (confirmDeleteId === null || deleting) return;
    const id = confirmDeleteId;
    setDeleting(true);
    setError(null);
    const res = await deleteCategory(id);
    setDeleting(false);
    if (res.ok) {
      setConfirmDeleteId(null);
      if (editId === id) setEditId(null);
      load();
    } else {
      setError(t("deleteError"));
    }
  }

  if (categories === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <YarnLoader className="size-10" />
      </div>
    );
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          {t("categoriesTitle")}
        </h2>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t("backToProducts")}
        </Button>
      </div>

      {/* Create */}
      <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        {creating ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {LANGS.map((lang) => (
                <div key={lang} className="grid gap-1">
                  <Label htmlFor={`new-cat-${lang}`}>{t(NAME_KEY[lang])}</Label>
                  <Input
                    id={`new-cat-${lang}`}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    value={createForm.names[lang]}
                    placeholder={t("titlePlaceholder")}
                    onChange={(e) => patchCreateName(lang, e.currentTarget.value)}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="new-cat-sort">{t("sortOrder")}</Label>
                <Input
                  id="new-cat-sort"
                  type="number"
                  min="0"
                  value={createForm.sortOrder}
                  onChange={(e) => patchCreate({ sortOrder: e.currentTarget.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || createForm.names.en.trim() === ""}>
                {busy ? t("saving") : t("newCategory")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateForm(EMPTY_CAT);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            {t("newCategory")}
          </Button>
        )}
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* List */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("sortOrder")}
              </TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-20 text-center text-muted-foreground"
                >
                  {t("emptyTitle")}
                </TableCell>
              </TableRow>
            ) : (
              categories.map((c) => {
                const isEditing = editId === c.id;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      {isEditing ? (
                        <div className="grid gap-1">
                          {LANGS.map((lang) => (
                            <Input
                              key={lang}
                              aria-label={t(NAME_KEY[lang])}
                              dir={lang === "ar" ? "rtl" : "ltr"}
                              value={editForm.names[lang]}
                              placeholder={t("titlePlaceholder")}
                              onChange={(e) => patchEditName(lang, e.currentTarget.value)}
                            />
                          ))}
                          <Input
                            aria-label={t("sortOrder")}
                            type="number"
                            min="0"
                            value={editForm.sortOrder}
                            onChange={(e) =>
                              patchEdit({ sortOrder: e.currentTarget.value })
                            }
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{nameOf(c, "en")}</span>
                          <span className="text-xs text-muted-foreground">
                            {nameOf(c, "ar") !== "—" ? nameOf(c, "ar") : ""}
                          </span>
                          {!c.isListed ? (
                            <Badge variant="secondary">{t("hidden")}</Badge>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {isEditing ? "" : c.sortOrder}
                    </TableCell>
                    <TableCell className="text-end">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            disabled={busy || editForm.names.en.trim() === ""}
                            onClick={() => void saveEdit(c.id)}
                          >
                            {t("save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(null)}
                          >
                            {t("cancel")}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(c.id);
                              setEditForm(fromCategory(c));
                            }}
                          >
                            {t("edit")}
                          </Button>
                          {isAdmin ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(c.id)}
                            >
                              {t("deleteCategory")}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {confirmDeleteId !== null ? (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmCategoryDeleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirmCategoryDeleteBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void doDelete()}
                disabled={deleting}
              >
                {t("deleteCategory")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

function nameOf(c: CategoryDto, locale: string): string {
  const row =
    c.names.find((n) => n.language === locale) ??
    c.names.find((n) => n.language === "en") ??
    c.names[0];
  return row?.name ?? "—";
}
