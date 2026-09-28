"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { isStaff, type User } from "@/lib/auth";
import type { CategoryDto, ProductDto, ProductPage } from "@/lib/staff/api";
import { fetchStaffCategories, fetchStaffProducts } from "@/lib/staff/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import { fileSrc } from "@/lib/catalog/display";
import { ProductEditor } from "./product-editor";
import { CategoryManager } from "./category-manager";

const PAGE_SIZE = 10;

type Gate =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "forbidden"; me: User | null }
  | { status: "ready"; me: User };

type Mode =
  | { kind: "list" }
  | { kind: "product"; id: string | null }
  | { kind: "categories" };

/**
 * Staff product management (plan 04) — client-gated to the team (employee or
 * admin). Owns the product list (search + category filter + pagination) and
 * routes to the product editor and the category manager.
 *
 * List fetching happens in one place (the fetch effect), driven by debounced
 * search + filters + a refresh key; the debounce effect only sets state inside
 * its timeout callback. Stale responses are dropped via reqRef.
 */
export function StaffProductsView() {
  const t = useTranslations("Staff");
  const router = useRouter();

  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [listedOnly, setListedOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [page, setPage] = useState(1);
  const [list, setList] = useState<ProductPage | null>(null);
  const [listError, setListError] = useState(false);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const reqRef = useRef(0);

  const fetchList = useCallback(
    (s: string, cat: string, listed: boolean, p: number, append: boolean) => {
      const req = ++reqRef.current;
      return fetchStaffProducts({
        titleSearch: s || null,
        categoryId: cat === "all" ? null : cat,
        isListed: listed ? true : null,
        page: p,
        pageSize: PAGE_SIZE,
      }).then((res) => {
        if (req !== reqRef.current) return;
        if (res) {
          setList((prev) => {
            if (!append || !prev) return res;
            return { ...res, items: [...prev.items, ...res.items] };
          });
          setListError(false);
          setPage(append ? p : 1);
        } else if (!append) {
          setList(null);
          setListError(true);
        }
      });
    },
    [],
  );

  const loadCategories = useCallback(() => {
    void fetchStaffCategories().then((cats) => setCategories(cats ?? []));
  }, []);

  // 1. Who am I? (staff gate) + initial category options.
  useEffect(() => {
    let alive = true;
    api
      .GET("/identity/me")
      .then((res) => {
        if (!alive) return;
        if (res.error || !res.data) {
          setGate({ status: "anon" });
          return;
        }
        if (!isStaff(res.data)) {
          setGate({ status: "forbidden", me: res.data });
          return;
        }
        setGate({ status: "ready", me: res.data });
        loadCategories();
      })
      .catch(() => {
        if (alive) setGate({ status: "forbidden", me: null });
      });
    return () => {
      alive = false;
    };
  }, [loadCategories]);

  // 2. Debounce the search box (state set only inside the timeout callback).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(handle);
  }, [q]);

  // 3. The single list fetcher: search (debounced), filters, or a refresh.
  useEffect(() => {
    if (gate.status !== "ready") return;
    void fetchList(debouncedQ, categoryId, listedOnly, 1, false);
  }, [debouncedQ, categoryId, listedOnly, refreshKey, gate.status, fetchList]);

  if (gate.status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
        <YarnLoader className="size-10" />
      </div>
    );
  }

  if (gate.status === "anon" || gate.status === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant={gate.status === "forbidden" ? "destructive" : "default"}>
          <AlertTitle>{t("forbiddenTitle")}</AlertTitle>
          <AlertDescription>{t("forbiddenBody")}</AlertDescription>
        </Alert>
        <div className="mt-3">
          <Button onClick={() => router.replace("/staff/login")}>
            {t("staffSignin")}
          </Button>
        </div>
      </div>
    );
  }

  const total = Number(list?.total ?? 0);
  const shown = list?.items.length ?? 0;
  const hasMore = shown < total;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {mode.kind === "list" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMode({ kind: "categories" })}>
              {t("manageCategories")}
            </Button>
            <Button onClick={() => setMode({ kind: "product", id: null })}>
              {t("newProduct")}
            </Button>
          </div>
        ) : null}
      </header>

      {mode.kind === "list" ? (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              aria-label={t("search")}
              placeholder={t("searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              className="sm:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  if (v) setCategoryId(v);
                }}
              >
                <SelectTrigger className="w-44" aria-label={t("category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allCategories")}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {categoryName(c, "en")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  id="listed-only"
                  checked={listedOnly}
                  onCheckedChange={(c) => setListedOnly(c === true)}
                />
                <label
                  htmlFor="listed-only"
                  className="text-sm font-bold text-foreground"
                >
                  {t("listedOnly")}
                </label>
              </div>
            </div>
          </div>

          {listError ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>{t("errorTitle")}</AlertTitle>
              <AlertDescription>
                {t("errorBody")}{" "}
                <button
                  type="button"
                  onClick={() =>
                    void fetchList(debouncedQ, categoryId, listedOnly, 1, false)
                  }
                  className="font-bold underline underline-offset-4 hover:no-underline"
                >
                  {t("retry")}
                </button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("category")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("price")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("stock")}
                  </TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list === null ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("loading")}
                    </TableCell>
                  </TableRow>
                ) : list.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("emptyTitle")}
                    </TableCell>
                  </TableRow>
                ) : (
                  list.items.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onEdit={() => setMode({ kind: "product", id: p.id })}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                className="rounded-full px-6"
                onClick={() =>
                  void fetchList(debouncedQ, categoryId, listedOnly, page + 1, true)
                }
              >
                {t("more")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {mode.kind === "product" ? (
        <ProductEditor
          productId={mode.id}
          categories={categories}
          isAdmin={gate.me.roles.includes("admin")}
          onCancel={() => {
            setMode({ kind: "list" });
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

      {mode.kind === "categories" ? (
        <CategoryManager
          isAdmin={gate.me.roles.includes("admin")}
          onBack={() => {
            setMode({ kind: "list" });
            setRefreshKey((k) => k + 1);
            loadCategories();
          }}
        />
      ) : null}
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
}: {
  product: ProductDto;
  onEdit: () => void;
}) {
  const t = useTranslations("Staff");
  const locale = useLocale();
  const cover = fileSrc(product.coverImage?.url ?? null);
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(product.price));

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="size-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/50">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- API file host
              <img src={cover} alt="" className="size-full object-cover" loading="lazy" />
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{productName(product, "en")}</span>
              {!product.isListed ? <Badge variant="secondary">{t("hidden")}</Badge> : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {product.inStock ? t("inStock") : t("madeToOrder")}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {product.category ? categoryName(product.category, "en") : t("uncategorized")}
      </TableCell>
      <TableCell className="hidden md:table-cell">{price}</TableCell>
      <TableCell className="hidden md:table-cell">{product.stockUnits}</TableCell>
      <TableCell className="text-end">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {t("edit")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function productName(p: ProductDto, locale: string): string {
  const row =
    p.localizations.find((l) => l.language === locale) ??
    p.localizations.find((l) => l.language === "en") ??
    p.localizations[0];
  return row?.title ?? "—";
}

function categoryName(c: CategoryDto, locale: string): string {
  const row =
    c.names.find((n) => n.language === locale) ??
    c.names.find((n) => n.language === "en") ??
    c.names[0];
  return row?.name ?? "—";
}
