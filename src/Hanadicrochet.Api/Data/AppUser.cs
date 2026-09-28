using Microsoft.AspNetCore.Identity;

namespace Hanadicrochet.Api.Data;

/// <summary>
/// One User entity for every role (plan 03, main D1 spirit: few concepts).
/// Roles are flags, not separate entities: every user is a Customer;
/// <see cref="IsEmployee"/> / <see cref="IsAdmin"/> are granted by an admin.
/// </summary>
public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";

    public string? Phone { get; set; }
    public string? Country { get; set; }

    /// <summary>Preferred UI language: en | ar | tr (profile → Accept-Language).</summary>
    public string Language { get; set; } = "en";

    public string? AvatarUrl { get; set; }

    public bool IsEmployee { get; set; }
    public bool IsAdmin { get; set; }

    /// <summary>Customer→employee assignment (who serves this user's orders).</summary>
    public string? AssignedEmployeeId { get; set; }

    /// <summary>The assigned employee (navigation — never serialized).</summary>
    public AppUser? AssignedEmployee { get; set; }

    /// <summary>Set when an admin issued a temporary password — forced change at next login.</summary>
    public bool MustChangePassword { get; set; }

    /// <summary>Soft deactivation (admin); deactivated users are rejected on the next request.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Soft delete (admin); deleted users vanish from lists and can't sign in.</summary>
    public DateTimeOffset? DeletedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }
}
