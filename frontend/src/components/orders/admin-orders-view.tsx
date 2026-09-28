"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ClipboardCheck,
  Gauge,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  UserCog,
  Users,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import type { User } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import {
  adminChangeOrderStatus,
  assignOrder,
  fetchAdminOrders,
  fetchOrderDetail,
  fetchOrderMetrics,
  orderProductTitle,
  type OrderDetail,
  type OrderMetrics,
  type OrderSummary,
  type UserDto,
} from "@/lib/orders/api";
import { OrderAttachments } from "./order-attachments";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderStatusSteps } from "./order-status-steps";
import { OrderTimeline } from "./order-timeline";

type TableState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "failed" }
  | { status: "ready"; items: OrderSummary[]; total: number };

type StageState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; order: OrderDetail };

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPrice(
  value: number | string | null,
  currency: string,
): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return `${n.toFixed(2)} ${currency}`;
}

function statusOptions(t: (k: string) => string): { value: string; label: string }[] {
  // "all" is the SelectItem sentinel for "no filter" — Radix reserves the
  // empty string for "no value selected".
  return [
    { value: "all", label: t("statusAll") },
    { value: "open", label: t("status.open") },
    { value: "in_progress", label: t("status.in_progress") },
    { value: "ready_for_payment", label: t("status.ready_for_payment") },
    { value: "paid", label: t("status.paid") },
    { value: "delivered", label: t("status.delivered") },
    { value: "closed", label: t("status.closed") },
    { value: "cancelled", label: t("status.cancelled") },
  ];
}

/**
 * Admin orders (plan 05): metrics panel (live counts + per-employee
 * throughput), filterable paginated table, and the full-trace detail with
 * assignment + override transition (mandatory reason). Out-of-matrix
 * events are stored AdminOnly and only appear here.
 */
export function AdminOrdersView() {
  const [me, setMe] = useState<
    { status: "loading" } | { status: "anon" } | { status: "failed" } | { status: "me"; me: User }
  >({ status: "loading" });
  const [metrics, setMetrics] = useState<OrderMetrics | null>(null);
  const [employees, setEmployees] = useState<UserDto[]>([]);
  const [table, setTable] = useState<TableState>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<StageState>({ status: "none" });
  const [stageTick, setStageTick] = useState(0);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const reqRef = useRef(0);

  const t = useTranslations("Orders");
  const locale = useLocale();
  const router = useRouter();
  const PAGE_SIZE = 20;

  // Gate: admin only.
  useEffect(() => {
    let alive = true;
    api.GET("/identity/me")
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          const status = res.response.status;
          if (status === 401 || status === 410) setMe({ status: "anon" });
          else setMe({ status: "failed" });
          return;
        }
        if (res.data) setMe({ status: "me", me: res.data });
      })
      .catch(() => {
        if (alive) setMe({ status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Metrics + employees (for assignment + filter).
  useEffect(() => {
    if (me.status !== "me") return;
    let alive = true;
    void fetchOrderMetrics().then((m) => {
      if (alive) setMetrics(m);
    });
    api
      .GET("/admin/users", { params: { query: { page: 1, pageSize: 96 } } })
      .then((res) => {
        if (!alive) return;
        if (res.error || !res.data) return;
        const pageData = res.data;
        setEmployees(
          pageData.items.filter(
            (u) => u.roles.includes("employee") || u.roles.includes("admin"),
          ),
        );
      });
    return () => {
      alive = false;
    };
  }, [me.status]);

  // Debounced customer search.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedCustomer(customerSearch.trim()), 300);
    return () => clearTimeout(h);
  }, [customerSearch]);

  // Table fetch (initial state = loading; refreshes replace on completion).
  useEffect(() => {
    if (me.status !== "me") return;
    const req = ++reqRef.current;
    fetchAdminOrders({
      status: statusFilter || null,
      customer: debouncedCustomer || null,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((p) => {
        if (req !== reqRef.current) return;
        if (!p) setTable({ status: "failed" });
        else {
          setTable(
            p.items.length === 0
              ? { status: "empty" }
              : { status: "ready", items: p.items, total: Number(p.total) },
          );
          setTotalPages(Math.max(1, Math.ceil(Number(p.total) / PAGE_SIZE)));
        }
      })
      .catch(() => {
        if (req === reqRef.current) setTable({ status: "failed" });
      });
  }, [me.status, statusFilter, debouncedCustomer, page, tick]);

  // Stage fetch (the selection handler sets "loading" synchronously).
  useEffect(() => {
    if (!selectedId) return;
    const req = ++reqRef.current;
    fetchOrderDetail(selectedId, "admin")
      .then((order) => {
        if (req !== reqRef.current) return;
        if (!order) setStage({ status: "failed" });
        else setStage({ status: "ready", order });
      })
      .catch(() => {
        if (req === reqRef.current) setStage({ status: "failed" });
      });
  }, [selectedId, stageTick]);

  const refreshStage = useCallback((order: OrderDetail) => {
    setStage({ status: "ready", order });
    setTick((n) => n + 1);
    void fetchOrderMetrics().then(setMetrics);
  }, []);
  const selectOrder = (id: string) => {
    setSelectedId(id);
    setStage({ status: "loading" });
  };
  const retryStage = useCallback(() => {
    setStage({ status: "loading" });
    setStageTick((n) => n + 1);
  }, []);

  if (me.status === "loading") {
    return <YarnLoader className="mx-auto w-full max-w-md" />;
  }
  if (me.status === "failed") {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 text-center">
        <RefreshCw className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold">{t("loadFailed")}</p>
        <Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (me.status === "anon") {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-gold/15 text-brand-gold">
          <LogIn className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-3 font-display text-lg font-bold">{t("adminSignInTitle")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {t("adminSignInBody")}
        </p>
        <Button className="mt-4 w-full" onClick={() => router.push("/staff/login?next=/admin/orders")}>
          {t("adminSignInButton")}
        </Button>
      </div>
    );
  }
  if (!me.me.roles.includes("admin")) {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
        {t("adminForbidden")}
      </div>
    );
  }

  const order = stage.status === "ready" ? stage.order : null;

  const doAssign = async (employeeId: string | null) => {
    if (!order || busy) return;
    setBusy(true);
    const res = await assignOrder(order.id, employeeId);
    setBusy(false);
    if (res.ok) refreshStage(res.order);
  };

  const doOverride = async () => {
    if (!order || busy || overrideStatus === "") return;
    const price = overridePrice.trim() === "" ? null : Number(overridePrice);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return;
    setBusy(true);
    const res = await adminChangeOrderStatus(
      order.id,
      overrideStatus,
      overrideNote.trim(),
      price,
    );
    setBusy(false);
    setOverrideOpen(false);
    setOverrideStatus("");
    setOverrideNote("");
    setOverridePrice("");
    if (res.ok) refreshStage(res.order);
  };

  const terminal = order ? order.status === "closed" || order.status === "cancelled" : false;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Metrics */}
      {metrics ? (
        <section aria-label={t("metricsTitle")}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MetricCard label={t("metrics.open")} value={metrics.openOrders} />
            <MetricCard label={t("metrics.inProgress")} value={metrics.inProgressOrders} />
            <MetricCard
              label={t("metrics.ready")}
              value={metrics.readyForPaymentOrders}
              accent
            />
          </div>
          {metrics.employees.length > 0 ? (
            <details className="mt-3 rounded-2xl border border-border/60 bg-card">
              <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
                <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("metrics.employees")}
              </summary>
              <div className="overflow-x-auto border-t border-border/60">
                <table className="w-full min-w-105 text-sm">
                  <thead>
                    <tr className="text-start text-xs text-muted-foreground">
                      <th className="p-3 text-start font-bold">{t("metrics.employee")}</th>
                      <th className="p-3 text-start font-bold">{t("metrics.completed")}</th>
                      <th className="p-3 text-start font-bold">{t("metrics.avgDays")}</th>
                      <th className="p-3 text-start font-bold">{t("metrics.avgRating")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.employees.map((e) => (
                      <tr key={e.employeeId} className="border-t border-border/40">
                        <td className="p-3 font-semibold">{e.employeeName}</td>
                        <td className="p-3">{String(e.completedOrders)}</td>
                        <td className="p-3">
                          {e.avgDaysOpenToDelivered === null
                            ? "—"
                            : Number(e.avgDaysOpenToDelivered).toFixed(1)}
                        </td>
                        <td className="p-3">
                          {e.avgRating === null
                            ? "—"
                            : `${Number(e.avgRating).toFixed(1)} / 5`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder={t("adminSearchPlaceholder")}
            className="ps-9"
            aria-label={t("adminSearchPlaceholder")}
          />
        </div>
        <div className="sm:w-56">
          <Select
            value={statusFilter === "" ? "all" : statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v === null || v === "all" ? "" : v)
            }
          >
            <SelectTrigger aria-label={t("statusFilterLabel")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions(t).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: list ⇄ detail */}
      <div className="lg:hidden">
        {selectedId ? (
          <div>
            <button
              onClick={() => setSelectedId(null)}
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
              {t("backToList")}
            </button>
            <AdminOrderStage
              stage={stage}
              onRetry={retryStage}
              employees={employees}
              busy={busy}
              onAssign={doAssign}
              overrideOpen={overrideOpen}
              setOverrideOpen={setOverrideOpen}
              overrideStatus={overrideStatus}
              setOverrideStatus={setOverrideStatus}
              overrideNote={overrideNote}
              setOverrideNote={setOverrideNote}
              overridePrice={overridePrice}
              setOverridePrice={setOverridePrice}
              onOverride={doOverride}
              terminal={terminal}
            />
          </div>
        ) : (
          <AdminOrderList
            table={table}
            selectedId={null}
            onSelect={selectOrder}
          />
        )}
      </div>

      {/* Desktop: table + detail */}
      <div className="hidden lg:block">
        {table.status === "loading" ? (
          <div className="flex items-center justify-center rounded-3xl border border-border/60 bg-card p-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : null}
        {table.status === "failed" ? (
          <div className="rounded-3xl border border-border/60 bg-card p-10 text-center text-sm font-semibold text-muted-foreground">
            {t("loadFailed")}
          </div>
        ) : null}
        {table.status === "empty" ? (
          <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 p-10 text-center">
            <Users className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold">{t("adminEmpty")}</p>
          </div>
        ) : null}
        {table.status === "ready" ? (
          <>
            <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card">
              <table className="w-full min-w-170 text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="p-3 text-start font-bold">{t("colCustomer")}</th>
                    <th className="p-3 text-start font-bold">{t("colContact")}</th>
                    <th className="p-3 text-start font-bold">{t("colStatus")}</th>
                    <th className="p-3 text-start font-bold">{t("colEmployee")}</th>
                    <th className="p-3 text-start font-bold">{t("colPrice")}</th>
                    <th className="p-3 text-start font-bold">{t("colUpdated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.items.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => selectOrder(o.id)}
                      className={`cursor-pointer border-t border-border/40 transition-colors hover:bg-accent/40 ${
                        o.id === selectedId ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="p-3 font-bold">{o.contactName}</td>
                      <td className="p-3 text-muted-foreground">
                        {orderProductTitle(o.product, locale) ??
                          (o.kind === "custom" ? t("kindCustom") : t("kindCatalog"))}
                      </td>
                      <td className="p-3">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {o.assignedEmployeeName ?? "—"}
                      </td>
                      <td className="p-3">
                        {formatPrice(o.price, o.currency)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatWhen(o.updatedAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("adminPageInfo", { page: String(page), total: String(totalPages) })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Desktop detail (below the table) */}
      <div className="hidden lg:block">
        {selectedId ? (
          <AdminOrderStage
            stage={stage}
            onRetry={retryStage}
            employees={employees}
            busy={busy}
            onAssign={doAssign}
            overrideOpen={overrideOpen}
            setOverrideOpen={setOverrideOpen}
            overrideStatus={overrideStatus}
            setOverrideStatus={setOverrideStatus}
            overrideNote={overrideNote}
            setOverrideNote={setOverrideNote}
            overridePrice={overridePrice}
            setOverridePrice={setOverridePrice}
            onOverride={doOverride}
            terminal={terminal}
          />
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center sm:p-4 ${
        accent
          ? "border-brand-gold/30 bg-brand-gold/10"
          : "border-border/60 bg-card"
      }`}
    >
      <p className="font-display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-bold leading-tight text-muted-foreground sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function AdminOrderList({
  table,
  selectedId,
  onSelect,
}: {
  table: TableState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();

  if (table.status === "loading") {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-border/60 bg-card p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (table.status === "failed") {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-8 text-center text-sm font-semibold text-muted-foreground">
        {t("loadFailed")}
      </div>
    );
  }
  if (table.status === "empty") {
    return (
      <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 p-8 text-center">
        <Users className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold">{t("adminEmpty")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label={t("railTitle")}>
      {table.items.map((o) => {
        const selected = o.id === selectedId;
        return (
          <li key={o.id}>
            <button
              onClick={() => onSelect(o.id)}
              aria-current={selected ? "true" : undefined}
              className={`w-full rounded-2xl border p-3.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                selected
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                  : "border-border/60 bg-card hover:bg-accent/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold">{o.contactName}</p>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {orderProductTitle(o.product, locale) ??
                    (o.kind === "custom" ? t("kindCustom") : t("kindCatalog"))}
                </span>
                {o.price !== null ? (
                  <span className="shrink-0 font-bold text-foreground">
                    {formatPrice(o.price, o.currency)}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AdminOrderStage({
  stage,
  onRetry,
  employees,
  busy,
  onAssign,
  overrideOpen,
  setOverrideOpen,
  overrideStatus,
  setOverrideStatus,
  overrideNote,
  setOverrideNote,
  overridePrice,
  setOverridePrice,
  onOverride,
  terminal,
}: {
  stage: StageState;
  onRetry: () => void;
  employees: UserDto[];
  busy: boolean;
  onAssign: (employeeId: string | null) => void;
  overrideOpen: boolean;
  setOverrideOpen: (open: boolean) => void;
  overrideStatus: string;
  setOverrideStatus: (s: string) => void;
  overrideNote: string;
  setOverrideNote: (s: string) => void;
  overridePrice: string;
  setOverridePrice: (s: string) => void;
  onOverride: () => void;
  terminal: boolean;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();

  if (stage.status === "loading") {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-border/60 bg-card p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (stage.status === "failed") {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-8 text-center">
        <p className="text-sm font-semibold">{t("loadFailed")}</p>
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {t("retry")}
        </Button>
      </div>
    );
  }
  const order = stage.status === "ready" ? stage.order : null;
  if (!order) return null;

  return (
    <article className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {order.kind === "custom" ? t("kindCustom") : t("kindCatalog")}
            {order.customerName ? ` · ${order.customerName}` : ` · ${t("guestOrder")}`}
          </p>
          <h2 className="mt-0.5 font-display text-xl font-bold leading-snug">
            {orderProductTitle(order.product, locale) ?? order.contactName}
          </h2>
          {order.spec ? (
            <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {order.spec}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <OrderStatusBadge status={order.status} />
          <span className="text-sm font-bold text-foreground">
            {formatPrice(order.finalPrice ?? order.estimatedPrice, order.currency)}
          </span>
        </div>
      </header>

      <div className="mt-5">
        <OrderStatusSteps status={order.status} />
      </div>

      {/* Customer block */}
      <section className="mt-5 rounded-2xl bg-muted/40 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("customerTitle")}
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t("contactName")}:</dt>
            <dd className="break-words font-semibold">{order.contactName}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t("contactPhone")}:</dt>
            <dd className="break-words font-semibold">{order.contactPhone}</dd>
          </div>
          {order.contactEmail ? (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t("contactEmail")}:</dt>
              <dd className="break-words font-semibold">{order.contactEmail}</dd>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t("customerLabel")}:</dt>
            <dd className="break-words font-semibold">
              {order.customerName ?? t("guestOrder")}
            </dd>
          </div>
        </dl>
      </section>

      {/* Assignment + override */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <UserCog className="size-4 text-muted-foreground" aria-hidden="true" />
          <Select
            value={order.assignedEmployeeId ?? "none"}
            onValueChange={(v) =>
              onAssign(v === null || v === "none" ? null : v)
            }
            disabled={busy}
          >
            <SelectTrigger className="w-48" aria-label={t("assignLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("unassigned")}
              </SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!terminal ? (
          <Button variant="outline" size="sm" onClick={() => setOverrideOpen(true)}>
            <ClipboardCheck className="size-4" aria-hidden="true" />
            {t("overrideButton")}
          </Button>
        ) : null}
      </section>

      {/* Photos */}
      {order.attachments.length > 0 ? (
        <section className="mt-5">
          <OrderAttachments attachments={order.attachments} label={t("photosTitle")} />
        </section>
      ) : null}

      {/* Full trace */}
      <section className="mt-6">
        <p className="mb-3 font-display text-sm font-bold">{t("timelineTitle")}</p>
        <OrderTimeline events={order.timeline} />
      </section>

      {/* Override dialog */}
      <AlertDialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("overrideTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("overrideBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-5">
            <Select
              value={overrideStatus}
              onValueChange={(v) => {
                if (v !== null) setOverrideStatus(v);
              }}
            >
              <SelectTrigger className="w-full" aria-label={t("overrideStatusLabel")}>
                <SelectValue placeholder={t("overrideStatusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions(t)
                  .filter((o) => o.value !== "all")
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value} disabled={o.value === order.status}>
                      {o.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Textarea
              rows={2}
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              placeholder={t("overrideReasonPlaceholder")}
              required
            />
            {overrideStatus === "ready_for_payment" ? (
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                placeholder={t("staffReadyPriceLabel")}
                aria-label={t("staffReadyPriceLabel")}
              />
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onOverride();
              }}
              disabled={busy || overrideStatus === "" || overrideNote.trim().length < 3}
            >
              {t("overrideSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
