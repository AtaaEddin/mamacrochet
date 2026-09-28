namespace Mamacrochet.Api.Data;

/// <summary>
/// Order lifecycle states (plan 05). Plain strings end-to-end (like the
/// other statuses in this codebase) so the OpenAPI spec and the frontend
/// types read exactly like the UI status board.
/// </summary>
public static class OrderStatus
{
    public const string Open = "open";
    public const string InProgress = "in_progress";
    public const string ReadyForPayment = "ready_for_payment";
    public const string Paid = "paid";
    public const string Delivered = "delivered";
    public const string Closed = "closed";
    public const string Cancelled = "cancelled";

    public static readonly string[] All =
        [Open, InProgress, ReadyForPayment, Paid, Delivered, Closed, Cancelled];

    public static bool IsValid(string? status) =>
        status is not null && All.Contains(status);

    public static bool IsTerminal(string status) =>
        status is Closed or Cancelled;
}

/// <summary>
/// Orders (plan 05, decision D1): one Order concept for in-stock purchases
/// and custom pieces. The timeline (OrderEvent) is the single source of
/// truth — it is the customer's live status board AND the admin trace
/// (who worked on what, how long). Files live on disk (D8):
/// {root}/orders/{OrderId}/{attachmentId}.{ext}.
/// </summary>
public class Order
{
    public string Id { get; set; } = Ids.New();

    /// <summary>catalog = in-stock purchase, custom = made to order (D1).</summary>
    public string Kind { get; set; } = "catalog";

    /// <summary>
    /// open → in_progress → ready_for_payment → paid → delivered → closed,
    /// plus cancelled (from open/in_progress). Terminal: closed, cancelled.
    /// </summary>
    public string Status { get; set; } = OrderStatus.Open;

    /// <summary>
    /// The account that owns the order — set when a guest registers at
    /// confirmation (D14); null for guest orders.
    /// </summary>
    public string? CustomerId { get; set; }

    public AppUser? Customer { get; set; }

    /// <summary>
    /// Device guest (v4 GUID, D14): who started the order anonymously.
    /// Kept after linking — it is the device identity for anti-abuse caps.
    /// </summary>
    public string? GuestId { get; set; }

    public string ContactName { get; set; } = "";
    public string ContactPhone { get; set; } = "";

    /// <summary>Optional e-mail (guests may give it; not an account).</summary>
    public string? ContactEmail { get; set; }

    /// <summary>
    /// The product (nullable): what is bought (catalog) or what the custom
    /// piece is based on (custom, "request this as custom").
    /// </summary>
    public string? ProductId { get; set; }

    public Product? Product { get; set; }

    /// <summary>Custom spec text (required for custom kind), notes for catalog.</summary>
    public string? Spec { get; set; }

    /// <summary>Price = amount + currency code (D9); display USD only.</summary>
    public decimal? EstimatedPrice { get; set; }

    /// <summary>Set when the order becomes ready_for_payment (final price).</summary>
    public decimal? FinalPrice { get; set; }

    public string Currency { get; set; } = "USD";

    /// <summary>
    /// Per-order employee (admin). Effective assignee = this, else the
    /// customer's default handler.
    /// </summary>
    public string? AssignedEmployeeId { get; set; }

    public AppUser? AssignedEmployee { get; set; }

    // Rating (customer, after closed; once).
    public byte? Rating { get; set; }
    public string? RatingComment { get; set; }
    public DateTime? RatedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<OrderEvent> Timeline { get; set; } = [];
    public ICollection<OrderAttachment> Attachments { get; set; } = [];
}

/// <summary>
/// One timeline event — the status board entry and the admin trace row.
/// `AdminOnly` marks admin-override reasons: visible in the admin trace
/// only, never on the customer's status board (plan 07 rule 3).
/// </summary>
public class OrderEvent
{
    public string Id { get; set; } = Ids.New();
    public string OrderId { get; set; } = "";

    /// <summary>status | note | assignment | rating | auto.</summary>
    public string Kind { get; set; } = "status";

    /// <summary>For status/auto events: the new status.</summary>
    public string? Status { get; set; }

    public string? Note { get; set; }
    public bool AdminOnly { get; set; }

    /// <summary>Null for system events (auto-cancel).</summary>
    public string? ActorId { get; set; }

    public string ActorName { get; set; } = "";
    public string ActorRole { get; set; } = "system";

    public DateTime At { get; set; }

    public Order? Order { get; set; }
}

/// <summary>
/// An order file (plan 05: samples, WIP photos; plan 07 adds receipt and
/// delivery-proof kinds). Files: {root}/orders/{OrderId}/{Id}.{ext}.
/// </summary>
public class OrderAttachment
{
    public string Id { get; set; } = Ids.New();
    public string OrderId { get; set; } = "";

    /// <summary>sample | wip | receipt | delivery-proof (last two: plan 07).</summary>
    public string Kind { get; set; } = "sample";

    /// <summary>Opaque on-disk name: {Id}.{ext} — ext from magic bytes.</summary>
    public string StoredName { get; set; } = "";

    public string OriginalName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Bytes { get; set; }

    public string? UploadedById { get; set; }

    public AppUser? UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public Order? Order { get; set; }
}
