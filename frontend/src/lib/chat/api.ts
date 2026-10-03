import { api, API_BASE_URL } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/**
 * Chat REST (plan 06). JSON calls go through the typed OpenAPI client;
 * multipart uploads go through raw fetch (the generated binary schema
 * cannot express a FormData — same precedent as the avatar upload).
 *
 * Auth: the shared client's `hc.auth` cookie (signed-in users, CSRF wired
 * by `browserFetch`) OR a guest thread token sent as the `X-Chat-Token`
 * header (visitor threads — the API exempts those requests from CSRF and
 * verifies the token itself). One `Auth` shape keeps every call site tidy.
 */

type ApiError = components["schemas"]["ApiError"];

export type ChatThread = components["schemas"]["ThreadDto"];
export type ChatThreadListItem = components["schemas"]["ThreadListItemDto"];
export type ChatMessage = components["schemas"]["ChatMessageDto"];
export type ChatAttachment = components["schemas"]["ChatAttachmentDto"];
export type ChatParticipant = components["schemas"]["ChatParticipantDto"];
export type ChatOrderRef = components["schemas"]["ChatOrderRefDto"];
export type ChatThreadPage = components["schemas"]["ChatThreadListDto"];
export type ChatMessagePage = components["schemas"]["MessagePageDto"];
export type ChatPreview = components["schemas"]["MessagePreviewDto"];

export type ChatResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Cookie auth is implicit; a guest thread is passed by token. */
export type Auth = { token?: string };

/** The `X-Chat-Token` header for guest threads; undefined for cookie auth. */
function authHeaders(auth: Auth): Record<string, string> | undefined {
  return auth.token ? { "X-Chat-Token": auth.token } : undefined;
}

function toApiError(err: unknown): ApiError {
  // openapi-fetch hands back the parsed error body (the ApiError envelope).
  const e = err as { code?: unknown; message?: unknown } | undefined;
  const code = e?.code;
  const message = e?.message;
  return {
    code: typeof code === "string" && code.length > 0 ? code : "server_error",
    message:
      typeof message === "string" && message.length > 0
        ? message
        : "Something went wrong.",
  };
}

/**
 * Wraps a typed openapi-fetch call in the `ChatResult` envelope.
 * openapi-fetch (0.17) already parses the JSON body into `data` on success
 * and the error envelope into `error` on failure — do NOT re-read the
 * response body (it is consumed).
 */
async function call<T>(
  run: () => Promise<{ data?: T; error?: unknown; response?: Response }>,
): Promise<ChatResult<T>> {
  let res: { data?: T; error?: unknown; response?: Response };
  try {
    res = await run();
  } catch {
    return { ok: false, error: { code: "network", message: "network" } };
  }
  if (res.error) {
    return { ok: false, error: toApiError(res.error) };
  }
  return { ok: true, data: res.data as T };
}

// ---- Guest bootstrap -------------------------------------------------------

export function bootstrapVisitorThread(guestId: string) {
  return call<components["schemas"]["VisitorThreadCreated"]>(
    () =>
      api.POST("/chat/visitor", {
        body: {
          guestId,
          name: null,
          website: null,
        } satisfies components["schemas"]["VisitorThreadRequest"],
      }),
  );
}

// ---- Threads ----------------------------------------------------------------

/**
 * New conversation (chat app screen plan, sub 02): customers start a
 * thread with themselves; staff pass the customer it opens with (the API
 * ignores `customerId` for customers and validates it for staff).
 */
export function createThread(body: {
  subject?: string | null;
  customerId?: string | null;
}): Promise<ChatResult<ChatThread>> {
  return call(
    () =>
      api.POST("/chat/threads", {
        body: {
          subject: body.subject ?? null,
          customerId: body.customerId ?? null,
        } satisfies components["schemas"]["CreateThreadRequest"],
      }),
  );
}

export type StaffCustomer = components["schemas"]["CustomerDto"];

/**
 * Staff customer search — the picker behind the staff "New conversation"
 * (display name / phone / email, active customers only).
 */
export function searchStaffCustomers(
  search: string,
  page = 1,
): Promise<ChatResult<components["schemas"]["CustomerPageDto"]>> {
  return call(
    () =>
      api.GET("/staff/customers", {
        params: { query: { search, page } },
      }),
  );
}

export function fetchThread(
  threadId: string,
  auth: Auth,
): Promise<ChatResult<ChatThread>> {
  return call(
    () =>
      api.GET("/chat/threads/{threadId}", {
        params: { path: { threadId } },
        headers: authHeaders(auth),
      }),
  );
}

export function fetchThreads(params: {
  kind?: "visitor" | "order";
  closed?: boolean;
  page?: number;
} = {}): Promise<ChatResult<ChatThreadPage>> {
  return call(
    () =>
      api.GET("/chat/threads", {
        params: {
          query: {
            ...(params.kind ? { kind: params.kind } : {}),
            ...(params.closed !== undefined ? { closed: params.closed } : {}),
            page: params.page ?? 1,
          },
        },
      }),
  );
}

export function markThreadRead(threadId: string): Promise<boolean> {
  return call<void>(
    () => api.POST("/chat/threads/{threadId}/read", { params: { path: { threadId } } }),
  ).then((r) => r.ok);
}

// ---- Messages ----------------------------------------------------------------

export function fetchThreadMessages(
  threadId: string,
  auth: Auth,
  cursor: { before?: string; after?: string; limit?: number } = {},
): Promise<ChatResult<ChatMessagePage>> {
  return call(
    () =>
      api.GET("/chat/threads/{threadId}/messages", {
        params: {
          path: { threadId },
          query: {
            before: cursor.before,
            after: cursor.after,
            limit: cursor.limit ?? 50,
          },
        },
        headers: authHeaders(auth),
      }),
  );
}

export function sendThreadMessage(
  threadId: string,
  auth: Auth,
  body: {
    body: string;
    productId?: string | null;
    attachmentIds?: string[];
    clientId: string;
  },
): Promise<ChatResult<ChatMessage>> {
  return call(
    () =>
      api.POST("/chat/threads/{threadId}/messages", {
        params: { path: { threadId } },
        headers: authHeaders(auth),
        body: {
          body: body.body,
          productId: body.productId ?? null,
          attachmentIds: body.attachmentIds ?? null,
          clientId: body.clientId,
        } satisfies components["schemas"]["SendMessageRequest"],
      }),
  );
}

/**
 * Upload chat files (images/PDF, 10 MB, max 5) for a thread. Returns the
 * uploaded attachment DTOs — attach them to the next message.
 */
export async function uploadThreadAttachments(
  threadId: string,
  auth: Auth,
  files: File[],
): Promise<ChatResult<ChatAttachment[]>> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const headers = new Headers(authHeaders(auth));
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/chat/threads/${encodeURIComponent(threadId)}/attachments`,
      { method: "POST", credentials: "include", body: form, headers },
    );
  } catch {
    return { ok: false, error: { code: "network", message: "network" } };
  }
  if (!response.ok) {
    let error: ApiError = { code: "server_error", message: response.statusText };
    try {
      const parsed = (await response.json()) as ApiError;
      if (typeof parsed?.code === "string") error = parsed;
    } catch {
      // Keep the fallback envelope.
    }
    return { ok: false, error };
  }
  const list = (await response.json()) as components["schemas"]["ChatAttachmentListDto"];
  return { ok: true, data: list.attachments };
}

// ---- Staff: Visitors inbox ---------------------------------------------------

export function claimThread(threadId: string): Promise<ChatResult<ChatThread>> {
  return call(
    () => api.POST("/chat/threads/{threadId}/claim", { params: { path: { threadId } } }),
  );
}

export function assignThread(
  threadId: string,
  employeeId: string,
): Promise<ChatResult<ChatThread>> {
  return call(
    () =>
      api.POST("/chat/threads/{threadId}/assign", {
        params: { path: { threadId } },
        body: { employeeId },
      }),
  );
}

export function closeThread(
  threadId: string,
  reason: string | null,
): Promise<ChatResult<ChatThread>> {
  return call(
    () =>
      api.POST("/chat/threads/{threadId}/close", {
        params: { path: { threadId } },
        body: { reason },
      }),
  );
}
