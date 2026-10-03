namespace Hanadicrochet.Api.Data;

/// <summary>
/// Thread kinds (plan 06): <c>visitor</c> = anonymous guest thread started
/// from the chat surface (D14 — the core idea), <c>order</c> = per-order
/// thread (customer + assigned employee + admins). A visitor thread becomes
/// an order thread when an order is created from it.
/// </summary>
public static class ChatThreadKind
{
    public const string Visitor = "visitor";
    public const string Order = "order";

    public static bool IsValid(string? kind) =>
        kind is not null && (kind == Visitor || kind == Order);
}

/// <summary>
/// One conversation. Guest-first: a visitor thread has no account and no
/// order until one happens (staff "create order from thread", or the guest
/// registers at confirmation — D14). Files of the conversation live on disk
/// (D8): {root}/chat/{ThreadId}/.
/// </summary>
public class ChatThread
{
    public string Id { get; set; } = Ids.New();

    public string Kind { get; set; } = ChatThreadKind.Visitor;

    /// <summary>
    /// Set for order threads, and for visitor threads that were linked to an
    /// order (kept on the thread: the conversation continues there).
    /// </summary>
    public string? OrderId { get; set; }

    public Order? Order { get; set; }

    /// <summary>
    /// The account the thread belongs to — set when a guest registers at
    /// confirmation (D14); null while it is a pure guest thread. A linked
    /// visitor thread stays findable for the account through
    /// GuestAccountLink even before this is set.
    /// </summary>
    public string? CustomerId { get; set; }

    public AppUser? Customer { get; set; }

    /// <summary>
    /// Device (guestId, D14/D16) the visitor thread was started from. Kept
    /// after linking — it is the device identity for anti-abuse.
    /// </summary>
    public string? GuestId { get; set; }

    /// <summary>Staff handling the thread (Visitors inbox: claim/assign).</summary>
    public string? AssignedEmployeeId { get; set; }

    public AppUser? AssignedEmployee { get; set; }

    /// <summary>Display title: the guest's name, else the first words spoken.</summary>
    public string? Subject { get; set; }

    /// <summary>
    /// The customer hid this conversation (archive semantics, NOT a hard
    /// delete — plan 20261003-2254 sub 01): hidden from that customer's
    /// thread list until a send arrives (a staff reply or the customer
    /// re-entering clears it). Staff/admin lists and the admin trace are
    /// never affected; nothing is erased server-side.
    /// </summary>
    public DateTime? CustomerDeletedAt { get; set; }

    public bool IsClosed { get; set; }

    public DateTime? ClosedAt { get; set; }

    /// <summary>Who/what closed it (staff reason or the 30-day auto-close).</summary>
    public string? ClosedReason { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Last activity — the inbox sort key and the auto-close clock.</summary>
    public DateTime? LastMessageAt { get; set; }

    public ICollection<ChatMessage> Messages { get; set; } = [];
}

/// <summary>
/// One chat message. Sender data is snapshotted at send time (the guest's
/// self-declared name, the staff member's display name + role) so history
/// renders even after users change their names or the thread is unlinked.
/// No editing in MVP; <see cref="IsDeleted"/> is the (deferred) admin
/// soft-delete.
/// </summary>
public class ChatMessage
{
    public string Id { get; set; } = Ids.New();

    public string ThreadId { get; set; } = "";

    /// <summary>The sending account (staff or linked customer); null for guest sends.</summary>
    public string? SenderId { get; set; }

    public AppUser? Sender { get; set; }

    /// <summary>The device that sent it (guest), kept with the sender snapshot.</summary>
    public string? SenderGuestId { get; set; }

    /// <summary>Display snapshot of the sender name at send time.</summary>
    public string SenderName { get; set; } = "";

    /// <summary>guest | customer | employee | admin (rendering + "Admin" badge).</summary>
    public string SenderRole { get; set; } = "guest";

    /// <summary>Text body (0..4000; empty for attachment/product-only messages).</summary>
    public string Body { get; set; } = "";

    /// <summary>A work picked in-chat (product message, D21) + display snapshot.</summary>
    public string? ProductId { get; set; }

    public string? ProductName { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime At { get; set; }

    public ChatThread? Thread { get; set; }

    public ICollection<ChatAttachment> Attachments { get; set; } = [];
}

/// <summary>
/// A chat file (plan 06): images or PDF, through the shared file pipeline
/// (D8). Dedicated entity — <c>OrderAttachment</c> requires an order and
/// cannot serve visitor threads. Files: {root}/chat/{ThreadId}/{Id}.{ext}.
/// </summary>
public class ChatAttachment
{
    public string Id { get; set; } = Ids.New();

    /// <summary>Scopes the upload to its thread (the send validates this).</summary>
    public string ThreadId { get; set; } = "";

    public ChatThread? Thread { get; set; }

    /// <summary>Null until the message that references it is sent.</summary>
    public string? MessageId { get; set; }

    public ChatMessage? Message { get; set; }

    /// <summary>Opaque on-disk name: {Id}.{ext} — ext from magic bytes.</summary>
    public string StoredName { get; set; } = "";

    public string OriginalName { get; set; } = "";

    public string ContentType { get; set; } = "";

    public long Bytes { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Per-account last-read marker (plan 06): unread = messages after
/// <see cref="LastReadAt"/> not sent by the account. Guests have no row —
/// they live in the thread and have no unread state.
/// </summary>
public class ChatThreadRead
{
    public string ThreadId { get; set; } = "";

    public string UserId { get; set; } = "";

    public DateTime LastReadAt { get; set; }
}
