namespace Hanadicrochet.Api.Models;

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

// ---- Plan 04: products & catalog ----------------------------------------

/// <summary>One localized category name input (en required).</summary>
public sealed record LocalizedNameInput(string Language, string Name);

/// <summary>
/// One localized product content input. Title required for the given
/// language; Description optional. en must be present in the list.
/// </summary>
public sealed record LocalizedContentInput(string Language, string? Title, string? Description);

public sealed record CreateProductRequest(
    IReadOnlyList<LocalizedContentInput> Localizations,
    string? CategoryId,
    decimal Price,
    string? Currency,
    int StockUnits);

public sealed record UpdateProductRequest(
    IReadOnlyList<LocalizedContentInput> Localizations,
    string? CategoryId,
    decimal Price,
    string? Currency,
    int StockUnits,
    bool IsListed);

/// <summary>Full new image order (cover = first).</summary>
public sealed record ImageOrderRequest(IReadOnlyList<string> ImageIds);

public sealed record CreateCategoryRequest(
    IReadOnlyList<LocalizedNameInput> Names,
    int SortOrder,
    bool IsListed);

public sealed record UpdateCategoryRequest(
    IReadOnlyList<LocalizedNameInput> Names,
    int SortOrder,
    bool IsListed);
