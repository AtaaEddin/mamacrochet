"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  recordDelivery,
  recordPayment,
  type DeliveryDto,
  type OrderDetail,
  type PaymentDto,
} from "@/lib/orders/api";
import { fileSrc } from "@/lib/api/client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function proofFileValid(file: File): boolean {
  return file.size <= MAX_FILE_BYTES && PROOF_TYPES.includes(file.type);
}

function formatProofAmount(amount: number | string, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency}`;
}

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

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function FilePicker({
  label,
  chooseLabel,
  hint,
  file,
  onChange,
  required,
}: {
  label: string;
  chooseLabel: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  required: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-sm font-semibold">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => ref.current?.click()}
        >
          {file ? file.name : chooseLabel}
        </Button>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </div>
      {file ? (
        <p className="mt-1.5 truncate text-xs font-semibold text-foreground">
          {file.name} · {formatBytes(file.size)}
        </p>
      ) : null}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * The recorded payment (plan 07, rule 2) — read-only card. The customer sees
 * the record ("Payment recorded ✓" + amount + method + date); staff/admin
 * additionally get the receipt file link (only then does the API send it).
 */
export function OrderPaymentCard({
  payment,
  staff,
}: {
  payment: PaymentDto;
  staff?: boolean;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  return (
    <section className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-brand-gold/15 text-brand-gold">
          <Banknote className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-bold">{t("paymentCardTitle")}</h3>
        <span aria-hidden="true" className="text-xs font-bold text-brand-gold">
          ✓
        </span>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("paymentAmountLabel")}:</dt>
          <dd className="font-semibold">
            {formatProofAmount(payment.amount, payment.currency)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("paymentMethodLabel")}:</dt>
          <dd className="break-words font-semibold">{payment.method}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("paymentDateLabel")}:</dt>
          <dd className="font-semibold">
            {formatWhen(payment.recordedAt, locale)}
          </dd>
        </div>
      </dl>
      {payment.note ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {payment.note}
        </p>
      ) : null}
      {staff && payment.receiptUrl ? (
        <a
          href={fileSrc(payment.receiptUrl)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("paymentViewReceipt")}
        </a>
      ) : null}
    </section>
  );
}

/**
 * The recorded delivery (plan 07, rule 4) — read-only card. `proofUrl` is
 * staff/admin-only (same pattern as the receipt link).
 */
export function OrderDeliveryCard({
  delivery,
  staff,
}: {
  delivery: DeliveryDto;
  staff?: boolean;
}) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  return (
    <section className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-brand-gold/15 text-brand-gold">
          <Truck className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-bold">{t("deliveryCardTitle")}</h3>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("deliveryMethodLabel")}:</dt>
          <dd className="break-words font-semibold">{delivery.method}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("deliveryDateLabel")}:</dt>
          <dd className="font-semibold">
            {formatWhen(delivery.actualAt, locale)}
          </dd>
        </div>
      </dl>
      {delivery.description ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {delivery.description}
        </p>
      ) : null}
      {staff && delivery.proofUrl ? (
        <a
          href={fileSrc(delivery.proofUrl)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("deliveryViewProof")}
        </a>
      ) : null}
    </section>
  );
}

/**
 * Record-payment dialog (plan 07, rule 2): amount + method + receipt file
 * (staff: mandatory; admin: optional — then a written reason is mandatory
 * and the event stays in the admin trace only). The inner body mounts fresh
 * on every open, so no reset effect is needed.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  orderId,
  suggestedAmount,
  currency,
  role,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  suggestedAmount: number | null;
  currency: string;
  role: "staff" | "admin";
  onSuccess: (order: OrderDetail) => void;
}) {
  if (!open) return null;
  return (
    <PaymentDialogBody
      orderId={orderId}
      suggestedAmount={suggestedAmount}
      currency={currency}
      role={role}
      onClose={() => onOpenChange(false)}
      onSuccess={onSuccess}
    />
  );
}

function PaymentDialogBody({
  orderId,
  suggestedAmount,
  currency,
  role,
  onClose,
  onSuccess,
}: {
  orderId: string;
  suggestedAmount: number | null;
  currency: string;
  role: "staff" | "admin";
  onClose: () => void;
  onSuccess: (order: OrderDetail) => void;
}) {
  const t = useTranslations("Orders");
  const [amount, setAmount] = useState(
    suggestedAmount !== null && Number.isFinite(suggestedAmount)
      ? String(suggestedAmount)
      : "",
  );
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInvalid, setFileInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValue = Number(amount);
  const amountOk =
    amount.trim() !== "" && Number.isFinite(amountValue) && amountValue > 0;
  const methodOk = method.trim().length > 0;
  const noteOk = note.trim().length > 0;
  const fileValid = file !== null && proofFileValid(file);
  const canSubmit =
    amountOk && methodOk && (role === "staff" ? fileValid : fileValid || noteOk);

  const doSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const res = await recordPayment(orderId, role, {
      amount: amount.trim(),
      method: method.trim(),
      note: note.trim(),
      file: fileValid ? file : null,
    });
    setBusy(false);
    if (res.ok) {
      onClose();
      onSuccess(res.order);
    } else {
      setError(res.error.message);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("paymentFormTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {role === "admin" ? t("paymentAdminBody") : t("paymentFormBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 px-5">
          <div>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${t("paymentAmountLabel")} (${currency})`}
              aria-label={t("paymentAmountLabel")}
            />
          </div>
          <Input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder={t("paymentMethodPlaceholder")}
            aria-label={t("paymentMethodLabel")}
          />
          <FilePicker
            label={t("paymentReceiptLabel")}
            chooseLabel={t("chooseFile")}
            hint={t("paymentReceiptHint")}
            file={file}
            onChange={(f) => {
              setFile(f);
              setFileInvalid(f !== null && !proofFileValid(f));
            }}
            required={role === "staff"}
          />
          {fileInvalid ? (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {t("fileInvalidHint")}
            </p>
          ) : null}
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              role === "admin" && !file
                ? t("paymentReasonPlaceholder")
                : t("paymentNotePlaceholder")
            }
            aria-label={t("paymentNoteLabel")}
          />
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t("cancelDialogClose")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void doSubmit();
            }}
            disabled={busy || !canSubmit}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Banknote className="size-4" aria-hidden="true" />
            )}
            {t("paymentSubmit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Record-delivery dialog (plan 07, rule 4): method + actual date/time are
 * mandatory, description + proof file optional. The inner body mounts fresh
 * on every open.
 */
export function RecordDeliveryDialog({
  open,
  onOpenChange,
  orderId,
  role,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  role: "staff" | "admin";
  onSuccess: (order: OrderDetail) => void;
}) {
  if (!open) return null;
  return (
    <DeliveryDialogBody
      orderId={orderId}
      role={role}
      onClose={() => onOpenChange(false)}
      onSuccess={onSuccess}
    />
  );
}

function DeliveryDialogBody({
  orderId,
  role,
  onClose,
  onSuccess,
}: {
  orderId: string;
  role: "staff" | "admin";
  onClose: () => void;
  onSuccess: (order: OrderDetail) => void;
}) {
  const t = useTranslations("Orders");
  const [method, setMethod] = useState("");
  const [actualAt, setActualAt] = useState(() => toDatetimeLocal(new Date()));
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInvalid, setFileInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methodOk = method.trim().length > 0;
  const actualOk =
    actualAt.trim() !== "" && !Number.isNaN(new Date(actualAt).getTime());
  const canSubmit = methodOk && actualOk;

  const doSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const res = await recordDelivery(orderId, role, {
      method: method.trim(),
      actualAt: new Date(actualAt).toISOString(),
      description: description.trim(),
      file: file !== null && proofFileValid(file) ? file : null,
    });
    setBusy(false);
    if (res.ok) {
      onClose();
      onSuccess(res.order);
    } else {
      setError(res.error.message);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deliveryFormTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deliveryFormBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 px-5">
          <Input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder={t("deliveryMethodPlaceholder")}
            aria-label={t("deliveryMethodLabel")}
          />
          <Input
            type="datetime-local"
            value={actualAt}
            onChange={(e) => setActualAt(e.target.value)}
            aria-label={t("deliveryAtLabel")}
          />
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("deliveryDescriptionPlaceholder")}
            aria-label={t("deliveryDescriptionLabel")}
          />
          <FilePicker
            label={t("deliveryProofLabel")}
            chooseLabel={t("chooseFile")}
            hint={t("paymentReceiptHint")}
            file={file}
            onChange={(f) => {
              setFile(f);
              setFileInvalid(f !== null && !proofFileValid(f));
            }}
            required={false}
          />
          {fileInvalid ? (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {t("fileInvalidHint")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t("cancelDialogClose")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void doSubmit();
            }}
            disabled={busy || !canSubmit}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Truck className="size-4" aria-hidden="true" />
            )}
            {t("deliverySubmit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
