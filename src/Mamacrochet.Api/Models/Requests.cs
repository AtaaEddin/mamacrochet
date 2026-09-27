namespace Mamacrochet.Api.Models;

/// <summary>
/// Request DTOs (plan 03). Optional scalar fields use nullable reference /
/// value types so the OpenAPI spec marks them optional and the frontend
/// client types match the server contract.
/// </summary>
public sealed record RegisterRequest(
    string Name,
    string Email,
    string Password,
    string? Phone,
    string? Country);

public sealed record LoginRequest(
    string Email,
    string Password,
    bool? Staff);

public sealed record ProfileUpdateRequest(
    string DisplayName,
    string? Phone,
    string? Country,
    string Language);

public sealed record PasswordChangeRequest(
    string Current,
    string Next);

public sealed record GuestLinkRequest(string GuestId);

public sealed record CreateUserRequest(
    string Email,
    string DisplayName,
    string? Phone,
    string? Country,
    string Language,
    IReadOnlyList<string> Roles);

public sealed record UpdateUserRequest(
    string DisplayName,
    string? Phone,
    string? Country,
    string Language,
    IReadOnlyList<string> Roles,
    string? AssignedEmployeeId,
    bool IsActive);
