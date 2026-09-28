using System.Security.Claims;
using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Identity endpoints (plan 03): register/login/logout, profile, password
/// change, guest→account linking (D14), avatar upload.
/// Cookie auth — the browser is the only client (no public API in MVP).
/// </summary>
public static class IdentityEndpoints
{
    // Typed 401 bodies so the generated client gets an ApiError, not an empty
    // 401. BadCredentials: login failure. Gone: cookie is valid but the user
    // record is gone (deactivated/deleted) — sign in again.
    private static IResult BadCredentials() =>
        Results.Json(new ApiError("bad_credentials", "Email or password is incorrect."),
            statusCode: StatusCodes.Status401Unauthorized);

    private static IResult Gone() =>
        Results.Json(new ApiError("unauthenticated", "Sign in to continue."),
            statusCode: StatusCodes.Status401Unauthorized);

    public static void MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/antiforgery", (IAntiforgery antiforgery, HttpContext http) =>
            {
                var token = antiforgery.GetAndStoreTokens(http).RequestToken;
                return string.IsNullOrEmpty(token)
                    ? Results.Json(
                        new ApiError("server_error", "Something went wrong."),
                        statusCode: StatusCodes.Status500InternalServerError)
                    : Results.Ok(new CsrfToken(token));
            })
            .WithTags("Identity")
            .Produces(200, typeof(CsrfToken));

        var identity = app.MapGroup("/identity").WithTags("Identity");

        identity.MapPost("/register", async (
            RegisterRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signIn,
            HttpContext http) =>
        {
            string? nameRaw = request.Name;
            string? emailRaw = request.Email;
            var name = nameRaw?.Trim() ?? string.Empty;
            var email = emailRaw?.Trim() ?? string.Empty;
            var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone!.Trim();
            var country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country!.Trim();

            if (name.Length is < 2 or > 80 || string.IsNullOrWhiteSpace(email)
                || string.IsNullOrEmpty(request.Password) || phone is { Length: > 20 } || country is { Length: > 64 })
            {
                return Results.BadRequest(new ApiError("invalid", "Check the values and try again."));
            }

            if (await userManager.FindByEmailAsync(email) is not null)
            {
                return Results.Conflict(new ApiError("email_taken", "An account with this email already exists."));
            }

            var user = new AppUser
            {
                UserName = email,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = name,
                Phone = phone,
                Country = country,
                CreatedAt = DateTime.UtcNow,
            };

            var created = await userManager.CreateAsync(user, request.Password);
            if (!created.Succeeded)
            {
                return Results.BadRequest(UserAdministrationService.FromIdentityResult(created));
            }

            await signIn.SignInAsync(user, isPersistent: false);
            return Results.Ok(UserDto.From(user));
        })
        .Produces(200, typeof(UserDto));

        identity.MapPost("/login", async (
            LoginRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signIn,
            HttpContext http) =>
        {
            string? emailRaw = request.Email;
            var email = emailRaw?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(request.Password))
            {
                return BadCredentials();
            }

            var user = await userManager.FindByEmailAsync(email);
            if (user is null || user.DeletedAt is not null)
            {
                return BadCredentials();
            }

            if (await userManager.IsLockedOutAsync(user))
            {
                return Results.Json(new ApiError("locked", "Too many failed attempts. Try again in a few minutes."), statusCode: StatusCodes.Status423Locked);
            }

            if (!await userManager.CheckPasswordAsync(user, request.Password))
            {
                await userManager.AccessFailedAsync(user);
                return BadCredentials();
            }

            await userManager.ResetAccessFailedCountAsync(user);

            if (!user.IsActive)
            {
                return Results.Json(new ApiError("deactivated", "This account is deactivated."), statusCode: StatusCodes.Status403Forbidden);
            }

            // /staff/login flow: staff-only door (plan 03).
            if (request.Staff is true && !user.IsEmployee && !user.IsAdmin)
            {
                return Results.Json(new ApiError("staff_only", "This login is for staff accounts."), statusCode: StatusCodes.Status403Forbidden);
            }

            user.LastLoginAt = DateTime.UtcNow;
            await userManager.UpdateAsync(user);
            await signIn.SignInAsync(user, isPersistent: false);
            return Results.Ok(UserDto.From(user));
        })
        .Produces(200, typeof(UserDto));

        identity.MapPost("/logout", async (SignInManager<AppUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        })
        .Produces(204);

        identity.MapGet("/me", async (AppDbContext db, ClaimsPrincipal principal) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            return user is null
                ? Gone()
                : Results.Ok(UserDto.From(user));
        })
        .RequireAuthorization(Policies.Any)
        .Produces(200, typeof(UserDto));

        identity.MapPatch("/me", async (
            ProfileUpdateRequest request,
            AppDbContext db,
            UserManager<AppUser> userManager,
            ClaimsPrincipal principal) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Gone();
            }

            string? displayName = request.DisplayName;
            var name = displayName?.Trim() ?? string.Empty;
            var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone!.Trim();
            var country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country!.Trim();

            if (name.Length is < 2 or > 80 || phone is { Length: > 20 } || country is { Length: > 64 }
                || !Languages.IsValid(request.Language))
            {
                return Results.BadRequest(new ApiError("invalid", "Check the values and try again."));
            }

            user.DisplayName = name;
            user.Phone = phone;
            user.Country = country;
            user.Language = request.Language;
            await userManager.UpdateAsync(user);

            return Results.Ok(UserDto.From(user));
        })
        .RequireAuthorization(Policies.Any)
        .Produces(200, typeof(UserDto));

        identity.MapPost("/change-password", async (
            PasswordChangeRequest request,
            AppDbContext db,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signIn,
            ClaimsPrincipal principal) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Gone();
            }

            if (string.IsNullOrEmpty(request.Current) || string.IsNullOrEmpty(request.Next))
            {
                return Results.BadRequest(new ApiError("invalid", "Check the values and try again."));
            }

            if (!await userManager.CheckPasswordAsync(user, request.Current))
            {
                return Results.BadRequest(new ApiError("wrong_password", "The current password is not correct."));
            }

            user.MustChangePassword = false;
            var changed = await userManager.ChangePasswordAsync(user, request.Current, request.Next);
            if (!changed.Succeeded)
            {
                return Results.BadRequest(UserAdministrationService.FromIdentityResult(changed));
            }

            // Security stamp rotated — re-issue the session cookie.
            await signIn.SignInAsync(user, isPersistent: false);
            return Results.NoContent();
        })
        .RequireAuthorization(Policies.Any)
        .Produces(204);

        identity.MapPost("/guest-link", async (
            GuestLinkRequest request,
            GuestLinkService linker,
            AppDbContext db,
            ClaimsPrincipal principal) =>
        {
            if (!GuestLinkService.IsValidGuestId(request.GuestId))
            {
                return Results.BadRequest(new ApiError("invalid_guest", "Unknown guest session."));
            }

            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Gone();
            }

            var result = await linker.LinkAsync(request.GuestId, user.Id);
            switch (result.Status)
            {
                case GuestLinkStatus.Conflict:
                    return Results.Conflict(new ApiError("guest_already_linked", "This guest session is linked to another account."));
                default:
                    return Results.Ok(new Models.GuestLinkResult(result.LinkedAt!.Value));
            }
        })
        .RequireAuthorization(Policies.Any)
        .Produces(200, typeof(Models.GuestLinkResult));

        // Form-bound endpoints get automatic anti-forgery metadata, which would
        // require the built-in UseAntiforgery middleware (and its untyped 400).
        // CSRF for this POST is validated like every other mutation by the
        // typed antiforgery middleware in Program.cs — same token, same rules.
        identity.MapPost("/me/avatar", async (
            IFormFile file,
            AppDbContext db,
            UserManager<AppUser> userManager,
            IOptions<UploadsOptions> uploads,
            ClaimsPrincipal principal) =>
        {
            const long maxBytes = 1_048_576; // 1 MB

            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Gone();
            }

            if (file is null || file.Length == 0 || file.Length > maxBytes)
            {
                return Results.BadRequest(new ApiError("invalid_image", "Please choose an image under 1 MB."));
            }

            byte[] bytes;
            await using (var buffer = new MemoryStream())
            {
                await file.CopyToAsync(buffer);
                bytes = buffer.ToArray();
            }

            var kind = FileSignatures.DetectAccepted(bytes, FileSignatures.AllowedKinds.Images);
            if (kind is null)
            {
                return Results.BadRequest(new ApiError("unsupported_image", "Use a JPG, PNG or WEBP photo."));
            }

            var directory = Path.Combine(uploads.Value.Root, "avatars");
            Directory.CreateDirectory(directory);

            var fileName = $"{user.Id}-{Guid.NewGuid():N}{FileSignatures.Info(kind.Value).Extension}";
            await File.WriteAllBytesAsync(Path.Combine(directory, fileName), bytes);

            if (user.AvatarUrl is not null)
            {
                var oldName = Path.GetFileName(user.AvatarUrl);
                if (oldName is not null && oldName != fileName)
                {
                    var oldPath = Path.Combine(directory, oldName);
                    if (File.Exists(oldPath))
                    {
                        try
                        {
                            File.Delete(oldPath);
                        }
                        catch (IOException)
                        {
                            // Best effort — the old file simply lingers.
                        }
                    }
                }
            }

            user.AvatarUrl = $"/files/avatars/{fileName}";
            await userManager.UpdateAsync(user);
            return Results.Ok(UserDto.From(user));
        })
        .RequireAuthorization(Policies.Any)
        .DisableAntiforgery()
        .Produces(200, typeof(UserDto));
    }
}
