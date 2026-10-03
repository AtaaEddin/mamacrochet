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
  Banknote,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  LogIn,
  Package,
  RefreshCw,
  Search,
  Send,
  Truck,
  X,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Identity } from "@/lib/api/generated-client";
import type { User } from "@/lib/auth";
import { isStaff } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import {
  addOrderNote,
  changeOrderStatus,
  fetchStaffOrders,
  fetchOrderDetail,
  orderProductTitle,
  uploadOrderAttachments,
  type OrderDetail,
  type OrderSummary,
} from "@/lib/orders/api";
import { OrderAttachments } from "./order-attachments";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderTimeline } from "./order-timeline";
import {
  OrderDeliveryCard,
  OrderPaymentCard,
  RecordDeliveryDialog,
  RecordPaymentDialog,
} from "./payment-delivery";

type RailState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "failed" }
  | { status: "ready"; items: OrderSummary[] };

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

function statusFilterOptions(t: (k: string) => string): { value: string; label: string }[] {
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
 * Staff orders surface (plan 05, D22 rail + stage): the list shows the
 * assigned orders (unassigned included), the stage drives the lifecycle —
 * start work, progress notes, WIP photos, set-ready-with-final-price,
 * cancel-with-reason. Payment/delivery forms belong to plan 07.
 *
 * Mobile: list ⇄ detail with a back arrow. Desktop: two columns.
 */
export function StaffOrdersView() {
  const [me, setMe] = useState<
    { status: "loading" } | { status: "anon" } | { status: "failed" } | { status: "me"; me: User }
  >({ status: "loading" });
  const [rail, setRail] = useState<RailState>({ status: "loading" });
  const [stage, setStage] = useState<StageState>({ status: "none" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [stageTick, setStageTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);
  const [readyPrice, setReadyPrice] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const reqRef = useRef(0);

  const t = useTranslations("Orders");
  const router = useRouter();

  // Current user → gate (anon → staff login; signed-in non-staff → 403).
  useEffect(() => {
    let alive = true;
    Identity.me.get()
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          const status = res.response?.status;
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

  // Debounced contact search.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  // List fetch (staff binder: status + contact text; initial state = loading).
  useEffect(() => {
    if (me.status !== "me") return;
    const req = ++reqRef.current;
    fetchStaffOrders({
      contactName: debouncedSearch || null,
      status: statusFilter || null,
    })
      .then((page) => {
        if (req !== reqRef.current) return;
        if (!page) setRail({ status: "failed" });
        else setRail(page.items.length === 0 ? { status: "empty" } : { status: "ready", items: page.items });
      })
      .catch(() => {
        if (req === reqRef.current) setRail({ status: "failed" });
      });
  }, [me.status, debouncedSearch, statusFilter, tick]);

  // Stage fetch (the selection handler sets "loading" synchronously).
  useEffect(() => {
    if (!selectedId) return;
    const req = ++reqRef.current;
    fetchOrderDetail(selectedId, "staff")
      .then((order) => {
        if (req !== reqRef.current) return;
        if (!order) setStage({ status: "failed" });
        else setStage({ status: "ready", order });
      })
      .catch(() => {
        if (req === reqRef.current) setStage({ status: "failed" });
      });
  }, [selectedId, stageTick]);

  const refreshStage = useCallback(
    (order: OrderDetail) => {
      setStage({ status: "ready", order });
      setTick((n) => n + 1);
    },
    [],
  );
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
        <h1 className="mt-3 font-display text-lg font-bold">{t("staffSignInTitle")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {t("staffSignInBody")}
        </p>
        <Button className="mt-4 w-full" onClick={() => router.push("/staff/login?next=/staff/orders")}>
          {t("staffSignInButton")}
        </Button>
      </div>
    );
  }
  if (!isStaff(me.me)) {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
        {t("staffForbidden")}
      </div>
    );
  }

  const order = stage.status === "ready" ? stage.order : null;

  const doStart = async () => {
    if (!order || busy) return;
    setBusy(true);
    const res = await changeOrderStatus(order.id, "in_progress");
    setBusy(false);
    if (res.ok) refreshStage(res.order);
  };

  const doNote = async () => {
    if (!order || busy || noteText.trim().length === 0) return;
    setBusy(true);
    const res = await addOrderNote(order.id, noteText.trim());
    setBusy(false);
    setNoteOpen(false);
    setNoteText("");
    if (res.ok) refreshStage(res.order);
  };

  const doReady = async () => {
    if (!order || busy) return;
    const price = Number(readyPrice);
    if (!Number.isFinite(price) || price < 0) return;
    setBusy(true);
    const res = await changeOrderStatus(order.id, "ready_for_payment", null, price);
    setBusy(false);
    setReadyOpen(false);
    setReadyPrice("");
    if (res.ok) refreshStage(res.order);
  };

  const doCancel = async () => {
    if (!order || busy) return;
    setBusy(true);
    const res = await changeOrderStatus(order.id, "cancelled", cancelReason.trim());
    setBusy(false);
    setCancelOpen(false);
    setCancelReason("");
    if (res.ok) refreshStage(res.order);
  };

  const doUpload = async (files: FileList | null) => {
    if (!order || !files || uploading) return;
    setUploading(true);
    const res = await uploadOrderAttachments(order.id, "wip", files);
    setUploading(false);
    if (res.ok) refreshStage(res.order);
  };

  const doClose = async () => {
    if (!order || busy) return;
    setActionError(null);
    setBusy(true);
    const res = await changeOrderStatus(order.id, "closed");
    setBusy(false);
    if (res.ok) refreshStage(res.order);
    else setActionError(res.error.message);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Search + filter bar (rail tools) */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("staffSearchPlaceholder")}
            className="ps-9"
            aria-label={t("staffSearchPlaceholder")}
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
              {statusFilterOptions(t).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: one pane at a time */}
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
            <StaffOrderStage
              stage={stage}
              onRetry={retryStage}
              busy={busy}
              noteOpen={noteOpen}
              setNoteOpen={setNoteOpen}
              noteText={noteText}
              setNoteText={setNoteText}
              onNote={doNote}
              readyOpen={readyOpen}
              setReadyOpen={setReadyOpen}
              readyPrice={readyPrice}
              setReadyPrice={setReadyPrice}
              onReady={doReady}
              cancelOpen={cancelOpen}
              setCancelOpen={setCancelOpen}
              cancelReason={cancelReason}
              setCancelReason={setCancelReason}
              onCancel={doCancel}
              onStart={doStart}
              uploading={uploading}
              onUpload={doUpload}
              paymentOpen={paymentOpen}
              setPaymentOpen={setPaymentOpen}
              deliveryOpen={deliveryOpen}
              setDeliveryOpen={setDeliveryOpen}
              actionError={actionError}
              onClose={doClose}
              onSuccess={refreshStage}
              hostDialogs={false}
            />
          </div>
        ) : (
          <StaffOrderRail rail={rail} selectedId={null} onSelect={selectOrder} />
        )}
      </div>

      {/* Desktop: rail + stage */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <StaffOrderRail rail={rail} selectedId={selectedId} onSelect={selectOrder} />
        <div className="min-w-0">
          {selectedId ? (
            <StaffOrderStage
              stage={stage}
              onRetry={retryStage}
              busy={busy}
              noteOpen={noteOpen}
              setNoteOpen={setNoteOpen}
              noteText={noteText}
              setNoteText={setNoteText}
              onNote={doNote}
              readyOpen={readyOpen}
              setReadyOpen={setReadyOpen}
              readyPrice={readyPrice}
              setReadyPrice={setReadyPrice}
              onReady={doReady}
              cancelOpen={cancelOpen}
              setCancelOpen={setCancelOpen}
              cancelReason={cancelReason}
              setCancelReason={setCancelReason}
              onCancel={doCancel}
              onStart={doStart}
              uploading={uploading}
              onUpload={doUpload}
              paymentOpen={paymentOpen}
              setPaymentOpen={setPaymentOpen}
              deliveryOpen={deliveryOpen}
              setDeliveryOpen={setDeliveryOpen}
              actionError={actionError}
              onClose={doClose}
              onSuccess={refreshStage}
              hostDialogs
            />
          ) : (
            <div className="grid h-full min-h-40 place-items-center rounded-3xl border border-dashed border-border/70 bg-card/50 p-6 text-center text-sm font-semibold text-muted-foreground">
              {t("stageHint")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StaffOrderRail({
  rail,
  selectedId,
  onSelect,
}: {
  rail: RailState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();

  if (rail.status === "loading") {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-border/60 bg-card p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (rail.status === "failed") {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-8 text-center text-sm font-semibold text-muted-foreground">
        {t("loadFailed")}
      </div>
    );
  }
  if (rail.status === "empty") {
    return (
      <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 p-8 text-center">
        <Package className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold">{t("staffEmpty")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label={t("railTitle")}>
      {rail.items.map((o) => {
        const title =
          orderProductTitle(o.product, locale) ??
          (o.kind === "custom" ? t("kindCustom") : t("kindCatalog"));
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
                <span className="truncate">{title}</span>
                {o.assignedEmployeeName ? (
                  <Badge variant="outline" className="shrink-0 px-2 py-0 text-[10px]">
                    {o.assignedEmployeeName}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{formatWhen(o.updatedAt, locale)}</span>
                {o.price !== null ? (
                  <span className="font-bold text-foreground">{formatPrice(o.price, o.currency)}</span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StaffOrderStage({
  stage,
  onRetry,
  busy,
  noteOpen,
  setNoteOpen,
  noteText,
  setNoteText,
  onNote,
  readyOpen,
  setReadyOpen,
  readyPrice,
  setReadyPrice,
  onReady,
  cancelOpen,
  setCancelOpen,
  cancelReason,
  setCancelReason,
  onCancel,
  onStart,
  uploading,
  onUpload,
  paymentOpen,
  setPaymentOpen,
  deliveryOpen,
  setDeliveryOpen,
  actionError,
  onClose,
  onSuccess,
  hostDialogs,
}: {
  stage: StageState;
  onRetry: () => void;
  busy: boolean;
  noteOpen: boolean;
  setNoteOpen: (open: boolean) => void;
  noteText: string;
  setNoteText: (s: string) => void;
  onNote: () => void;
  readyOpen: boolean;
  setReadyOpen: (open: boolean) => void;
  readyPrice: string;
  setReadyPrice: (s: string) => void;
  onReady: () => void;
  cancelOpen: boolean;
  setCancelOpen: (open: boolean) => void;
  cancelReason: string;
  setCancelReason: (s: string) => void;
  onCancel: () => void;
  onStart: () => void;
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  paymentOpen: boolean;
  setPaymentOpen: (open: boolean) => void;
  deliveryOpen: boolean;
  setDeliveryOpen: (open: boolean) => void;
  actionError: string | null;
  onClose: () => void;
  onSuccess: (order: OrderDetail) => void;
  hostDialogs: boolean;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);

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

      {/* Customer contact */}
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

      {/* Actions by status */}
      <div className="mt-4 flex flex-wrap gap-2">
        {order.status === "open" ? (
          <Button onClick={onStart} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            {t("staffStart")}
          </Button>
        ) : null}
        {order.status === "in_progress" ? (
          <>
            <Button variant="outline" onClick={() => setNoteOpen(true)} disabled={busy}>
              <Send className="size-4" />
              {t("staffNote")}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {t("staffWipPhotos")}
            </Button>
            <Button onClick={() => setReadyOpen(true)} disabled={busy}>
              <ClipboardCheck className="size-4" />
              {t("staffReady")}
            </Button>
          </>
        ) : null}
        {(order.status === "open" || order.status === "in_progress") ? (
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <X className="size-4" />
            {t("staffCancel")}
          </Button>
        ) : null}
        {order.status === "ready_for_payment" ? (
          <>
            <Button onClick={() => setPaymentOpen(true)} disabled={busy}>
              <Banknote className="size-4" aria-hidden="true" />
              {t("staffRecordPayment")}
            </Button>
            <p className="flex w-full items-center gap-2 rounded-2xl border border-brand-gold/30 bg-brand-gold/10 px-4 py-3 text-sm font-semibold">
              <ClipboardCheck className="size-4 text-brand-gold" aria-hidden="true" />
              {t("staffReadyHint")}
            </p>
          </>
        ) : null}
        {order.status === "paid" ? (
          <Button onClick={() => setDeliveryOpen(true)} disabled={busy}>
            <Truck className="size-4" aria-hidden="true" />
            {t("staffRecordDelivery")}
          </Button>
        ) : null}
        {order.status === "delivered" ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("staffCloseOrder")}
            </Button>
            <p className="flex w-full items-center gap-2 rounded-2xl border border-brand-gold/30 bg-brand-gold/10 px-4 py-3 text-sm font-semibold">
              <ClipboardCheck className="size-4 text-brand-gold" aria-hidden="true" />
              {t("staffCloseHint")}
            </p>
          </>
        ) : null}
        {actionError ? (
          <p role="alert" className="w-full text-sm font-semibold text-destructive">
            {actionError}
          </p>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => {
          void onUpload(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Payment + delivery records (plan 07) */}
      {order.payment ? (
        <OrderPaymentCard payment={order.payment} staff />
      ) : null}
      {order.delivery ? (
        <OrderDeliveryCard delivery={order.delivery} staff />
      ) : null}

      {/* Photos (all kinds for staff) */}
      {order.attachments.length > 0 ? (
        <section className="mt-5">
          <OrderAttachments attachments={order.attachments} label={t("photosTitle")} />
        </section>
      ) : null}

      {/* Timeline */}
      <section className="mt-6">
        <p className="mb-3 font-display text-sm font-bold">{t("timelineTitle")}</p>
        <OrderTimeline events={order.timeline} />
      </section>

      {/* Plan 07 dialogs: rendered once (desktop host); the portal escapes the
          hidden container so they open on mobile too. */}
      {hostDialogs && (
        <>
          <RecordPaymentDialog
            open={paymentOpen}
            onOpenChange={setPaymentOpen}
            orderId={order.id}
            suggestedAmount={Number(order.finalPrice ?? order.estimatedPrice)}
            currency={order.currency}
            role="staff"
            onSuccess={onSuccess}
          />

          <RecordDeliveryDialog
            open={deliveryOpen}
            onOpenChange={setDeliveryOpen}
            orderId={order.id}
            role="staff"
            onSuccess={onSuccess}
          />
        </>
      )}

      {/* Progress note dialog */}
      <AlertDialog open={noteOpen} onOpenChange={setNoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staffNoteTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-5">
            <Textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("staffNotePlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onNote();
              }}
              disabled={busy || noteText.trim().length === 0}
            >
              {t("staffNoteSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set ready + final price dialog */}
      <AlertDialog open={readyOpen} onOpenChange={setReadyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staffReadyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("staffReadyBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-5">
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={readyPrice}
              onChange={(e) => setReadyPrice(e.target.value)}
              placeholder="0.00"
              aria-label={t("staffReadyPriceLabel")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onReady();
              }}
              disabled={busy || Number(readyPrice) < 0 || readyPrice.trim() === ""}
            >
              {t("staffReadySubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staffCancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("staffCancelBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-5">
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("staffCancelReasonPlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onCancel();
              }}
              disabled={busy || cancelReason.trim().length < 3}
            >
              {t("staffCancelSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
