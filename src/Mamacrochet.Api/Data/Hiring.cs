namespace Mamacrochet.Api.Data;

/// <summary>
/// Public hiring application (plan 09). One row per e-mail: re-applying
/// updates the same row, and <see cref="Events"/> keeps the status history.
/// Status: <c>new → accepted | declined</c>; a decided row only re-enters via
/// a new application (which resets it to <c>new</c>).
/// </summary>
public class HiringApplication
{
    /// <summary>32-hex id (Guid, no dashes) — plan 04 convention.</summary>
    public string Id { get; set; } = "";

    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string NormalizedEmail { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Country { get; set; } = "";
    public string? Nationality { get; set; }

    /// <summary>Languages spoken (Npgsql <c>text[]</c>).</summary>
    public string[] Languages { get; set; } = [];

    /// <summary>Previous work / experience description.</summary>
    public string? PreviousWork { get; set; }

    /// <summary>Optional free-form message.</summary>
    public string? Message { get; set; }

    public string Status { get; set; } = HiringStatus.New;

    public DateTime AppliedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public DateTime? DecidedAt { get; set; }
    public string? DecidedById { get; set; }
    public string? DecisionNote { get; set; }

    /// <summary>The admin who accepted/declined (Restrict — the trace survives).</summary>
    public AppUser? DecidedBy { get; set; }

    public List<HiringApplicationFile> Files { get; set; } = [];
    public List<HiringApplicationEvent> Events { get; set; } = [];
}

public static class HiringStatus
{
    public const string New = "new";
    public const string Accepted = "accepted";
    public const string Declined = "declined";
}

/// <summary>
/// A previous-work proof file (plan 09): image or PDF, stored with an opaque
/// name, served to admins only.
/// </summary>
public class HiringApplicationFile
{
    public string Id { get; set; } = "";
    public string ApplicationId { get; set; } = "";
    public HiringApplication Application { get; set; } = null!;

    /// <summary>Opaque stored name: <c>{fileId}.(jpg|png|webp|pdf)</c>.</summary>
    public string StoredName { get; set; } = "";

    public string OriginalName { get; set; } = "";
    public long Size { get; set; }
    public string ContentType { get; set; } = "";
    public int SortOrder { get; set; }
}

/// <summary>One row per status change — the application's history.</summary>
public class HiringApplicationEvent
{
    public string Id { get; set; } = "";
    public string ApplicationId { get; set; } = "";
    public HiringApplication Application { get; set; } = null!;

    /// <summary>submitted | re_applied | accepted | declined.</summary>
    public string Kind { get; set; } = "";

    public string? Note { get; set; }

    /// <summary>The admin who acted (null for the public submission itself).</summary>
    public string? ActorId { get; set; }
    public string? ActorName { get; set; }

    public DateTime At { get; set; }
}

public static class HiringEventKind
{
    public const string Submitted = "submitted";
    public const string Reapplied = "re_applied";
    public const string Accepted = "accepted";
    public const string Declined = "declined";
}
