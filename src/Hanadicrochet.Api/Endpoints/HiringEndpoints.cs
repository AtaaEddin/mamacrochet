using System.Security.Claims;
using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Hiring (plan 09): public submit at <c>POST /hiring</c> (multipart —
/// honeypot + strict rate bucket), the admin queue at <c>/admin/hiring</c>
/// (Admin policy, CSRF via the /admin middleware), and admin-only serving of
/// previous-work files.
/// </summary>
public static class HiringEndpoints
{
    public static void MapHiringEndpoints(this IEndpointRouteBuilder app, IOptions<UploadsOptions> uploads)
    {
        app.MapPost("/hiring", async (
            [FromForm] string? name,
            [FromForm] string? email,
            [FromForm] string? phone,
            [FromForm] string? country,
            [FromForm] string? nationality,
            // Comma-separated — a `string[]` form parameter trips a .NET 10
            // minimal-API binder edge (element-type TryParse probe on string).
            [FromForm] string? languages,
            [FromForm] string? previousWork,
            [FromForm] string? message,
            // Honeypot — hidden field, bots fill it, humans never see it (D16).
            [FromForm] string? company,
            // Minimal-API form binding: multiple files bind as a collection
            // (IFormFile[] is only bound for simple types).
            [FromForm] IFormFileCollection? files,
            HiringService service) =>
        {
            // Read + validate the uploads before any state is touched.
            var uploaded = new List<UploadFile>();
            var parts = files?.GetFiles("files") ?? [];
            foreach (var file in parts)
            {
                if (file is null || file.Length == 0)
                {
                    continue;
                }

                if (file.Length > HiringFiles.MaxBytes)
                {
                    return Results.BadRequest(new ApiError("file_too_big", "Each file must be under 10 MB."));
                }

                await using var buffer = new MemoryStream();
                await file.CopyToAsync(buffer);
                uploaded.Add(new UploadFile(file.FileName, buffer.ToArray()));
            }

            var languageList = string.IsNullOrWhiteSpace(languages)
                ? null
                : languages.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            var result = await service.SubmitAsync(
                name, email, phone, country, nationality, languageList,
                previousWork, message, company, uploaded);
            if (result.Error is not null)
            {
                return Results.BadRequest(result.Error);
            }

            // Honeypot hit: look successful, store nothing (id is fabricated).
            var id = result.Application?.Id ?? Guid.NewGuid().ToString("N");
            return Results.Ok(new HiringSubmitted(id, result.Reapplied));
        })
        // Form-bound (IFormFile) endpoints would get automatic antiforgery
        // metadata requiring the built-in middleware; this public endpoint is
        // protected by rate limiting + the honeypot instead (same precedent
        // as the avatar upload).
        .DisableAntiforgery()
        .WithMetadata(new ConsumesAttribute("multipart/form-data"))
        .WithTags("Hiring")
        .Produces(200, typeof(HiringSubmitted))
        .WithName("hiring.submit");

        var hiring = app
            .MapGroup("/admin/hiring")
            .RequireAuthorization(Policies.Admin)
            .WithTags("Hiring");

        hiring.MapGet("", async (
            string? status,
            int? page,
            int? pageSize,
            AppDbContext db) =>
        {
            var p = Math.Clamp(page ?? 1, 1, int.MaxValue);
            var size = Math.Clamp(pageSize ?? 20, 1, 100);
            var filter = status is null ? null : status.Trim().ToLowerInvariant();

            if (filter is not null && filter is not ("new" or "accepted" or "declined"))
            {
                return Results.BadRequest(new ApiError("invalid", "Unknown status filter."));
            }

            IQueryable<HiringApplication> query = db.HiringApplications.AsNoTracking();
            if (filter is not null)
            {
                query = query.Where(a => a.Status == filter);
            }

            var total = await query.CountAsync();
            var items = await query
                .Include(a => a.Files)
                .OrderByDescending(a => a.AppliedAt)
                .Skip((p - 1) * size)
                .Take(size)
                .ToListAsync();

            return Results.Ok(new HiringPage(
                items.Select(HiringApplicationDto.From).ToList(),
                total,
                p,
                size));
        })
        .Produces(200, typeof(HiringPage))
        .WithName("admin.hiring.list");

        hiring.MapGet("/{id}", async (string id, AppDbContext db) =>
        {
            var application = await db.HiringApplications
                .AsNoTracking()
                .Include(a => a.Files)
                .Include(a => a.Events)
                .Include(a => a.DecidedBy)
                .FirstOrDefaultAsync(a => a.Id == id);
            if (application is null)
            {
                return Results.NotFound(new ApiError("hiring_not_found", "Application not found."));
            }

            return Results.Ok(HiringApplicationDetailDto.From(application));
        })
        .Produces(200, typeof(HiringApplicationDetailDto))
        .WithName("admin.hiring.get");

        hiring.MapPost("/{id}/accept", async (
            string id,
            AcceptHiringRequest request,
            HiringService service,
            AppDbContext db,
            ClaimsPrincipal principal) =>
        {
            var actorId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            var actor = await db.GetCurrentUserAsync(principal);
            var result = await service.AcceptAsync(id, request, actorId, actor?.DisplayName ?? "admin");
            if (result.Error is not null)
            {
                return result.Error.Code == "hiring_not_found"
                    ? Results.NotFound(result.Error)
                    : result.Error.Code is "already_decided" or "email_taken"
                        ? Results.Conflict(result.Error)
                        : Results.BadRequest(result.Error);
            }

            return Results.Ok(new HiringAccepted(
                HiringApplicationDto.From(result.Application!),
                UserDto.From(result.User!),
                result.TemporaryPassword!));
        })
        .Produces(200, typeof(HiringAccepted))
        .WithName("admin.hiring.accept");

        hiring.MapPost("/{id}/decline", async (
            string id,
            DeclineHiringRequest request,
            HiringService service,
            AppDbContext db,
            ClaimsPrincipal principal) =>
        {
            var actorId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            var actor = await db.GetCurrentUserAsync(principal);
            var result = await service.DeclineAsync(id, request.Note, actorId, actor?.DisplayName ?? "admin");
            if (result.Error is not null)
            {
                return result.Error.Code == "hiring_not_found"
                    ? Results.NotFound(result.Error)
                    : result.Error.Code == "already_decided"
                        ? Results.Conflict(result.Error)
                        : Results.BadRequest(result.Error);
            }

            return Results.Ok(HiringApplicationDto.From(result.Application!));
        })
        .Produces(200, typeof(HiringApplicationDto))
        .WithName("admin.hiring.decline");

        // Previous-work files: admin-only, DB row re-verified on every request
        // (stored names are opaque "{32-hex}.ext" — no path traversal).
        app.MapGet("/files/hiring/{appId}/{fileName}", async (
            string appId,
            string fileName,
            AppDbContext db,
            IOptions<UploadsOptions> uploads) =>
        {
            if (!HiringFiles.IsValidStoredName(fileName))
            {
                return Results.NotFound();
            }

            return await FindFileAsync(appId, fileName, db, uploads);
        })
        .RequireAuthorization(Policies.Admin)
        .WithName("files.getHiringFile")
        .WithTags("Files");
    }

    /// <summary>Resolves a stored file against its DB row, or 404.</summary>
    private static async Task<IResult> FindFileAsync(
        string appId,
        string fileName,
        AppDbContext db,
        IOptions<UploadsOptions> uploads)
    {
        var file = await db.HiringApplicationFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.ApplicationId == appId && f.StoredName == fileName);
        if (file is null)
        {
            return Results.NotFound();
        }

        var path = Path.Combine(uploads.Value.Root, "hiring", appId, fileName);
        if (!File.Exists(path))
        {
            return Results.NotFound();
        }

        return Results.File(path, HiringFiles.ContentType(fileName));
    }

}
