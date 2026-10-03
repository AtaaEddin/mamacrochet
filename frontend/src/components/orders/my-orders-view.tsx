"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  LogIn,
  Package,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Identity } from "@/lib/api/generated-client";
import type { User } from "@/lib/auth";
import { Button } from "@/components/ui/button";

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
import { Textarea } from "@/components/ui/textarea";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import { getGuestId } from "@/lib/guest-id";
import {
  cancelOrder,
  confirmDelivery,
  fetchMyOrders,
  fetchOrderDetail,
  orderProductTitle,
  rateOrder,
  type OrderDetail,
  type OrderSummary,
} from "@/lib/orders/api";
import { OrderAttachments } from "./order-attachments";
import { OrderDeliveryCard, OrderPaymentCard } from "./payment-delivery";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderStatusSteps } from "./order-status-steps";
import { OrderTimeline } from "./order-timeline";

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

function formatPrice(order: {
  price: number | string | null;
  currency: string;
}): string {
  const price = order.price;
  if (price === null || price === undefined) return "—";
  const n = typeof price === "string" ? Number(price) : price;
  return `${n.toFixed(2)} ${order.currency}`;
}

/**
 * Customer "My orders" (plan 05, D22 rail + stage): the rail lists the
 * customer's orders (own + linked guest orders), the stage shows the
 * status board — steps, timeline, photos, contact block — plus the
 * customer actions: cancel (open/in_progress) and rate (closed).
 *
 * Mobile: list ⇄ detail with a back arrow. Desktop: two columns.
 *
 * On first load (signed in) the device guest id is linked to the account
 * (`POST /identity/guest-link`) so guest orders from this device join the
 * list — idempotent, best-effort, before the list fetch.
 */
export function MyOrdersView() {
  const [me, setMe] = useState<{ status: "loading" } | { status: "anon" } | { status: "failed" } | { status: "me"; me: User }>({
    status: "loading",
  });
  const [rail, setRail] = useState<RailState>({ status: "loading" });
  const [stage, setStage] = useState<StageState>({ status: "none" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listTick, setListTick] = useState(0);
  const [stageTick, setStageTick] = useState(0);
  const linkDoneRef = useRef(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const t = useTranslations("Orders");
  const router = useRouter();

  // Current user (401/410 = anon → sign-in card).
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

  // Link the device guest id (best-effort) exactly once after auth; the
  // tick (inside the promise callback) fires the first rail fetch.
  useEffect(() => {
    if (me.status !== "me" || linkDoneRef.current) return;
    linkDoneRef.current = true;
    const guestId = getGuestId();
    const link = guestId
      ? Identity.guestLink({ body: { guestId } }).catch(() => {})
      : Promise.resolve();
    void link.then(() => setListTick((n) => n + 1));
  }, [me.status]);

  // Rail fetch (initial state is "loading").
  useEffect(() => {
    if (me.status !== "me" || listTick === 0) return;
    const req = ++reqRef.current;
    fetchMyOrders({})
      .then((page) => {
        if (req !== reqRef.current) return;
        if (!page) setRail({ status: "failed" });
        else setRail(page.items.length === 0 ? { status: "empty" } : { status: "ready", items: page.items });
      })
      .catch(() => {
        if (req === reqRef.current) setRail({ status: "failed" });
      });
  }, [me.status, listTick]);

  // Stage fetch (the selection handler sets "loading" synchronously).
  useEffect(() => {
    if (!selectedId) return;
    const req = ++reqRef.current;
    fetchOrderDetail(selectedId, "customer")
      .then((order) => {
        if (req !== reqRef.current) return;
        if (!order) setStage({ status: "failed" });
        else setStage({ status: "ready", order });
      })
      .catch(() => {
        if (req === reqRef.current) setStage({ status: "failed" });
      });
  }, [selectedId, stageTick]);

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
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => window.location.reload()}
        >
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
        <h1 className="mt-3 font-display text-lg font-bold">{t("signInTitle")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {t("signInBody")}
        </p>
        <Button
          className="mt-4 w-full"
          onClick={() => router.push("/login?next=/orders")}
        >
          {t("signInButton")}
        </Button>
      </div>
    );
  }

  const doCancel = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    const res = await cancelOrder(selectedId, cancelReason.trim());
    setBusy(false);
    setCancelOpen(false);
    setCancelReason("");
    if (res.ok) {
      setStage({ status: "ready", order: res.order });
      setListTick((n) => n + 1);
    }
  };

  const doRate = async () => {
    if (!selectedId || rating === 0 || busy) return;
    setBusy(true);
    const res = await rateOrder(selectedId, rating, ratingComment.trim());
    setBusy(false);
    if (res.ok) {
      setStage({ status: "ready", order: res.order });
      setListTick((n) => n + 1);
    }
  };

  const doConfirmDelivery = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setConfirmError(null);
    const res = await confirmDelivery(selectedId);
    setBusy(false);
    if (res.ok) {
      setStage({ status: "ready", order: res.order });
    } else {
      setConfirmError(res.error.message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Mobile: only one pane at a time. */}
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
            <OrderStage
              stage={stage}
              onRetry={retryStage}
              onCancelClick={() => setCancelOpen(true)}
              rating={rating}
              setRating={setRating}
              ratingComment={ratingComment}
              setRatingComment={setRatingComment}
              busy={busy}
              onRate={doRate}
              onConfirm={doConfirmDelivery}
              confirmError={confirmError}
            />
          </div>
        ) : (
          <OrderRail rail={rail} selectedId={null} onSelect={selectOrder} />
        )}
      </div>

      {/* Desktop: rail + stage side by side. */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(260px,1fr)_2fr]">
        <OrderRail rail={rail} selectedId={selectedId} onSelect={selectOrder} />
        <div className="min-w-0">
          {selectedId ? (
            <OrderStage
              stage={stage}
              onRetry={retryStage}
              onCancelClick={() => setCancelOpen(true)}
              rating={rating}
              setRating={setRating}
              ratingComment={ratingComment}
              setRatingComment={setRatingComment}
              busy={busy}
              onRate={doRate}
              onConfirm={doConfirmDelivery}
              confirmError={confirmError}
            />
          ) : (
            <div className="grid h-full min-h-40 place-items-center rounded-3xl border border-dashed border-border/70 bg-card/50 p-6 text-center text-sm font-semibold text-muted-foreground">
              {t("stageHint")}
            </div>
          )}
        </div>
      </div>

      {/* Cancel dialog */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cancelBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-5">
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("cancelReasonPlaceholder")}
              required
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doCancel();
              }}
              disabled={busy || cancelReason.trim().length < 3}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              {t("cancelSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderRail({
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
        <p className="mt-2 text-sm font-bold">{t("emptyTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("emptyBody")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/works">
            <Button variant="secondary" size="sm">
              {t("emptyCtaCatalog")}
            </Button>
          </Link>
          <Link href="/request-custom">
            <Button size="sm">
              <Sparkles className="size-4" aria-hidden="true" />
              {t("emptyCtaCustom")}
            </Button>
          </Link>
        </div>
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
                <p className="min-w-0 truncate text-sm font-bold">{title}</p>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatWhen(o.updatedAt, locale)}
                </span>
                {o.price !== null ? (
                  <span className="font-bold text-foreground">{formatPrice(o)}</span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrderStage({
  stage,
  onRetry,
  onCancelClick,
  rating,
  setRating,
  ratingComment,
  setRatingComment,
  busy,
  onRate,
  onConfirm,
  confirmError,
}: {
  stage: StageState;
  onRetry: () => void;
  onCancelClick: () => void;
  rating: number;
  setRating: (n: number) => void;
  ratingComment: string;
  setRatingComment: (s: string) => void;
  busy: boolean;
  onRate: () => void;
  onConfirm: () => void;
  confirmError: string | null;
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
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {order.kind === "custom" ? t("kindCustom") : t("kindCatalog")}
          </p>
          <h2 className="mt-0.5 font-display text-xl font-bold leading-snug">
            {orderProductTitle(order.product, locale) ?? t("untitledOrder")}
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
            {formatPrice({ price: order.finalPrice ?? order.estimatedPrice, currency: order.currency })}
          </span>
        </div>
      </header>

      {/* Status board */}
      <div className="mt-5">
        <OrderStatusSteps status={order.status} />
      </div>

      {order.status === "ready_for_payment" ? (
        <p className="mt-4 rounded-2xl border border-brand-gold/30 bg-brand-gold/10 px-4 py-3 text-sm font-semibold leading-relaxed">
          {t("readyHint")}
        </p>
      ) : null}

      {/* Payment + delivery records (plan 07) */}
      {order.payment ? (
        <OrderPaymentCard payment={order.payment} />
      ) : null}
      {order.delivery ? (
        <>
          <OrderDeliveryCard delivery={order.delivery} />
          {order.canConfirmDelivery ? (
            <div className="mt-3">
              <Button onClick={onConfirm} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PackageCheck className="size-4" aria-hidden="true" />
                )}
                {t("confirmDelivery")}
              </Button>
              {confirmError ? (
                <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
                  {confirmError}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* Contact block */}
      <section className="mt-5 rounded-2xl bg-muted/40 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("contactTitle")}
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t("contactName")}:</dt>
            <dd className="min-w-0 break-words font-semibold">{order.contactName}</dd>
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
            <dt className="text-muted-foreground">{t("createdAtLabel")}:</dt>
            <dd className="font-semibold">{formatWhen(order.createdAt, locale)}</dd>
          </div>
        </dl>
      </section>

      {/* Photos */}
      {order.attachments.length > 0 ? (
        <section className="mt-5">
          <OrderAttachments
            attachments={order.attachments}
            label={t("photosTitle")}
          />
        </section>
      ) : null}

      {/* Timeline */}
      <section className="mt-6">
        <p className="mb-3 font-display text-sm font-bold">{t("timelineTitle")}</p>
        <OrderTimeline events={order.timeline} />
      </section>

      {/* Customer actions */}
      {(order.canCancel || order.canRate || order.rating !== null) && (
        <section className="mt-6 border-t border-border/60 pt-5">
          {order.canCancel ? (
            <Button
              variant="outline"
              onClick={onCancelClick}
              className="text-destructive hover:text-destructive"
            >
              <X className="size-4" aria-hidden="true" />
              {t("cancelOrder")}
            </Button>
          ) : null}
          {order.canRate ? (
            <div className="mt-4 rounded-2xl border border-brand-gold/30 bg-brand-gold/5 p-4">
              <p className="text-sm font-bold">{t("rateTitle")}</p>
              <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={t("rateTitle")}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n}`}
                    onClick={() => setRating(n)}
                    className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Star
                      className={`size-7 transition-colors ${
                        rating >= n ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/50"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={2}
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder={t("rateCommentPlaceholder")}
                />
                <Button onClick={onRate} disabled={busy || rating === 0}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Star className="size-4" aria-hidden="true" />
                  )}
                  {t("rateSubmit")}
                </Button>
              </div>
            </div>
          ) : null}
          {order.rating !== null ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-gold">
              <BadgeCheck className="size-4" aria-hidden="true" />
              {t("ratedThanks", { score: String(order.rating) })}
            </p>
          ) : null}
        </section>
      )}
    </article>
  );
}
