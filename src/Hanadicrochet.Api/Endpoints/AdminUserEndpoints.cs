using System.Security.Claims;
using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Admin user management (plan 03): list/search, create (temporary password),
/// edit (profile / roles / assignment / status), password reset, soft delete.
/// Every action requires the Admin policy and is audited server-side.
/// </summary>
public static class AdminUserEndpoints
{
    public static void MapAdminUserEndpoints(this IEndpointRouteBuilder app)
    {
        var users = app
            .MapGroup("/admin/users")
            .RequireAuthorization(Policies.Admin)
            .WithTags("Admin");

        users.MapGet("", async (
            string? search,
            int? page,
            int? pageSize,
            AppDbContext db) =>
        {
            var p = Math.Clamp(page ?? 1, 1, int.MaxValue);
            var size = Math.Clamp(pageSize ?? 20, 1, 100);

            IQueryable<AppUser> query = db.Users
                .AsNoTracking()
                .Include(u => u.AssignedEmployee)
                .Where(u => u.DeletedAt == null);

            if (!string.IsNullOrWhiteSpace(search))
            {
                // LIKE wildcards from user input would widen the match — strip them.
                var term = search.Trim().Replace("%", "").Replace("_", "").Replace("\\", "");
                var upper = term.ToUpperInvariant();
                query = query.Where(u =>
                    u.NormalizedEmail!.Contains(upper)
                    || EF.Functions.Like(u.DisplayName, $"%{term}%")
                    || (u.Phone != null && EF.Functions.Like(u.Phone, $"%{term}%")));
            }

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(u => u.CreatedAt)
                .Skip((p - 1) * size)
                .Take(size)
                .ToListAsync();

            return Results.Ok(new UserPage(
                items.Select(UserDto.From).ToList(),
                total,
                p,
                size));
        })
        .Produces(200, typeof(UserPage))
        .WithName("admin.users.list");

        users.MapPost("", async (
            CreateUserRequest request,
            UserAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var actor = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            // Clients are typed, but a hand-written body may still omit a
            // required member (STJ then passes null): reject with 400, never 500.
            string? displayName = request.DisplayName;
            var name = displayName?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(request.Email)
                || name.Length is < 2 or > 80
                || request.Phone is { Length: > 20 }
                || request.Country is { Length: > 64 }
                || !Languages.IsValid(request.Language)
                || request.Roles is null || request.Roles.Count == 0)
            {
                return Results.BadRequest(new ApiError("invalid", "Check the values and try again."));
            }

            var result = await service.CreateAsync(request, actor);
            if (result.Error is not null)
            {
                return result.Error.Code == "email_taken"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(new UserCreated(UserDto.From(result.User!), result.TemporaryPassword!));
        })
        .Produces(200, typeof(UserCreated))
        .WithName("admin.users.create");

        users.MapPatch("/{id}", async (
            string id,
            UpdateUserRequest request,
            UserAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var actor = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            string? displayName = request.DisplayName;
            var name = displayName?.Trim() ?? string.Empty;
            if (name.Length is < 2 or > 80
                || request.Phone is { Length: > 20 }
                || request.Country is { Length: > 64 }
                || !Languages.IsValid(request.Language)
                || request.Roles is null || request.Roles.Count == 0)
            {
                return Results.BadRequest(new ApiError("invalid", "Check the values and try again."));
            }

            var result = await service.UpdateAsync(id, request, actor);
            if (result.Error is not null)
            {
                return result.Error.Code == "user_not_found"
                    ? Results.NotFound(result.Error)
                    : result.Error.Code == "self_modification"
                        ? Results.Json(result.Error, statusCode: StatusCodes.Status403Forbidden)
                        : Results.BadRequest(result.Error);
            }

            return Results.Ok(UserDto.From(result.User!));
        })
        .Produces(200, typeof(UserDto))
        .WithName("admin.users.update");

        users.MapPost("/{id}/password-reset", async (
            string id,
            UserAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var actor = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            var result = await service.ResetPasswordAsync(id, actor);
            if (result.Error is not null)
            {
                return Results.NotFound(result.Error);
            }

            return Results.Ok(new PasswordResetResult(result.TemporaryPassword!));
        })
        .Produces(200, typeof(PasswordResetResult))
        .WithName("admin.users.passwordReset");

        users.MapDelete("/{id}", async (
            string id,
            UserAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var actor = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            var result = await service.DeleteAsync(id, actor);
            if (result.Error is not null)
            {
                return result.Error.Code == "self_modification"
                    ? Results.Json(result.Error, statusCode: StatusCodes.Status403Forbidden)
                    : Results.NotFound(result.Error);
            }

            return Results.NoContent();
        })
        .Produces(204)
        .WithName("admin.users.delete");
    }
}
