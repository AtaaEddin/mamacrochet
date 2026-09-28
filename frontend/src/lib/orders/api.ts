import { api, fileSrc, postForm } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Orders API client (plan 05) — one shared module for the customer, staff
 * and admin order surfaces.
 *
 * The list endpoints bind a single `[FromQuery] QuerySpec`, so the typed
 * client types the query as `never` — list fetches build the query string by
 * hand and send cookies themselves (same precedent as the staff catalog
 * client). Mutations and details go through the typed `api` client (cookies
 * + CSRF for `/orders`, `/staff`, `/admin`).
 *
 * `submitOrder` is the public guest-creation call: a multipart FormData the
 * generated binary schema can't express, so it uses raw fetch with NO CSRF
 * header — the endpoint is protected server-side by the strict guest rate
 * bucket + honeypot + D16 caps (same precedent as the hiring submit).
 *
 * Browser-only.
 */

export type OrderPage = components["schemas"]["OrderPage"];
export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderDetail = components["schemas"]["OrderDetail"];
export type OrderEventDto = components["schemas"]["OrderEventDto"];
export type OrderAttachmentDto = components["schemas"]["OrderAttachmentDto"];
export type OrderProductInfo = components["schemas"]["OrderProductInfo"];
export type OrderMetrics = components["schemas"]["OrderMetrics"];
export type OrderEmployeeMetric = components["schemas"]["OrderEmployeeMetric"];
export type ApiError = components["schemas"]["ApiError"];
export type UserDto = components["schemas"]["UserDto"];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8085";

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

// ---- query building -------------------------------------------------------

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function buildPageParams(pageSize: number, page: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set("$top", String(pageSize));
  params.set("$skip", String((page - 1) * pageSize));
  params.set("$orderby", "createdAt desc");
  return params;
}

/**
 * Customer list query: `$filter=status eq '...'` + page. `status` `null` =
 * all. (The customer binder has no text search — the list is short.)
 */
export function buildMyOrdersQuery(opts: {
  status?: string | null;
  page?: number;
  pageSize?: number;
}): string {
  const params = buildPageParams(opts.pageSize ?? 20, opts.page ?? 1);
  const status = opts.status;
  if (status) params.set("$filter", `status eq '${escapeOData(status)}'`);
  return params.toString();
}

/**
 * Staff list query: status + contact-name text search + page.
 */
export function buildStaffOrdersQuery(opts: {
  status?: string | null;
  contactName?: string | null;
  page?: number;
  pageSize?: number;
}): string {
  const params = buildPageParams(opts.pageSize ?? 20, opts.page ?? 1);
  const clauses: string[] = [];
  if (opts.status) clauses.push(`status eq '${escapeOData(opts.status)}'`);
  const contact = opts.contactName?.trim();
  if (contact) clauses.push(`contains(contactName, '${escapeOData(contact)}')`);
  if (clauses.length > 0) {
    params.set(
      "$filter",
      clauses.join(" and "),
    );
  }
  return params.toString();
}

/**
 * Admin list query: status + customer text + customer/employee ids + page.
 */
export function buildAdminOrdersQuery(opts: {
  status?: string | null;
  customer?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  page?: number;
  pageSize?: number;
}): string {
  const params = buildPageParams(opts.pageSize ?? 20, opts.page ?? 1);
  const clauses: string[] = [];
  if (opts.status) clauses.push(`status eq '${escapeOData(opts.status)}'`);
  if (opts.customerId) clauses.push(`customerId eq '${escapeOData(opts.customerId)}'`);
  if (opts.employeeId) clauses.push(`employeeId eq '${escapeOData(opts.employeeId)}'`);
  const customer = opts.customer?.trim();
  if (customer) clauses.push(`contains(customer, '${escapeOData(customer)}')`);
  if (clauses.length > 0) {
    params.set("$filter", clauses.join(" and "));
  }
  return params.toString();
}

// ---- reads (cookie-auth) --------------------------------------------------

/** My orders (customer). `null` on any failure. */
export async function fetchMyOrders(opts: {
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  const qs = buildMyOrdersQuery(opts);
  try {
    const res = await fetch(`${API_BASE}/orders?${qs}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as OrderPage;
  } catch {
    return null;
  }
}

/** One of my orders (customer or staff-or-admin). `null` on any failure. */
export async function fetchOrderDetail(
  id: string,
  role: "customer" | "staff" | "admin",
): Promise<OrderDetail | null> {
  const base =
    role === "admin" ? `/admin/orders/${id}` : role === "staff" ? `/staff/orders/${id}` : `/orders/${id}`;
  try {
    const res = await fetch(`${API_BASE}${base}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as OrderDetail;
  } catch {
    return null;
  }
}

export async function fetchStaffOrders(opts: {
  status?: string | null;
  contactName?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  const qs = buildStaffOrdersQuery(opts);
  try {
    const res = await fetch(`${API_BASE}/staff/orders?${qs}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as OrderPage;
  } catch {
    return null;
  }
}

export async function fetchAdminOrders(opts: {
  status?: string | null;
  customer?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OrderPage | null> {
  const qs = buildAdminOrdersQuery(opts);
  try {
    const res = await fetch(`${API_BASE}/admin/orders?${qs}`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as OrderPage;
  } catch {
    return null;
  }
}

export async function fetchOrderMetrics(): Promise<OrderMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/orders/metrics`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as OrderMetrics;
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
  const res = await api.POST("/orders/{id}/cancel", {
    params: { path: { id } },
    body: { reason },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
}

/** Rate a closed order (1–5 + optional comment, once). */
export async function rateOrder(
  id: string,
  score: number,
  comment: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await api.POST("/orders/{id}/rating", {
    params: { path: { id } },
    body: { score, comment: comment || null },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
}

// ---- staff mutations ------------------------------------------------------

/** Staff status transition (start work / set ready + price / cancel). */
export async function changeOrderStatus(
  id: string,
  status: string,
  note?: string | null,
  finalPrice?: number | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await api.POST("/staff/orders/{id}/status", {
    params: { path: { id } },
    body: { status, note: note ?? null, finalPrice: finalPrice ?? null },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
}

/** Staff progress note. */
export async function addOrderNote(
  id: string,
  text: string,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await api.POST("/staff/orders/{id}/notes", {
    params: { path: { id } },
    body: { text },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
}

/** Upload WIP/sample photos (multipart, `files`). */
export async function uploadOrderAttachments(
  id: string,
  kind: string,
  files: File[] | FileList,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const form = new FormData();
  form.append("kind", kind);
  for (const file of Array.from(files)) form.append("files", file);
  const res = await postForm<OrderDetail>(
    `${API_BASE}/staff/orders/${encodeURIComponent(id)}/attachments`,
    form,
  );
  return res.ok ? { ok: true, order: res.data } : { ok: false, error: res.error };
}

// ---- admin mutations ------------------------------------------------------

/** Admin assignment (set/unset the per-order employee). */
export async function assignOrder(
  id: string,
  employeeId: string | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await api.PATCH("/staff/orders/{id}/assignment", {
    params: { path: { id } },
    body: { employeeId },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
}

/** Admin override transition (note mandatory). */
export async function adminChangeOrderStatus(
  id: string,
  status: string,
  note: string,
  finalPrice?: number | null,
): Promise<{ ok: true; order: OrderDetail } | { ok: false; error: ApiError }> {
  const res = await api.POST("/admin/orders/{id}/status", {
    params: { path: { id } },
    body: { status, note, finalPrice: finalPrice ?? null },
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, order: res.data as OrderDetail };
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
  const form = new FormData();
  form.append("kind", data.kind);
  if (data.productId) form.append("productId", data.productId);
  form.append("name", data.name);
  form.append("phone", data.phone);
  if (data.email) form.append("email", data.email);
  form.append("guestId", data.guestId);
  if (data.spec) form.append("spec", data.spec);
  // Honeypot — the UI always sends it empty (D16).
  form.append("website", "");
  for (const file of data.files) form.append("files", file);

  let response: Response | null = null;
  try {
    response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    response = null;
  }

  if (!response || !response.ok) {
    let error: ApiError = { code: "server_error", message: "" };
    try {
      const parsed = (await response?.json()) as ApiError;
      if (typeof parsed.code === "string") error = parsed;
    } catch {
      // keep fallback envelope
    }
    return { ok: false, error };
  }
  const body = (await response.json()) as components["schemas"]["OrderCreated"];
  return { ok: true, id: body.id, status: body.status };
}
