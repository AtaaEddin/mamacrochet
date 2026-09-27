using Mamacrochet.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Services;

public enum GuestLinkStatus
{
    Linked,
    AlreadyLinked,
    Conflict,
}

public sealed record GuestLinkResult(
    GuestLinkStatus Status,
    DateTimeOffset? LinkedAt,
    string? LinkedUserId)
{
    public static GuestLinkResult Linked(DateTimeOffset linkedAt) => new(GuestLinkStatus.Linked, linkedAt, null);
    public static GuestLinkResult Conflict(string linkedUserId) => new(GuestLinkStatus.Conflict, null, linkedUserId);
}

/// <summary>
/// Guest→account linking (D14): idempotent, first account wins. Orders
/// (plan 05) and threads (plan 06) join through this table.
/// </summary>
public sealed class GuestLinkService(AppDbContext db)
{
    public static bool IsValidGuestId(string? guestId)
    {
        return guestId is not null && Guid.TryParse(guestId, out var parsed) && parsed.Version == 4;
    }

    public async Task<GuestLinkResult> LinkAsync(string guestId, string userId)
    {
        var existing = await db.GuestAccountLinks.FirstOrDefaultAsync(g => g.GuestId == guestId);
        if (existing is not null)
        {
            return existing.UserId == userId
                ? GuestLinkResult.Linked(existing.LinkedAt)
                : GuestLinkResult.Conflict(existing.UserId);
        }

        var link = new GuestAccountLink(guestId, userId, DateTime.UtcNow);
        db.GuestAccountLinks.Add(link);
        await db.SaveChangesAsync();
        return GuestLinkResult.Linked(link.LinkedAt);
    }
}
