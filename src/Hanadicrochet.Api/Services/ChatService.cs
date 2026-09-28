using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Endpoints;
using Hanadicrochet.Api.Hubs;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// Who may act on a thread — re-verified server-side on EVERY call (REST and
/// hub), never trusted from the client. Admins join any thread (owner
/// requirement); guests act only through a thread token bound to their
/// device (D14/D16).
/// </summary>
public enum ThreadAccess
{
    None,
    Guest,
    Customer,
    Employee,
    Admin,
}

/// <summary>
/// Chat domain rules (plan 06): visitor-thread bootstrap (D14), order
/// threads, access checks, guest rate limits (D16), messages + attachments
/// (shared file pipeline, D8), read markers, the staff Visitors inbox
/// (claim/assign/close), thread→order linking, and the stale-thread +
/// orphan-attachment sweeps.
/// </summary>
public sealed class ChatService(
    AppDbContext db,
    IOptions<UploadsOptions> uploads,
    ChatTokenService tokenService,
    IHubContext<ChatHub> hub,
    ILogger<ChatService> logger)
{
    public const int MaxBodyLength = 4000;
    public const int MaxAttachments = 5;
    public const long MaxFileBytes = 10 * 1024 * 1024; // 10 MB
    public const int GuestMessagesPerMinute = 10;
    public const int MaxMessagePageSize = 100;
    public const int ThreadsPerPage = 50;
    public static readonly TimeSpan StaleAfter = TimeSpan.FromDays(30);
    public static readonly TimeSpan OrphanAttachmentAfter = TimeSpan.FromHours(24);

    /// <summary>
    /// Guest thread token (D24) as a validated (threadId, guestId) pair.
    /// </summary>
    public readonly record struct ValidatedThreadToken(string ThreadId, string GuestId);

    private static readonly object GuestRateLock = new();
    private static readonly Dictionary<string, (long WindowStart, int Count)> GuestWindows = new();

    // ---- Access ------------------------------------------------------------

    public async Task<ThreadAccess> CheckAccessAsync(
        ChatThread thread, AppUser? user, ValidatedThreadToken? token, CancellationToken ct)
    {
        if (user is not null)
        {
            if (user.IsAdmin)
            {
                return ThreadAccess.Admin;
            }

            if (user.Id == thread.AssignedEmployeeId)
            {
                return ThreadAccess.Employee;
            }

            if (user.Id == thread.CustomerId)
            {
                return ThreadAccess.Customer;
            }

            // D14: conversations started from a device linked to this account.
            // Must stay consistent with the thread-list query (same link join).
            if (thread.GuestId is not null
                && await db.GuestAccountLinks.AnyAsync(
                    g => g.UserId == user.Id && g.GuestId == thread.GuestId, ct))
            {
                return ThreadAccess.Customer;
            }

            return ThreadAccess.None;
        }

        if (token is { } t
            && t.ThreadId == thread.Id
            && thread.Kind == ChatThreadKind.Visitor
            && thread.GuestId is not null
            && t.GuestId == thread.GuestId)
        {
            return ThreadAccess.Guest;
        }

        return ThreadAccess.None;
    }

    // ---- Visitor bootstrap (D14) --------------------------------------------

    /// <summary>
    /// Idempotent per device: returns the device's active visitor thread, or
    /// creates one. One active visitor thread per device (D16) — the
    /// filtered unique index backstops the race.
    /// </summary>
    public async Task<VisitorThreadResult> BootstrapVisitorThreadAsync(
        string? guestId, string? name, string? honeypot, CancellationToken ct)
    {
        // Honeypot (D16): bots fill the hidden field — answer warmly, store
        // nothing (a token bound to a fabricated thread authenticates to
        // nothing server-side).
        if (!string.IsNullOrWhiteSpace(honeypot))
        {
            var fakeId = Ids.New();
            return new VisitorThreadResult(
                null,
                new VisitorThreadCreated(
                    new ThreadDto(
                        fakeId, ChatThreadKind.Visitor, "Hello!", false, null,
                        DateTime.UtcNow, null, null, []),
                    "invalid"),
                true);
        }

        if (string.IsNullOrEmpty(guestId) || !GuestLinkService.IsValidGuestId(guestId))
        {
            return new VisitorThreadResult(
                new ApiError("invalid_request", "A guest id is required to start a conversation."),
                null, false);
        }

        var deviceId = guestId.Trim();

        var subject = name?.Trim();
        if (subject is not null && subject.Length is > 0 and < 2)
        {
            return new VisitorThreadResult(
                new ApiError("invalid_request", "Please enter at least 2 characters (or leave the name empty)."),
                null, false);
        }

        if (subject is not null && subject.Length > 80)
        {
            return new VisitorThreadResult(
                new ApiError("invalid_request", "Please keep the name under 80 characters."),
                null, false);
        }

        ChatThread? thread = await FindActiveVisitorThreadAsync(deviceId, ct);
        if (thread is null)
        {
            var now = DateTime.UtcNow;
            thread = new ChatThread
            {
                Kind = ChatThreadKind.Visitor,
                GuestId = deviceId,
                Subject = subject is { Length: > 0 } ? subject : null,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.ChatThreads.Add(thread);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Lost the unique-index race (two tabs / a double mount on the
                // same device). The winner's transaction may still be open —
                // poll briefly for its committed row, then return it.
                ChatThread? winner = null;
                for (var attempt = 0; attempt < 10; attempt++)
                {
                    await Task.Delay(50, ct);
                    winner = await FindActiveVisitorThreadAsync(deviceId, ct);
                    if (winner is not null)
                    {
                        break;
                    }
                }

                if (winner is null)
                {
                    throw;
                }

                thread = winner;
            }
        }

        return new VisitorThreadResult(
            null,
            new VisitorThreadCreated(
                ToThreadDto(thread, null),
                tokenService.CreateThreadToken(thread.Id, deviceId)),
            false);
    }

    private async Task<ChatThread?> FindActiveVisitorThreadAsync(
        string guestId, CancellationToken ct)
    {
        return await db.ChatThreads.FirstOrDefaultAsync(
            t => t.Kind == ChatThreadKind.Visitor && t.GuestId == guestId && !t.IsClosed,
            ct);
    }

    /// <summary>
    /// The order's thread, created if missing (plan 05 calls this inside
    /// order creation). Added to the same context — the caller's
    /// SaveChangesAsync persists both. Idempotent while the context is open.
    /// </summary>
    public ChatThread EnsureOrderThreadAdded(Order order)
    {
        var existing = db.ChatThreads.Local.FirstOrDefault(t => t.OrderId == order.Id);
        if (existing is not null)
        {
            return existing;
        }

        var now = DateTime.UtcNow;
        var thread = new ChatThread
        {
            Kind = ChatThreadKind.Order,
            OrderId = order.Id,
            CustomerId = order.CustomerId,
            GuestId = order.GuestId,
            AssignedEmployeeId = order.AssignedEmployeeId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.ChatThreads.Add(thread);
        return thread;
    }

    /// <summary>
    /// Staff "create order from thread": the visitor thread becomes the
    /// order's thread (the conversation continues there).
    /// </summary>
    public async Task<ChatThreadResult> LinkThreadToOrderAsync(
        string threadId, string orderId, CancellationToken ct)
    {
        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatThreadResult(ApiError.NotFound("conversation_not_found"), null);
        }

        if (thread.OrderId == orderId)
        {
            return new ChatThreadResult(null, ToThreadDto(thread, null));
        }

        if (thread.OrderId is not null)
        {
            return new ChatThreadResult(
                new ApiError("conflict", "This conversation is already linked to another order."),
                null);
        }

        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new ChatThreadResult(ApiError.NotFound("order_not_found"), null);
        }

        var now = DateTime.UtcNow;
        thread.Kind = ChatThreadKind.Order;
        thread.OrderId = orderId;
        thread.CustomerId = order.CustomerId;
        thread.AssignedEmployeeId = order.AssignedEmployeeId;
        thread.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await BroadcastAsync(thread.Id, "threadUpdated", ToThreadDto(thread, null), ct);
        return new ChatThreadResult(null, ToThreadDto(thread, null));
    }

    // ---- Thread list + detail -----------------------------------------------

    public async Task<ChatThreadListResult> ListThreadsAsync(
        AppUser user, string? kind, bool? includeClosed, int page, CancellationToken ct)
    {
        if (kind is not null && !ChatThreadKind.IsValid(kind))
        {
            return new ChatThreadListResult(
                new ApiError("invalid_request", "kind must be 'visitor' or 'order'."), null);
        }

        page = Math.Clamp(page, 1, 1000);
        IQueryable<ChatThread> q = db.ChatThreads.AsNoTracking();
        if (!user.IsAdmin)
        {
            // Employees: what they handle. Customers: their own threads PLUS
            // visitor threads started from a device linked to their account
            // (D14 — register at confirmation, the thread appears).
            if (user.IsEmployee)
            {
                // Assigned conversations + unclaimed visitor threads (the
                // staff “Visitors” inbox, D14 — anyone may claim, first wins).
                q = q.Where(t => t.AssignedEmployeeId == user.Id
                    || (t.Kind == ChatThreadKind.Visitor && t.AssignedEmployeeId == null));
            }
            else
            {
                var linkedGuestIds = await db.GuestAccountLinks
                    .Where(g => g.UserId == user.Id)
                    .Select(g => g.GuestId)
                    .ToListAsync(ct);
                q = linkedGuestIds.Count == 0
                    ? q.Where(t => t.CustomerId == user.Id)
                    : q.Where(t => t.CustomerId == user.Id
                        || linkedGuestIds.Contains(t.GuestId ?? ""));
            }
        }

        if (kind is not null)
        {
            q = q.Where(t => t.Kind == kind);
        }

        if (includeClosed is false)
        {
            q = q.Where(t => !t.IsClosed);
        }
        else if (includeClosed is true)
        {
            q = q.Where(t => t.IsClosed);
        }

        var total = await q.CountAsync(ct);
        var threads = await q
            .OrderByDescending(t => t.LastMessageAt ?? t.CreatedAt)
            .ThenByDescending(t => t.CreatedAt)
            .Skip((page - 1) * ThreadsPerPage)
            .Take(ThreadsPerPage)
            .ToListAsync(ct);

        var items = await BuildThreadItemsAsync(threads, user, ct);
        return new ChatThreadListResult(null, new ChatThreadListDto(
            items, page, Math.Max(1, (total + ThreadsPerPage - 1) / ThreadsPerPage)));
    }

    private async Task<List<ThreadListItemDto>> BuildThreadItemsAsync(
        List<ChatThread> threads, AppUser user, CancellationToken ct)
    {
        if (threads.Count == 0)
        {
            return [];
        }

        var ids = threads.Select(t => t.Id).ToList();

        // Last message per thread (preview) — one indexed query: a correlated
        // scalar subquery (MAX at per thread) picks the newest non-deleted
        // message of each thread in a single round trip. (A local-list
        // `Any(...)` join is not translatable.)
        var previews = (await db.ChatMessages
            .Include(m => m.Attachments)
            .Where(m => !m.IsDeleted
                && ids.Contains(m.ThreadId)
                && m.At == db.ChatMessages
                    .Where(x => !x.IsDeleted && x.ThreadId == m.ThreadId)
                    .Select(x => x.At)
                    .Max())
            .ToListAsync(ct))
            .GroupBy(m => m.ThreadId)
            .ToDictionary(g => g.Key, g => g.First());

        // Unread per thread — one grouped query, not one count per thread:
        // the last-read marker (one row per (user, thread)) is left-joined
        // onto the non-deleted messages sent by someone else; a missing
        // marker counts as "never read" (the old per-thread behaviour).
        var unreadCounts = (await db.ChatMessages
            .AsNoTracking()
            .Where(m => ids.Contains(m.ThreadId)
                && !m.IsDeleted
                && m.SenderId != user.Id)
            .GroupJoin(
                db.ChatThreadReads.AsNoTracking().Where(r => r.UserId == user.Id),
                m => m.ThreadId,
                r => r.ThreadId,
                (m, read) => new { m, Read = read.FirstOrDefault() })
            .Where(x => x.Read == null || x.m.At > x.Read.LastReadAt)
            .GroupBy(x => x.m.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() })
            .ToListAsync(ct))
            .ToDictionary(x => x.ThreadId, x => x.Count);

        var orderIds = threads
            .Where(t => t.OrderId is not null)
            .Select(t => t.OrderId!)
            .Distinct()
            .ToList();
        var orderStatuses = await db.Orders
            .Where(o => orderIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => o.Status, ct);

        var employeeIds = threads
            .Where(t => t.AssignedEmployeeId is not null)
            .Select(t => t.AssignedEmployeeId!)
            .Distinct()
            .ToList();
        var employeeNames = await db.Users
            .Where(u => employeeIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        var items = new List<ThreadListItemDto>(threads.Count);
        foreach (var thread in threads)
        {
            items.Add(new ThreadListItemDto(
                thread.Id,
                thread.Kind,
                thread.Subject,
                thread.IsClosed,
                thread.LastMessageAt,
                previews.TryGetValue(thread.Id, out var last) ? PreviewOf(last) : null,
                unreadCounts.TryGetValue(thread.Id, out var unread) ? unread : 0,
                thread.OrderId is null || !orderStatuses.TryGetValue(thread.OrderId, out var status)
                    ? null
                    : status,
                thread.AssignedEmployeeId is null
                    || !employeeNames.TryGetValue(thread.AssignedEmployeeId, out var assignee)
                    ? null
                    : assignee));
        }

        return items;
    }

    private static MessagePreviewDto PreviewOf(ChatMessage m)
    {
        var text = m.Body.Length > 0
            ? (m.Body.Length <= 80 ? m.Body : m.Body[..80] + "…")
            : null;
        return new MessagePreviewDto(
            text,
            m.SenderName,
            m.SenderRole,
            m.Attachments.Count > 0,
            m.ProductName,
            m.At);
    }

    public async Task<ChatThreadResult> GetThreadAsync(
        string threadId, AppUser? user, ValidatedThreadToken? token, CancellationToken ct)
    {
        var thread = await db.ChatThreads
            .Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatThreadResult(ApiError.NotFound("conversation_not_found"), null);
        }

        if (await CheckAccessAsync(thread, user, token, ct) is ThreadAccess.None)
        {
            return new ChatThreadResult(
                new ApiError("forbidden", "You do not have access to this conversation."),
                null);
        }

        return new ChatThreadResult(null, ToThreadDto(thread, user));
    }

    private ThreadDto ToThreadDto(ChatThread thread, AppUser? currentUser)
    {
        var participants = new List<ChatParticipantDto>();
        var customerName = thread.Customer?.DisplayName
            ?? (thread.Kind == ChatThreadKind.Visitor ? thread.Subject : thread.Order?.ContactName);
        if (customerName is { Length: > 0 })
        {
            participants.Add(new ChatParticipantDto(
                customerName,
                thread.Kind == ChatThreadKind.Visitor ? "guest" : "customer"));
        }

        var assigneeName = thread.AssignedEmployee?.DisplayName
            ?? (thread.Kind == ChatThreadKind.Visitor ? null : thread.Order?.AssignedEmployee?.DisplayName);
        if (assigneeName is { Length: > 0 } && assigneeName != currentUser?.DisplayName)
        {
            participants.Add(new ChatParticipantDto(assigneeName, "employee"));
        }

        return new ThreadDto(
            thread.Id,
            thread.Kind,
            thread.Subject,
            thread.IsClosed,
            thread.ClosedReason,
            thread.CreatedAt,
            thread.LastMessageAt,
            thread.Order is null ? null : new ChatOrderRefDto(thread.Order.Id, thread.Order.Status),
            participants);
    }

    // ---- Messages ------------------------------------------------------------

    public async Task<ChatMessagePageResult> ListMessagesAsync(
        string threadId,
        AppUser? user,
        ValidatedThreadToken? token,
        string? before,
        string? after,
        int limit,
        CancellationToken ct)
    {
        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatMessagePageResult(ApiError.NotFound("conversation_not_found"), null);
        }

        if (await CheckAccessAsync(thread, user, token, ct) is ThreadAccess.None)
        {
            return new ChatMessagePageResult(
                new ApiError("forbidden", "You do not have access to this conversation."),
                null);
        }

        limit = Math.Clamp(limit <= 0 ? 50 : limit, 1, MaxMessagePageSize);
        var baseQuery = db.ChatMessages.AsNoTracking()
            .Include(m => m.Attachments)
            .Where(m => m.ThreadId == threadId);

        IQueryable<ChatMessage> query;
        bool hasNewer;
        if (!string.IsNullOrEmpty(before))
        {
            var anchor = await baseQuery.FirstAsync(m => m.Id == before, ct);
            query = baseQuery
                .Where(m => m.At < anchor.At
                    || (m.At == anchor.At && string.CompareOrdinal(m.Id, anchor.Id) < 0))
                .OrderByDescending(m => m.At)
                .ThenByDescending(m => m.Id);
            hasNewer = true; // the caller moved backwards — there are newer messages
        }
        else if (!string.IsNullOrEmpty(after))
        {
            var anchor = await baseQuery.FirstAsync(m => m.Id == after, ct);
            query = baseQuery
                .Where(m => m.At > anchor.At
                    || (m.At == anchor.At && string.CompareOrdinal(m.Id, anchor.Id) > 0))
                .OrderBy(m => m.At)
                .ThenBy(m => m.Id);
            hasNewer = false; // polling forward: HasNewer says "more beyond the page"
        }
        else
        {
            // Initial load: the newest page, oldest first.
            query = baseQuery
                .OrderByDescending(m => m.At)
                .ThenByDescending(m => m.Id);
            hasNewer = false;
        }

        var fetched = await query.Take(limit + 1).ToListAsync(ct);
        var hasOlder = fetched.Count > limit;
        if (fetched.Count > limit)
        {
            fetched.RemoveAt(fetched.Count - 1);
        }

        if (string.IsNullOrEmpty(before))
        {
            fetched.Reverse(); // ascending for rendering
        }

        return new ChatMessagePageResult(null, new MessagePageDto(
            fetched.Select(m => ToMessageDto(thread, m)).ToList(),
            hasOlder,
            hasNewer));
    }

    public async Task<ChatMessageResult> SendMessageAsync(
        string threadId,
        AppUser? user,
        ValidatedThreadToken? token,
        string? body,
        string? productId,
        IReadOnlyList<string>? attachmentIds,
        string? clientId,
        CancellationToken ct)
    {
        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatMessageResult(ApiError.NotFound("conversation_not_found"), null);
        }

        var access = await CheckAccessAsync(thread, user, token, ct);
        if (access is ThreadAccess.None)
        {
            return new ChatMessageResult(
                new ApiError("forbidden", "You do not have access to this conversation."),
                null);
        }

        if (thread.IsClosed && access is not ThreadAccess.Admin)
        {
            return new ChatMessageResult(
                new ApiError("conflict", "This conversation is closed."),
                null);
        }

        var text = body?.Trim() ?? "";
        var work = productId?.Trim();
        var attachments = attachmentIds is null ? [] : attachmentIds;
        if (text.Length is 0 && work is null && attachments.Count == 0)
        {
            return new ChatMessageResult(
                new ApiError("invalid_request", "Write a message, or pick a work or a file first."),
                null);
        }

        if (text.Length > MaxBodyLength)
        {
            return new ChatMessageResult(
                new ApiError("invalid_request", $"Messages are at most {MaxBodyLength} characters."),
                null);
        }

        // D16: per-device guest message cap (the global limiter covers per-IP).
        if (access is ThreadAccess.Guest && !TryPassGuestRateLimit(token!.Value.GuestId))
        {
            return new ChatMessageResult(
                new ApiError("rate_limited", "You are sending very fast — please slow down a little."),
                null);
        }

        string? productName = null;
        if (work is not null)
        {
            var product = await db.Products.AsNoTracking()
                .Include(p => p.Translations)
                .FirstOrDefaultAsync(
                    p => p.Id == work && p.DeletedAt == null && p.IsListed, ct);
            if (product is null)
            {
                return new ChatMessageResult(
                    new ApiError("not_found", "That work is not available."), null);
            }

            productName = product.Translations
                .FirstOrDefault(t => t.Language == "en")?.Title
                ?? product.Translations.FirstOrDefault()?.Title;
        }

        List<ChatAttachment> files = [];
        if (attachments.Count > 0)
        {
            if (attachments.Count > MaxAttachments)
            {
                return new ChatMessageResult(
                    new ApiError("invalid_request",
                        $"A message can carry at most {MaxAttachments} files."),
                    null);
            }

            var wanted = attachments.Distinct(StringComparer.Ordinal).ToList();
            files = await db.ChatAttachments
                .Where(a => a.ThreadId == threadId && a.MessageId == null
                    && wanted.Contains(a.Id))
                .ToListAsync(ct);
            if (files.Count != wanted.Count)
            {
                return new ChatMessageResult(
                    new ApiError("invalid_request", "One or more files are not valid for this conversation."),
                    null);
            }
        }

        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            ThreadId = threadId,
            Body = text,
            ProductId = work,
            ProductName = productName,
            At = now,
        };
        if (user is not null)
        {
            message.SenderId = user.Id;
            message.SenderName = user.DisplayName;
            message.SenderRole = user.IsAdmin
                ? "admin"
                : user.IsEmployee ? "employee" : "customer";
        }
        else
        {
            message.SenderGuestId = token!.Value.GuestId;
            message.SenderName = thread.Subject is { Length: >= 2 } ? thread.Subject : "Visitor";
            message.SenderRole = "guest";
        }

        foreach (var file in files)
        {
            file.MessageId = message.Id;
            message.Attachments.Add(file);
        }

        thread.LastMessageAt = now;
        thread.UpdatedAt = now;
        // A named visitor thread is friendlier in inboxes: a guest thread
        // without a name takes its first words.
        if (thread.Kind is ChatThreadKind.Visitor && !thread.IsClosed
            && string.IsNullOrWhiteSpace(thread.Subject) && text.Length > 0)
        {
            thread.Subject = text.Length <= 60 ? text : text[..60];
        }

        db.ChatMessages.Add(message);
        await db.SaveChangesAsync(ct);

        var dto = ToMessageDto(thread, message, clientId);
        await BroadcastAsync(thread.Id, "newMessage", dto, ct);
        return new ChatMessageResult(null, dto);
    }

    /// <summary>
    /// Per-device guest message budget (D16): fixed 60 s window, single
    /// instance (no Redis — D9).
    /// </summary>
    private static bool TryPassGuestRateLimit(string guestId)
    {
        const long WindowMs = 60_000;
        lock (GuestRateLock)
        {
            var now = Environment.TickCount64;
            var window = GuestWindows.TryGetValue(guestId, out var w) && now - w.WindowStart < WindowMs
                ? w
                : (WindowStart: now, Count: 0);
            if (window.Count >= GuestMessagesPerMinute)
            {
                return false;
            }

            GuestWindows[guestId] = (window.WindowStart, window.Count + 1);
            return true;
        }
    }

    public async Task<bool> MarkReadAsync(
        string threadId, AppUser user, CancellationToken ct)
    {
        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return false;
        }

        if (await CheckAccessAsync(thread, user, token: null, ct) is ThreadAccess.None)
        {
            return false;
        }

        var readAt = DateTime.UtcNow;
        var marker = await db.ChatThreadReads
            .FirstOrDefaultAsync(r => r.ThreadId == threadId && r.UserId == user.Id, ct);
        if (marker is null)
        {
            db.ChatThreadReads.Add(new ChatThreadRead
            {
                ThreadId = threadId,
                UserId = user.Id,
                LastReadAt = readAt,
            });
        }
        else
        {
            marker.LastReadAt = readAt;
        }

        await db.SaveChangesAsync(ct);
        await BroadcastAsync(threadId, "threadRead", new { threadId, readAt }, ct);
        return true;
    }

    // ---- Staff: Visitors inbox ------------------------------------------------

    public async Task<ChatThreadResult> ClaimThreadAsync(
        string threadId, AppUser employee, CancellationToken ct)
    {
        var (error, thread) = await LoadStaffThreadAsync(threadId, employee, ct);
        if (error is not null || thread is null)
        {
            return new ChatThreadResult(error, null);
        }

        if (thread.Kind is not ChatThreadKind.Visitor)
        {
            return new ChatThreadResult(
                new ApiError("conflict", "Only visitor conversations can be claimed — order threads follow their order."),
                null);
        }

        thread.AssignedEmployeeId = employee.Id;
        thread.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await BroadcastAsync(thread.Id, "threadUpdated", ToThreadDto(thread, employee), ct);
        return new ChatThreadResult(null, ToThreadDto(thread, employee));
    }

    public async Task<ChatThreadResult> AssignThreadAsync(
        string threadId, AppUser admin, string employeeId, CancellationToken ct)
    {
        if (!admin.IsAdmin)
        {
            return new ChatThreadResult(
                new ApiError("forbidden", "Only an admin can assign a conversation."), null);
        }

        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatThreadResult(ApiError.NotFound("conversation_not_found"), null);
        }

        var employee = await db.Users
            .FirstOrDefaultAsync(u => u.Id == employeeId && u.IsActive && u.DeletedAt == null, ct);
        if (employee is null || (!employee.IsEmployee && !employee.IsAdmin))
        {
            return new ChatThreadResult(
                new ApiError("not_found", "That person is not an employee."), null);
        }

        thread.AssignedEmployeeId = employee.Id;
        thread.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await BroadcastAsync(thread.Id, "threadUpdated", ToThreadDto(thread, admin), ct);
        return new ChatThreadResult(null, ToThreadDto(thread, admin));
    }

    public async Task<ChatThreadResult> CloseThreadAsync(
        string threadId, AppUser staff, string? reason, CancellationToken ct)
    {
        var (error, thread) = await LoadStaffThreadAsync(threadId, staff, ct);
        if (error is not null || thread is null)
        {
            return new ChatThreadResult(error, null);
        }

        if (thread.IsClosed)
        {
            return new ChatThreadResult(
                new ApiError("conflict", "This conversation is already closed."), null);
        }

        var note = reason?.Trim();
        if (note is not null && note.Length > 500)
        {
            return new ChatThreadResult(
                new ApiError("invalid_request", "Please keep the reason under 500 characters."),
                null);
        }

        thread.IsClosed = true;
        thread.ClosedAt = DateTime.UtcNow;
        thread.ClosedReason = note;
        thread.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await BroadcastAsync(thread.Id, "threadUpdated", ToThreadDto(thread, staff), ct);
        return new ChatThreadResult(null, ToThreadDto(thread, staff));
    }

    private async Task<(ApiError? Error, ChatThread? Thread)> LoadStaffThreadAsync(
        string threadId, AppUser staff, CancellationToken ct)
    {
        if (!staff.IsEmployee && !staff.IsAdmin)
        {
            return (new ApiError("forbidden", "Staff only."), null);
        }

        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        return thread is null
            ? (ApiError.NotFound("conversation_not_found"), null)
            : (null, thread);
    }

    // ---- Attachments (shared file pipeline, D8) --------------------------------

    public async Task<ChatAttachmentListResult> UploadAttachmentsAsync(
        string threadId,
        AppUser? user,
        ValidatedThreadToken? token,
        IReadOnlyList<IFormFile> files,
        CancellationToken ct)
    {
        var thread = await db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId, ct);
        if (thread is null)
        {
            return new ChatAttachmentListResult(ApiError.NotFound("conversation_not_found"), null);
        }

        var access = await CheckAccessAsync(thread, user, token, ct);
        if (access is ThreadAccess.None)
        {
            return new ChatAttachmentListResult(
                new ApiError("forbidden", "You do not have access to this conversation."), null);
        }

        if (thread.IsClosed && access is not ThreadAccess.Admin)
        {
            return new ChatAttachmentListResult(
                new ApiError("conflict", "This conversation is closed."), null);
        }

        if (files.Count == 0 || files.Count > MaxAttachments)
        {
            return new ChatAttachmentListResult(
                new ApiError("invalid_request",
                    $"Upload between 1 and {MaxAttachments} files."),
                null);
        }

        var directory = Path.Combine(uploads.Value.Root, "chat", threadId);
        Directory.CreateDirectory(directory);

        var created = new List<ChatAttachment>();
        var written = new List<string>();
        try
        {
            foreach (var file in files)
            {
                if (file.Length == 0 || file.Length > MaxFileBytes)
                {
                    return FailUpload(
                        written,
                        new ApiError("file_too_big",
                            "Each file must be between 1 byte and 10 MB."));
                }

                await using var buffer = new MemoryStream((int)file.Length);
                await file.CopyToAsync(buffer, ct);
                var fileKind = FileSignatures.DetectAccepted(
                    buffer.GetBuffer()!, (int)buffer.Length, FileSignatures.AllowedKinds.ImagesGifAndPdf);
                if (fileKind is null)
                {
                    return FailUpload(
                        written,
                        new ApiError("unsupported_file_type",
                            "Only images (JPG, PNG, WebP, GIF) and PDF files are allowed."));
                }

                var (extension, contentType) = FileSignatures.Info(fileKind.Value);
                var attachment = new ChatAttachment
                {
                    ThreadId = threadId,
                    StoredName = $"{Ids.New()}{extension}",
                    OriginalName = string.IsNullOrWhiteSpace(file.FileName)
                        ? "file"
                        : file.FileName.Length <= 200 ? file.FileName : file.FileName[^200..],
                    ContentType = contentType,
                    Bytes = file.Length,
                    CreatedAt = DateTime.UtcNow,
                };
                var path = Path.Combine(directory, attachment.StoredName);
                await File.WriteAllBytesAsync(path, buffer.ToArray(), ct);
                written.Add(path);
                created.Add(attachment);
                db.ChatAttachments.Add(attachment);
            }

            await db.SaveChangesAsync(ct);
            return new ChatAttachmentListResult(null, new ChatAttachmentListDto(
                created.Select(a => ToAttachmentDto(thread, a)).ToList()));
        }
        catch (DbUpdateException)
        {
            foreach (var path in written)
            {
                try
                {
                    File.Delete(path);
                }
                catch (IOException)
                {
                    // Best effort — the sweep's orphan purge picks the rest up.
                }
            }

            throw;
        }

        ChatAttachmentListResult FailUpload(List<string> writtenPaths, ApiError error)
        {
            foreach (var path in writtenPaths)
            {
                try
                {
                    File.Delete(path);
                }
                catch (IOException)
                {
                }
            }

            return new ChatAttachmentListResult(error, null);
        }
    }

    // ---- Sweeps (lazy + 24 h, D9: no busy workers) -----------------------------

    /// <summary>
    /// Auto-close visitor threads idle for 30 days (D16). Runs in the daily
    /// sweep and lazily before the staff inbox list.
    /// </summary>
    public async Task<int> CloseStaleVisitorThreadsAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow - StaleAfter;
        var stale = await db.ChatThreads
            .Where(t => t.Kind == ChatThreadKind.Visitor
                && !t.IsClosed
                && (t.LastMessageAt == null || t.LastMessageAt < cutoff))
            .ToListAsync(ct);
        if (stale.Count == 0)
        {
            return 0;
        }

        var now = DateTime.UtcNow;
        foreach (var thread in stale)
        {
            thread.IsClosed = true;
            thread.ClosedAt = now;
            thread.ClosedReason = "auto_inactivity";
            thread.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
        return stale.Count;
    }

    /// <summary>
    /// Delete attachments uploaded but never attached to a message (24 h).
    /// Daily sweep only (touches the file system).
    /// </summary>
    public async Task<int> PurgeOrphanAttachmentsAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow - OrphanAttachmentAfter;
        var orphans = await db.ChatAttachments
            .Where(a => a.MessageId == null && a.CreatedAt < cutoff)
            .ToListAsync(ct);
        if (orphans.Count == 0)
        {
            return 0;
        }

        var removed = 0;
        foreach (var orphan in orphans)
        {
            var path = Path.Combine(uploads.Value.Root, "chat", orphan.ThreadId, orphan.StoredName);
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }

                removed++;
            }
            catch (IOException ex)
            {
                logger.LogWarning(ex, "Chat sweep: could not delete {Path}.", path);
            }

            db.ChatAttachments.Remove(orphan);
        }

        await db.SaveChangesAsync(ct);
        return removed;
    }

    // ---- DTO mapping -------------------------------------------------------------

    internal ChatMessageDto ToMessageDto(ChatThread thread, ChatMessage message, string? clientId = null)
    {
        var attachments = message.Attachments.Count == 0
            ? (IReadOnlyList<ChatAttachmentDto>)[]
            : message.Attachments
                .OrderBy(a => a.CreatedAt)
                .Select(a => ToAttachmentDto(thread, a))
                .ToList();
        return new ChatMessageDto(
            message.Id,
            message.At,
            message.SenderName,
            message.SenderRole,
            message.IsDeleted ? "" : message.Body,
            message.ProductId,
            message.ProductName,
            message.IsDeleted,
            attachments,
            clientId);
    }

    private ChatAttachmentDto ToAttachmentDto(ChatThread thread, ChatAttachment attachment)
    {
        var (exp, sig) = tokenService.CreateFileSignature(thread.Id, attachment.StoredName);
        return new ChatAttachmentDto(
            attachment.Id,
            $"/files/chat/{thread.Id}/{attachment.StoredName}?sig={sig}&exp={exp}",
            attachment.ContentType,
            attachment.OriginalName,
            attachment.Bytes);
    }

    private async Task BroadcastAsync(
        string threadId, string method, object payload, CancellationToken ct)
    {
        try
        {
            await hub.Clients.Group(ChatHub.GroupName(threadId)).SendCoreAsync(method, [payload], ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Chat broadcast {Method} to thread {ThreadId} failed.", method, threadId);
        }
    }
}
