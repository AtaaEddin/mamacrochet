namespace Hanadicrochet.Api.Data;

/// <summary>
/// Links a guest device (<c>guestId</c>, a UUID v4 the frontend keeps in
/// localStorage — D14/D16) to the account that confirmed at checkout.
/// First account link wins; plans 05/06 join orders/threads through it.
/// </summary>
public class GuestAccountLink
{
    public string GuestId { get; set; } = "";
    public string UserId { get; set; } = "";
    public DateTimeOffset LinkedAt { get; set; }

    /// <summary>The linked account (navigation — never serialized).</summary>
    public AppUser? User { get; set; }

    public GuestAccountLink()
    {
    }

    public GuestAccountLink(string guestId, string userId, DateTimeOffset linkedAt)
    {
        GuestId = guestId;
        UserId = userId;
        LinkedAt = linkedAt;
    }
}
