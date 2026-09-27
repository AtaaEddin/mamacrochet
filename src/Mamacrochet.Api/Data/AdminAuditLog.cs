namespace Mamacrochet.Api.Data;

/// <summary>
/// Audit trail of sensitive admin actions (plan 03: "audit note on sensitive
/// admin actions"): user create/edit/roles/assignment/activation/deletion
/// and password resets.
/// </summary>
public class AdminAuditLog
{
    public Guid Id { get; set; }
    public DateTimeOffset At { get; set; }

    /// <summary>Admin who performed the action.</summary>
    public string ActorUserId { get; set; } = "";

    /// <summary>User the action targeted (may differ from the actor).</summary>
    public string TargetUserId { get; set; } = "";

    /// <summary>Stable action code, e.g. <c>user.created</c>, <c>password.reset</c>.</summary>
    public string Action { get; set; } = "";

    public string? Note { get; set; }
}
