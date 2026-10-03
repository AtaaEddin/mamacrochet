import { fileSrc } from "@/lib/api/client";
import { toApiError } from "@/lib/api/errors";
import {
  AdminOrders,
  Orders,
  StaffOrders,
  type ApiError,
  type OrderDetail,
  type OrderMetrics,
  type OrderPage,
  type OrderProductInfo,
} from "@/lib/api/generated-client";
import { escapeOData } from "@/lib/api/odata";

/**
 * Orders API client (plan 05) — one shared module for the customer, staff
 * and admin order surfaces.
 *
 * Every call goes through the generated per-operation SDK (plan
 * 20261003-1303): lists pass typed `$top/$skip/$filter/$orderby` query
 * args, mutations pass `{ path, body }`, and the multipart uploads
 * (attachments, payment, delivery, order creation) pass typed body objects
 * the SDK serializes to FormData. Cookies + the CSRF header come from the
 * app transport (`browserFetch`, `lib/api/client.ts`).
 *
 * `submitOrder` is the public guest-creation call: no CSRF header — the
 * transport's matcher exempts POST /orders, and the endpoint is protected
 * server-side by the strict guest rate bucket + honeypot + D16 caps (same
 * precedent as the hiring submit).
 *
 * Browser-only.
 */

export type {
  ApiError,
  DeliveryDto,
  OrderAttachmentDto,
  OrderDetail,
  OrderEmployeeMetric,
  OrderEventDto,
  OrderMetrics,
  OrderPage,
  OrderProductInfo,
  OrderSummary,
  PaymentDto,
  UserDto,
} from "@/lib/api/generated-client";

/** Resolve an order file path (`/files/orders/...`) against the API base. */
export function orderFileUrl(url: string): string {
  return fileSrc(url);
}

/** Localized order-product title (client-side, like the catalog cards). */
export function orderProductTitle(
  product: OrderProductInfo | null,
  locale: string,
): string | null {
  if (!product) return null;
  const row =
    product.localizations.find((r) => r.language === locale) ??
    product.localizations.find((r) => r.language === "en") ??
    product.localizations[0];
  const title = row?.name?.trim();
  return title ? title : null;
}

// ---- list query building --------------------------------------------------

type ODataListQuery = {
  $top: number;
  $skip: number;
  $orderby: string;
  $filter?: string;
};

function pageQuery(page: number, pageSize: number): ODataListQuery {
  return { $top: pageSize, $skip: (page - 1) * pageSize, $orderby: "createdAt desc" };
}

function withFilter(query: ODataListQuery, clauses: string[]): ODataListQuery {
  if (clauses.length === 0) return query;
  return { ...query, $filter: clauses.join(" and ") };
}

// ---- reads (cookie-auth) --------------------------------------------------

/** My orders (customer). `null` on any failure. */
export async function fetchMyOrders(opts: {
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  // The customer list has no text search — only a status filter.
  const clauses: string[] = [];
  if (opts.status) clauses.push(`status eq '${escapeOData(opts.status)}'`);
  try {
    const res = await Orders.list({
      query: withFilter(pageQuery(opts.page ?? 1, opts.pageSize ?? 20), clauses),
    });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

/** One of my orders (customer or staff-or-admin). `null` on any failure. */
export async function fetchOrderDetail(
  id: string,
  role: "customer" | "staff" | "admin",
): Promise<OrderDetail | null> {
  try {
    const res =
      role === "admin"
        ? await AdminOrders.get({ path: { id } })
        : role === "staff"
          ? await StaffOrders.get({ path: { id } })
          : await Orders.get({ path: { id } });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

/** Staff order list: status + contact-name text search + page. */
export async function fetchStaffOrders(opts: {
  status?: string | null;
  contactName?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  const clauses: string[] = [];
  if (opts.status) clauses.push(`status eq '${escapeOData(opts.status)}'`);
  const contact = opts.contactName?.trim();
  if (contact) clauses.push(`contains(contactName, '${escapeOData(contact)}')`);
  try {
    const res = await StaffOrders.list({
      query: withFilter(pageQuery(opts.page ?? 1, opts.pageSize ?? 20), clauses),
    });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

/** Admin order list: status + customer text + customer/employee ids. */
export async function fetchAdminOrders(opts: {
  status?: string | null;
  customer?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  const clauses: string[] = [];
  if (opts.status) clauses.push(`status eq '${escapeOData(opts.status)}'`);
  if (opts.customerId) clauses.push(`customerId eq '${escapeOData(opts.customerId)}'`);
  if (opts.employeeId) clauses.push(`employeeId eq '${escapeOData(opts.employeeId)}'`);
  const customer = opts.customer?.trim();
  if (customer) clauses.push(`contains(customer, '${escapeOData(customer)}')`);
  try {
    const res = await AdminOrders.list({
      query: withFilter(pageQuery(opts.page ?? 1, opts.pageSize ?? 20), clauses),
    });
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

export async function fetchOrderMetrics(): Promise<OrderMetrics | null> {
  try {
    const res = await AdminOrders.metrics();
    return res.error ? null : res.data;
  } catch {
    return null;
  }
}

// ---- customer mutations ---------------------------------------------------

/** Cancel one of my orders (open / in_progress). Reason required. */
export async function cancelOrder(
  id: string,
  reason: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await Orders.cancel({ path: { id }, body: { reason } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/** Rate a closed order (1–5 + optional comment, once). */
export async function rateOrder(
  id: string,
  score: number,
  comment: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await Orders.rate({
    path: { id },
    body: { score, comment: comment || null },
  });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

// ---- staff mutations ------------------------------------------------------

/** Staff status transition (start work / set ready + price / cancel). */
export async function changeOrderStatus(
  id: string,
  status: string,
  note?: string | null,
  finalPrice?: number | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await StaffOrders.status({
    path: { id },
    body: { status, note: note ?? null, finalPrice: finalPrice ?? null },
  });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/** Staff progress note. */
export async function addOrderNote(
  id: string,
  text: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await StaffOrders.note({ path: { id }, body: { text } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/** Upload WIP/sample photos (multipart, `files`). */
export async function uploadOrderAttachments(
  id: string,
  kind: string,
  files: File[] | FileList,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await StaffOrders.attachments({
    path: { id },
    body: { kind, files: Array.from(files) },
  });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

// ---- plan 07: payment, delivery, confirm delivery -------------------------

/**
 * Record the payment (plan 07, rule 2) — multipart: amount + method + note +
 * receipt file (staff: required; admin: optional, then the note is the
 * mandatory written reason). Moves the order to `paid` server-side.
 */
export async function recordPayment(
  id: string,
  role: "staff" | "admin",
  data: { amount: string; method: string; note: string; file: File | null },
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const body = {
    amount: data.amount,
    method: data.method,
    note: data.note,
    // The SDK serializer skips null/undefined — a missing receipt is simply
    // not appended (same wire shape as the old hand-built FormData).
    receipt: data.file ?? undefined,
  };
  const res =
    role === "admin"
      ? await AdminOrders.payment({ path: { id }, body })
      : await StaffOrders.payment({ path: { id }, body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/**
 * Record the delivery (plan 07, rule 4) — multipart: method + actualAt (ISO)
 * + description + optional proof file. Moves the order to `delivered`
 * server-side.
 */
export async function recordDelivery(
  id: string,
  role: "staff" | "admin",
  data: { method: string; actualAt: string; description: string; file: File | null },
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const body = {
    method: data.method,
    actualAt: data.actualAt,
    description: data.description,
    proof: data.file ?? undefined,
  };
  const res =
    role === "admin"
      ? await AdminOrders.delivery({ path: { id }, body })
      : await StaffOrders.delivery({ path: { id }, body });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/** The customer's optional "delivered ✓" (rule 5) — once per order. */
export async function confirmDelivery(
  id: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await Orders.confirmDelivery({ path: { id } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

// ---- admin mutations ------------------------------------------------------

/** Admin assignment (set/unset the per-order employee). */
export async function assignOrder(
  id: string,
  employeeId: string | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await StaffOrders.assign({ path: { id }, body: { employeeId } });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

/** Admin override transition (note mandatory). */
export async function adminChangeOrderStatus(
  id: string,
  status: string,
  note: string,
  finalPrice?: number | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await AdminOrders.status({
    path: { id },
    body: { status, note, finalPrice: finalPrice ?? null },
  });
  if (res.error) return { ok: false, error: toApiError(res.error) };
  return { ok: true, order: res.data };
}

// ---- public guest creation ------------------------------------------------

export type OrderSubmitResult =
  | { ok: true; id: string; status: string }
  | { ok: false; error: ApiError };

/**
 * Create an order (guest-capable, multipart). `kind` is `catalog` (buy the
 * listed `productId`) or `custom` (describe a piece, optionally referencing
 * `productId`). `guestId` is the device guest id (D14). `files` are sample
 * images (custom). No CSRF header — the public endpoint is protected by the
 * strict guest rate bucket + honeypot + D16 caps.
 */
export async function submitOrder(data: {
  kind: "catalog" | "custom";
  productId?: string | null;
  name: string;
  phone: string;
  email?: string;
  guestId: string;
  spec?: string;
  files: File[];
}): Promise<OrderSubmitResult> {
  try {
    const res = await Orders.create({
      body: {
        kind: data.kind,
        ...(data.productId ? { productId: data.productId } : {}),
        name: data.name,
        phone: data.phone,
        ...(data.email ? { email: data.email } : {}),
        guestId: data.guestId,
        ...(data.spec ? { spec: data.spec } : {}),
        // Honeypot — the UI always sends it empty (D16).
        website: "",
        files: data.files,
      },
    });
    if (res.error) return { ok: false, error: toApiError(res.error) };
    return { ok: true, id: res.data.id, status: res.data.status };
  } catch {
    // Network failure (offline, timeout) — no response to parse.
    return { ok: false, error: toApiError(null) };
  }
}
