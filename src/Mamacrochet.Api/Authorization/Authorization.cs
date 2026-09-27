using System.Security.Claims;
using Mamacrochet.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Authorization;

/// <summary>
/// Authorization policies (plan 03). Roles are flags on one User entity, so
/// every policy is evaluated against the database — a deactivated or deleted
/// user is rejected on their next authenticated request, even with a live
/// cookie (no role claims to go stale).
/// </summary>
public static class Policies
{
    /// <summary>Any authenticated, active (not deactivated/deleted/locked) user.</summary>
    public const string Any = "Any";
    public const string Customer = "Customer";
    public const string Employee = "Employee";
    public const string Admin = "Admin";

    public const string RoleEmployee = "employee";
    public const string RoleAdmin = "admin";
}

/// <summary>Authenticated AND active in the database.</summary>
public sealed class ActiveUserRequirement : IAuthorizationRequirement
{
}

/// <summary>Active AND has the given role flag (employee | admin).</summary>
public sealed class RoleFlagRequirement(string role) : IAuthorizationRequirement
{
    public string Role { get; } = role;
}

public sealed class ActiveUserAuthorizationHandler(AppDbContext db) : IAuthorizationHandler
{
    public async Task HandleAsync(AuthorizationHandlerContext context)
    {
        var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null)
        {
            // Anonymous — RequireAuthenticatedUser reports the failure.
            return;
        }

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        var now = DateTime.UtcNow;
        var locked = user?.LockoutEnd is not null && user.LockoutEnd > now;
        var active = user is not null && user.IsActive && user.DeletedAt is null && !locked;

        foreach (var requirement in context.Requirements)
        {
            switch (requirement)
            {
                case ActiveUserRequirement:
                    if (active)
                    {
                        context.Succeed(requirement);
                    }

                    break;

                case RoleFlagRequirement flag when active:
                    var hasFlag = flag.Role == Policies.RoleEmployee
                        ? user!.IsEmployee
                        : user!.IsAdmin;
                    if (hasFlag)
                    {
                        context.Succeed(requirement);
                    }

                    break;
            }
        }
    }
}
