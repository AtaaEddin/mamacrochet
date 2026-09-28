using Hanadicrochet.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Services;

public enum GuestLinkStatus
{
    Linked,
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
/// Guest→account linking (D14): idempotent, first account wins per device.
/// A device (guestId) belongs to exactly one account; an account may link
/// many devices (phone + desktop). Orders (plan 05) and threads (plan 06)
/// join through this table.
/// </summary>
public sealed class GuestLinkService(AppDbContext db)
{
    public static bool IsValidGuestId(string? guestId)
    {
        return guestId is not null && Guid.TryParse(guestId, out var parsed) && parsed.Version == 4;
    }

    public async Task<GuestLinkResult> LinkAsync(string guestId, string userId)
    {
        // One account per device (GuestId is the key): first link wins.
        var existing = await db.GuestAccountLinks.FirstOrDefaultAsync(g => g.GuestId == guestId);
        if (existing is not null && existing.UserId != userId)
        {
            return GuestLinkResult.Conflict(existing.UserId);
        }

        var now = DateTime.UtcNow;
        if (existing is null)
        {
            db.GuestAccountLinks.Add(new GuestAccountLink(guestId, userId, now));
        }

        // D14: confirming = linking to the account. Attribute the device's
        // unowned orders to the account so the order shows its customer,
        // the default handler applies, and confirmed orders are no longer
        // subject to the guest cap or the 7-day auto-cancel (both keyed
        // on CustomerId == null). Runs on every link (idempotent), so a
        // signed-out order placed on an already-linked device is picked
        // up too.
        var unowned = await db.Orders
            .Where(o => o.GuestId == guestId && o.CustomerId == null)
            .ToListAsync();
        foreach (var order in unowned)
        {
            order.CustomerId = userId;
            order.UpdatedAt = now;
        }

        if (existing is null || unowned.Count > 0)
        {
            await db.SaveChangesAsync();
        }
        return GuestLinkResult.Linked(existing?.LinkedAt ?? now);
    }
}
