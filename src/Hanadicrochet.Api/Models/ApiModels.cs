using Hanadicrochet.Api.Data;

namespace Hanadicrochet.Api.Models;

/// <summary>
/// Standard API error envelope — every 4xx/429 response body.
/// The frontend maps <see cref="Code"/> to localized messages.
/// </summary>
public sealed record ApiError(string Code, string Message)
{
    public static ApiError NotFound(string message) => new("not_found", message);
}

/// <summary>Public profile of a user (own profile, admin lists, login result).</summary>
public sealed record UserDto(
    string Id,
    string DisplayName,
    string Email,
    string? Phone,
    string? Country,
    string Language,
    IReadOnlyList<string> Roles,
    string? AvatarUrl,
    string? AssignedEmployeeId,
    string? AssignedEmployeeName,
    bool MustChangePassword,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt)
{
    public static UserDto From(AppUser user)
    {
        return new UserDto(
            user.Id,
            user.DisplayName,
            user.Email ?? "",
            user.Phone,
            user.Country,
            user.Language,
            RolesOf(user),
            user.AvatarUrl,
            user.AssignedEmployeeId,
            user.AssignedEmployee?.DisplayName,
            user.MustChangePassword,
            user.IsActive,
            user.CreatedAt,
            user.LastLoginAt);
    }

    public static IReadOnlyList<string> RolesOf(AppUser user)
    {
        var roles = new List<string> { RoleFlags.Customer };
        if (user.IsEmployee)
        {
            roles.Add(RoleFlags.Employee);
        }

        if (user.IsAdmin)
        {
            roles.Add(RoleFlags.Admin);
        }

        return roles;
    }
}

/// <summary>Role flag values (wire format + DB columns). One user = always
/// a customer; employee/admin are flags an admin grants.</summary>
public static class RoleFlags
{
    public const string Customer = "customer";
    public const string Employee = "employee";
    public const string Admin = "admin";
}

public sealed record CsrfToken(string Token);

public sealed record UserPage(
    IReadOnlyList<UserDto> Items,
    int Total,
    int Page,
    int PageSize);

public sealed record UserCreated(
    UserDto User,
    string TemporaryPassword);

public sealed record GuestLinkResult(DateTimeOffset LinkedAt);

public sealed record PasswordResetResult(string TemporaryPassword);
