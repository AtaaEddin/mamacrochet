import { toApiError, type ApiError } from "@/lib/api/errors";
import {
  Chat,
  Staff,
  type ChatAttachmentDto as ChatAttachment,
  type ChatAttachmentListDto,
  type ChatMessageDto as ChatMessage,
  type ChatOrderRefDto as ChatOrderRef,
  type ChatParticipantDto as ChatParticipant,
  type ChatThreadListDto as ChatThreadPage,
  type CustomerDto,
  type CustomerPageDto,
  type MessagePageDto as ChatMessagePage,
  type MessagePreviewDto as ChatPreview,
  type ThreadDto as ChatThread,
  type ThreadListItemDto as ChatThreadListItem,
  type VisitorThreadCreated,
} from "@/lib/api/generated-client";

/**
 * Chat REST (plan 06) through the generated per-operation SDK (plan
 * 20261003-1303) — every call is a typed method, including the attachment
 * upload (multipart body object, serialized by the SDK).
 *
 * Auth: the shared client's `hc.auth` cookie (signed-in users, CSRF wired
 * by `browserFetch`) OR a guest thread token sent as the `X-Chat-Token`
 * header (visitor threads — the API exempts those requests from CSRF and
 * verifies the token itself). One `Auth` shape keeps every call site tidy.
 */

export type {
  ChatAttachment,
  ChatMessage,
  ChatMessagePage,
  ChatOrderRef,
  ChatParticipant,
  ChatPreview,
  ChatThread,
  ChatThreadListItem,
  ChatThreadPage,
  CustomerDto as StaffCustomer,
};

export type ChatResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Cookie auth is implicit; a guest thread is passed by token. */
export type Auth = { token?: string };

/** The `X-Chat-Token` header for guest threads; undefined for cookie auth. */
function authHeaders(auth: Auth): Record<string, string> | undefined {
  return auth.token ? { "X-Chat-Token": auth.token } : undefined;
}

/**
 * Wraps a generated SDK call in the `ChatResult` envelope. The fetch client
 * resolves to `{ data, error }` (fields style): `data` on success, the
 * parsed `ApiError` envelope on declared error statuses. A REJECTED promise
 * (network failure, abort) is the only case where no response exists.
 */
async function call<T>(
  run: () => Promise<{ data?: T; error?: unknown }>,
): Promise<ChatResult<T>> {
  let res: { data?: T; error?: unknown };
  try {
    res = await run();
  } catch {
    return { ok: false, error: { code: "network", message: "network" } };
  }
  if (res.error) {
    return { ok: false, error: toApiError(res.error, "Something went wrong.") };
  }
  return { ok: true, data: res.data as T };
}

// ---- Guest bootstrap -------------------------------------------------------

export function bootstrapVisitorThread(guestId: string) {
  return call<VisitorThreadCreated>(() =>
    Chat.bootstrapVisitorThread({
      body: {
        guestId,
        name: null,
        website: null,
      },
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
  return call(() =>
    Chat.createThread({
      body: {
        subject: body.subject ?? null,
        customerId: body.customerId ?? null,
      },
    }),
  );
}

/**
 * Staff customer search — the picker behind the staff "New conversation"
 * (display name / phone / email, active customers only).
 */
export function searchStaffCustomers(
  search: string,
  page = 1,
): Promise<ChatResult<CustomerPageDto>> {
  return call(() => Staff.searchCustomers({ query: { search, page } }));
}

export function fetchThread(
  threadId: string,
  auth: Auth,
): Promise<ChatResult<ChatThread>> {
  return call(() =>
    Chat.getThread({ path: { threadId }, headers: authHeaders(auth) }),
  );
}

export function fetchThreads(params: {
  kind?: "visitor" | "order";
  closed?: boolean;
  page?: number;
} = {}): Promise<ChatResult<ChatThreadPage>> {
  return call(() =>
    Chat.listThreads({
      query: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.closed !== undefined ? { closed: params.closed } : {}),
        page: params.page ?? 1,
      },
    }),
  );
}

export function markThreadRead(threadId: string): Promise<boolean> {
  return call<void>(() =>
    Chat.markThreadRead({ path: { threadId } }),
  ).then((r) => r.ok);
}

// ---- Messages ----------------------------------------------------------------

export function fetchThreadMessages(
  threadId: string,
  auth: Auth,
  cursor: { before?: string; after?: string; limit?: number } = {},
): Promise<ChatResult<ChatMessagePage>> {
  return call(() =>
    Chat.listMessages({
      path: { threadId },
      query: {
        before: cursor.before,
        after: cursor.after,
        limit: cursor.limit ?? 50,
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
  return call(() =>
    Chat.sendMessage({
      path: { threadId },
      headers: authHeaders(auth),
      body: {
        body: body.body,
        productId: body.productId ?? null,
        attachmentIds: body.attachmentIds ?? null,
        clientId: body.clientId,
      },
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
  const r = await call<ChatAttachmentListDto>(() =>
    Chat.uploadAttachments({
      path: { threadId },
      body: { files },
      headers: authHeaders(auth),
    }),
  );
  return r.ok ? { ok: true, data: r.data.attachments } : r;
}

// ---- Staff: Visitors inbox ---------------------------------------------------

export function claimThread(threadId: string): Promise<ChatResult<ChatThread>> {
  return call(() => Chat.claimThread({ path: { threadId } }));
}

export function assignThread(
  threadId: string,
  employeeId: string,
): Promise<ChatResult<ChatThread>> {
  return call(() =>
    Chat.assignThread({ path: { threadId }, body: { employeeId } }),
  );
}

export function closeThread(
  threadId: string,
  reason: string | null,
): Promise<ChatResult<ChatThread>> {
  return call(() =>
    Chat.closeThread({ path: { threadId }, body: { reason } }),
  );
}
