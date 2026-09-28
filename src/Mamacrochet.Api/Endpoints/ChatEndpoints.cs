using System.Security.Claims;
using Mamacrochet.Api.Authorization;
using Mamacrochet.Api.Data;
using Mamacrochet.Api.Models;
using Mamacrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Mamacrochet.Api.Endpoints;

/// <summary>
/// Chat REST (plan 06):
/// - <c>POST /chat/visitor</c> — public guest bootstrap (rate limit +
///   honeypot, D16; same precedent as POST /orders and /hiring);
/// - thread/message routes — cookie auth (Identity) OR an <c>X-Chat-Token</c>
///   header for guest visitor threads (D14/D24). CSRF for the cookie path
///   comes from the /chat entry in the path-scoped middleware; token paths
///   are exempt (the endpoint requires a valid token, which cannot be
///   forged cross-site);
/// - staff routes (claim/assign/close) — Employees/Admins;
/// - <c>GET /files/chat/...</c> — signed read-only chat files (D25).
/// </summary>
public static class ChatEndpoints
{
    public static void MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        // ---- Public guest bootstrap (D14: anonymous visitors chat) --------
        app.MapPost("/chat/visitor", async (
            VisitorThreadRequest request, ChatService chat, CancellationToken ct) =>
        {
            var result = await chat.BootstrapVisitorThreadAsync(
                request.GuestId, request.Name, request.Website, ct);
            if (result.Error is not null)
            {
                return Results.BadRequest(result.Error);
            }

            return Results.Ok(result.Created!);
        })
        .WithSummary("Start (or re-open) this device's visitor thread; returns a short-lived thread token.")
        .WithTags("Chat")
        .Produces<VisitorThreadCreated>(StatusCodes.Status200OK)
        .WithName("chat.bootstrapVisitorThread");

        // ---- My threads (cookie auth) --------------------------------------
        var mine = app.MapGroup("/chat").RequireAuthorization(Policies.Any).WithTags("Chat");

        mine.MapGet("/threads", async (
            string? kind, bool? closed, int? page,
            ClaimsPrincipal principal, ChatService chat, AppDbContext db, CancellationToken ct) =>
        {
            var user = await RequireUserAsync(principal, db, ct);
            if (user is null)
            {
                return Results.Json(new ApiError("unauthenticated", "Sign in to continue."),
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var result = await chat.ListThreadsAsync(user, kind, closed, page ?? 1, ct);
            return result.Error is not null
                ? Results.BadRequest(result.Error)
                : Results.Ok(result.Threads!);
        })
        .WithSummary("List the signed-in user's threads (admin: all) with previews + unread counts.")
        .Produces<ChatThreadListDto>(StatusCodes.Status200OK)
        .WithName("chat.listThreads");

        // ---- Thread detail (cookie OR thread token) ------------------------
        app.MapGet("/chat/threads/{threadId}", async (
            string threadId, HttpContext http, ChatService chat,
            ChatTokenService tokens, AppDbContext db, CancellationToken ct) =>
        {
            var (user, token) = await ResolveCallerAsync(http, tokens, db, ct);
            var result = await chat.GetThreadAsync(threadId, user, token, ct);
            return ResultFor(result.Error, result.Thread is not null
                ? Results.Ok(result.Thread)
                : null);
        })
        .WithSummary("Thread detail for a participant (cookie) or the owning guest (X-Chat-Token).")
        .WithTags("Chat")
        .Produces<ThreadDto>(StatusCodes.Status200OK)
        .WithName("chat.getThread");

        // ---- Messages (cookie OR thread token) ------------------------------
        app.MapGet("/chat/threads/{threadId}/messages", async (
            string threadId,
            string? before,
            string? after,
            int? limit,
            HttpContext http, ChatService chat,
            ChatTokenService tokens, AppDbContext db, CancellationToken ct) =>
        {
            var (user, token) = await ResolveCallerAsync(http, tokens, db, ct);
            var result = await chat.ListMessagesAsync(
                threadId, user, token, before, after, limit ?? 50, ct);
            return ResultFor(result.Error, result.Page is not null
                ? Results.Ok(result.Page)
                : null);
        })
        .WithSummary(
            "Messages of a thread. Default: the newest page (oldest first). " +
            "`before` loads older (cursor = message id); `after` polls newer (fallback when the socket is down).")
        .WithTags("Chat")
        .Produces<MessagePageDto>(StatusCodes.Status200OK)
        .WithName("chat.listMessages");

        app.MapPost("/chat/threads/{threadId}/messages", async (
            string threadId, SendMessageRequest request,
            HttpContext http, ChatService chat,
            ChatTokenService tokens, AppDbContext db, CancellationToken ct) =>
        {
            var (user, token) = await ResolveCallerAsync(http, tokens, db, ct);
            var result = await chat.SendMessageAsync(
                threadId, user, token, request.Body, request.ProductId,
                request.AttachmentIds, request.ClientId, ct);
            return ResultFor(result.Error, result.Message is not null
                ? Results.Created($"/chat/threads/{threadId}/messages/{result.Message.Id}", result.Message)
                : null);
        })
        .WithSummary("Send a message (also the REST path for the socket fallback).")
        .WithTags("Chat")
        .Produces<ChatMessageDto>(StatusCodes.Status201Created)
        .WithName("chat.sendMessage");

        // ---- Attachments (cookie OR thread token) ----------------------------
        app.MapPost("/chat/threads/{threadId}/attachments", async (
            string threadId,
            [FromForm] IFormFileCollection? files,
            HttpContext http, ChatService chat,
            ChatTokenService tokens, AppDbContext db, CancellationToken ct) =>
        {
            var (user, token) = await ResolveCallerAsync(http, tokens, db, ct);
            var uploaded = files?.GetFiles("files").Where(f => f is not null && f.Length > 0).ToList()
                ?? [];
            var result = await chat.UploadAttachmentsAsync(
                threadId, user, token, uploaded, ct);
            return ResultFor(result.Error, result.Attachments is not null
                ? Results.Ok(result.Attachments)
                : null);
        })
        .WithSummary("Upload chat files (images/PDF, 10 MB, max 5). Attach them to a message by id.")
        .WithTags("Chat")
        .DisableAntiforgery() // public guest path (token) + cookie path (CSRF middleware)
        .WithMetadata(new ConsumesAttribute("multipart/form-data"))
        .Produces<ChatAttachmentListDto>(StatusCodes.Status200OK)
        .WithName("chat.uploadAttachments");

        // ---- Read marker (cookie auth; guests live in the thread) -----------
        mine.MapPost("/threads/{threadId}/read", async (
            string threadId, ClaimsPrincipal principal,
            ChatService chat, AppDbContext db, CancellationToken ct) =>
        {
            var user = await RequireUserAsync(principal, db, ct);
            if (user is null)
            {
                return Results.Json(new ApiError("unauthenticated", "Sign in to continue."),
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var ok = await chat.MarkReadAsync(threadId, user, ct);
            return ok
                ? Results.NoContent()
                : Results.Json(ApiError.NotFound("conversation_not_found"),
                    statusCode: StatusCodes.Status404NotFound);
        })
        .WithSummary("Mark the thread read for the signed-in user (drives unread badges).")
        .Produces(StatusCodes.Status204NoContent)
        .WithName("chat.markThreadRead");

        // ---- Staff: Visitors inbox --------------------------------------------
        // Policies.Any (signed-in + active); each handler enforces the staff
        // rule itself (claim: employee/admin, assign: admin, close: staff).
        var staff = app.MapGroup("/chat").RequireAuthorization(Policies.Any).WithTags("Chat");

        staff.MapPost("/threads/{threadId}/claim", async (
            string threadId, ClaimsPrincipal principal,
            ChatService chat, AppDbContext db, CancellationToken ct) =>
        {
            var user = await RequireUserAsync(principal, db, ct);
            if (user is null || (!user.IsEmployee && !user.IsAdmin))
            {
                return Results.Json(new ApiError("forbidden", "Staff only."),
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var result = await chat.ClaimThreadAsync(threadId, user, ct);
            return ResultFor(result.Error, result.Thread is not null ? Results.Ok(result.Thread) : null);
        })
        .WithSummary("Claim a visitor conversation (assigns it to the caller).")
        .Produces<ThreadDto>(StatusCodes.Status200OK)
        .WithName("chat.claimThread");

        staff.MapPost("/threads/{threadId}/assign", async (
            string threadId, StaffAssignRequest request, ClaimsPrincipal principal,
            ChatService chat, AppDbContext db, CancellationToken ct) =>
        {
            var user = await RequireUserAsync(principal, db, ct);
            if (user is null || !user.IsAdmin)
            {
                return Results.Json(new ApiError("forbidden", "Only an admin can assign."),
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var result = await chat.AssignThreadAsync(threadId, user, request.EmployeeId, ct);
            return ResultFor(result.Error, result.Thread is not null ? Results.Ok(result.Thread) : null);
        })
        .WithSummary("Assign a conversation to an employee (admin only).")
        .Produces<ThreadDto>(StatusCodes.Status200OK)
        .WithName("chat.assignThread");

        staff.MapPost("/threads/{threadId}/close", async (
            string threadId, StaffCloseRequest? request, ClaimsPrincipal principal,
            ChatService chat, AppDbContext db, CancellationToken ct) =>
        {
            var user = await RequireUserAsync(principal, db, ct);
            if (user is null || (!user.IsEmployee && !user.IsAdmin))
            {
                return Results.Json(new ApiError("forbidden", "Staff only."),
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var result = await chat.CloseThreadAsync(threadId, user, request?.Reason, ct);
            return ResultFor(result.Error, result.Thread is not null ? Results.Ok(result.Thread) : null);
        })
        .WithSummary("Close a conversation (staff).")
        .Produces<ThreadDto>(StatusCodes.Status200OK)
        .WithName("chat.closeThread");

        // ---- Chat files (D25: short-lived signed read links) ------------------
        app.MapGet("/files/chat/{threadId}/{fileName}", async (
            string threadId, string fileName,
            [FromQuery] string? sig, [FromQuery] long? exp,
            ChatTokenService tokens, IOptions<UploadsOptions> uploads,
            HttpContext context) =>
        {
            if (!ChatFileFiles.IsValid(threadId, fileName)
                || !tokens.VerifyFileSignature(threadId, fileName, sig, exp))
            {
                return Results.NotFound();
            }

            var path = Path.Combine(uploads.Value.Root, "chat", threadId, fileName);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            // Private conversation files — never cached by intermediates.
            context.Response.Headers.CacheControl = "private, max-age=0, no-store";
            return Results.File(path, ChatFileFiles.ContentType(fileName), enableRangeProcessing: true);
        })
        .WithSummary("Serves a chat file through a short-lived read signature (from message DTOs).")
        .WithTags("Files")
        .WithName("files.getChatFile");
    }

    // ---- Helpers -------------------------------------------------------------

    private static async Task<AppUser?> RequireUserAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
    }

    /// <summary>
    /// Cookie auth (Identity) first, else a validated X-Chat-Token (guest
    /// visitor threads).
    /// </summary>
    private static async Task<(AppUser? User, ChatService.ValidatedThreadToken? Token)>
        ResolveCallerAsync(
            HttpContext http, ChatTokenService tokens, AppDbContext db, CancellationToken ct)
    {
        AppUser? user = null;
        var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userId))
        {
            user = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId, ct);
        }

        ChatService.ValidatedThreadToken? token = null;
        var raw = http.Request.Headers["X-Chat-Token"].ToString();
        if (!string.IsNullOrEmpty(raw))
        {
            var validated = tokens.TryValidateThreadToken(raw);
            if (validated is not null)
            {
                token = new ChatService.ValidatedThreadToken(
                    validated.Value.ThreadId, validated.Value.GuestId);
            }
        }

        return (user, token);
    }

    /// <summary>Maps the service error codes onto their HTTP statuses.</summary>
    private static IResult ResultFor(ApiError? error, IResult? success)
    {
        if (error is null)
        {
            return success!;
        }

        return error.Code switch
        {
            "not_found" => Results.NotFound(error),
            "forbidden" => Results.Json(error, statusCode: StatusCodes.Status403Forbidden),
            "conflict" => Results.Conflict(error),
            "rate_limited" => Results.Json(error, statusCode: StatusCodes.Status429TooManyRequests),
            _ => Results.BadRequest(error),
        };
    }

    internal static class ChatFileFiles
    {
        private static readonly System.Text.RegularExpressions.Regex ThreadPattern = new(
            "^[0-9a-f]{32}$",
            System.Text.RegularExpressions.RegexOptions.Compiled |
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        private static readonly System.Text.RegularExpressions.Regex FilePattern = new(
            "^[0-9a-f]{32}\\.(jpg|png|webp|gif|pdf)$",
            System.Text.RegularExpressions.RegexOptions.Compiled |
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        private static readonly System.Text.RegularExpressions.Regex IdPattern = new(
            "^[0-9a-f]{32}$",
            System.Text.RegularExpressions.RegexOptions.Compiled |
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        public static bool IsValid(string threadId, string fileName)
        {
            return ThreadPattern.IsMatch(threadId)
                && FilePattern.IsMatch(fileName)
                && IdPattern.IsMatch(fileName[..32]);
        }

        public static string ContentType(string fileName) =>
            fileName[^4..].ToLowerInvariant() switch
            {
                ".jpg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                _ => "application/pdf",
            };
    }
}
