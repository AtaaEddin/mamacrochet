using System.Globalization;
using System.Linq.Expressions;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Orders (plan 05): guest-first creation at <c>POST /orders</c> (public
/// multipart — honeypot + strict rate bucket + D16 caps, same precedent as
/// /hiring), the customer "my orders" surface, the staff queue, and the
/// admin orders + metrics endpoints. Timeline reads are role-filtered:
/// AdminOnly events stay in the admin trace (plan 07 rule 3).
/// </summary>
public static class OrderEndpoints
{
    public static void MapOrderEndpoints(
        this IEndpointRouteBuilder app,
        IOptions<UploadsOptions> uploads)
    {
        MapGuestCreation(app);
        MapCustomerOrders(app);
        MapStaffOrders(app);
        MapAdminOrders(app);
        MapOrderFiles(app, uploads);
    }

    // ---- POST /orders — guest-first creation (public) --------------------

    private static void MapGuestCreation(this IEndpointRouteBuilder app)
    {
        app.MapPost("/orders", async (
            [FromForm] string? kind,
            [FromForm] string? productId,
            [FromForm] string? name,
            [FromForm] string? phone,
            [FromForm] string? email,
            [FromForm] string? guestId,
            [FromForm] string? spec,
            // Honeypot — hidden field, bots fill it, humans never see it (D16).
            [FromForm] string? website,
            [FromForm] IFormFileCollection? files,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var uploaded = await ReadFilesAsync(files);

            var result = await service.CreateAsync(
                new CreateOrderInput(
                    kind, productId, name, phone, email, guestId, spec,
                    website, uploaded),
                await db.GetCurrentUserAsync(principal),
                ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "product_not_found"
                    ? Results.NotFound(result.Error)
                    : result.Error.Code == "guest_cap"
                        ? Results.Conflict(result.Error)
                        : Results.BadRequest(result.Error);
            }

            // Honeypot hit: look successful, store nothing (id is fabricated).
            var id = result.Order?.Id ?? Guid.NewGuid().ToString("N");
            return Results.Ok(new OrderCreated(id, result.Order?.Status ?? OrderStatus.Open));
        })
        // Public submit: protected by rate limiting (5/min/IP), the honeypot
        // and the D16 caps — not by antiforgery (same precedent as /hiring).
        .DisableAntiforgery()
        .WithMetadata(new ConsumesAttribute("multipart/form-data"))
        .WithTags("Orders")
        .Produces(200, typeof(OrderCreated))
        .WithName("orders.create");
    }

    // ---- /orders — customer surface --------------------------------------

    private static void MapCustomerOrders(this IEndpointRouteBuilder app)
    {
        var orders = app
            .MapGroup("/orders")
            .RequireAuthorization(Policies.Customer)
            .WithTags("Orders");

        orders.MapGet("", async (
            AppDbContext db,
            OrderService service,
            ClaimsPrincipal principal,
            HttpContext context,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            await service.EnsureAutoCancelledAsync(ct);

            var guestId = await db.GuestAccountLinks.AsNoTracking()
                .Where(g => g.UserId == user.Id)
                .Select(g => g.GuestId)
                .FirstOrDefaultAsync(ct);

            var mine = db.Orders.AsNoTracking();
            mine = guestId is null
                ? mine.Where(o => o.CustomerId == user.Id)
                : mine.Where(o => o.CustomerId == user.Id || o.GuestId == guestId);

            var (error, page) = await OrderListing.ListAsync(
                mine.Include(o => o.Product).ThenInclude(p => p!.Translations)
                    .Include(o => o.AssignedEmployee),
                OrderQueryBinders.Customer(), context.Request.Query, ct: ct);
            return error is null
                ? Results.Ok(new OrderPage(
                    page!.Items.Select(o => OrderSummary.From(o)).ToList(),
                    page.Total, page.Page, page.PageSize))
                : Results.BadRequest(error);
        })
        .Produces<OrderPage>(200)
        .Produces<ApiError>(400)
        .WithName("orders.list");

        orders.MapGet("/{id}", async (
            string id,
            AppDbContext db,
            OrderService service,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            await service.EnsureAutoCancelledAsync(ct);
            var order = await LoadDetailAsync(db, id, ct);
            if (order is null)
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var owner = await OrderService.SeeByCustomerAsync(db, user, order, ct);
            var canSee = user.IsEmployee
                ? await OrderService.SeeByStaffAsync(db, user, order, ct)
                : owner;
            if (!canSee)
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            return Results.Ok(MapDetail(
                order,
                user.IsAdmin,
                owner,
                staff: user.IsEmployee,
                ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("orders.get");

        orders.MapPost("/{id}/cancel", async (
            string id,
            CancelOrderRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);
            if (order is null || !await OrderService.SeeByCustomerAsync(db, user, order, ct))
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var result = await service.TransitionAsync(
                id, OrderStatus.Cancelled, request.Reason, null,
                user.Id, user.DisplayName, "customer", ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "invalid_status_change"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin,
                owner: true, staff: user.IsEmployee, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("orders.cancel");

        orders.MapPost("/{id}/confirm-delivery", async (
            string id,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var result = await service.ConfirmDeliveryAsync(id, user, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "order_not_found"
                    ? Results.NotFound(result.Error)
                    : Results.Conflict(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin,
                owner: true, staff: user.IsEmployee, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("orders.confirmDelivery");

        orders.MapPost("/{id}/rating", async (
            string id,
            RateOrderRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var result = await service.RateAsync(
                id, request.Score, request.Comment, user, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "already_rated" || result.Error.Code == "not_finished"
                    ? Results.Conflict(result.Error)
                    : result.Error.Code == "order_not_found"
                        ? Results.NotFound(result.Error)
                        : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin,
                owner: true, staff: user.IsEmployee, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("orders.rate");
    }

    // ---- /staff/orders — employee queue ----------------------------------

    private static void MapStaffOrders(this IEndpointRouteBuilder app)
    {
        var orders = app
            .MapGroup("/staff/orders")
            .RequireAuthorization(Policies.Employee)
            .WithTags("Staff");

        orders.MapGet("", async (
            AppDbContext db,
            OrderService service,
            ClaimsPrincipal principal,
            HttpContext context,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            await service.EnsureAutoCancelledAsync(ct);

            // The staff queue is "orders I handle" for every staff role —
            // admin's management view is /admin/orders.
            var (error, page) = await OrderListing.ListAsync(
                OrderService.AssignedTo(db, user)
                    .Include(o => o.Product).ThenInclude(p => p!.Translations)
                    .Include(o => o.AssignedEmployee)
                    .Include(o => o.Customer),
                OrderQueryBinders.Staff(), context.Request.Query, ct: ct);
            return error is null
                ? Results.Ok(new OrderPage(
                    page!.Items.Select(o => OrderSummary.From(o)).ToList(),
                    page.Total, page.Page, page.PageSize))
                : Results.BadRequest(error);
        })
        .Produces<OrderPage>(200)
        .Produces<ApiError>(400)
        .WithName("staff.orders.list");

        orders.MapGet("/{id}", async (
            string id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await LoadDetailAsync(db, id, ct);
            if (order is null)
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            if (!await OrderService.SeeByStaffAsync(db, user, order, ct))
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var owner = await OrderService.SeeByCustomerAsync(db, user, order, ct);
            return Results.Ok(MapDetail(
                order, user.IsAdmin, owner, staff: true, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("staff.orders.get");

        orders.MapPost("/{id}/status", async (
            string id,
            OrderStatusChangeRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == id, ct);
            if (order is null || !await OrderService.SeeByStaffAsync(db, user, order, ct))
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var result = await service.TransitionAsync(
                id, request.Status, request.Note, request.FinalPrice,
                user.Id, user.DisplayName,
                user.IsAdmin ? "admin" : "employee", ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "invalid_status_change"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin, owner: false, staff: true, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("staff.orders.status");

        orders.MapPost("/{id}/notes", async (
            string id,
            OrderNoteRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == id, ct);
            if (order is null || !await OrderService.SeeByStaffAsync(db, user, order, ct))
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var result = await service.AddNoteAsync(
                id, request.Text, user.Id, user.DisplayName,
                user.IsAdmin ? "admin" : "employee", ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "order_not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin, owner: false, staff: true, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("staff.orders.note");

        orders.MapPost("/{id}/payment", async (
            string id,
            [FromForm] string? amount,
            [FromForm] string? method,
            [FromForm] string? note,
            [FromForm] IFormFile? receipt,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
            await HandlePaymentAsync(id, amount, method, note, receipt,
                db, service, principal, false, ct))
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("staff.orders.payment");

        orders.MapPost("/{id}/delivery", async (
            string id,
            [FromForm] string? method,
            [FromForm] string? actualAt,
            [FromForm] string? description,
            [FromForm] IFormFile? proof,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
            await HandleDeliveryAsync(id, method, actualAt, description, proof,
                db, service, principal, false, ct))
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("staff.orders.delivery");

        orders.MapPost("/{id}/attachments", async (
            string id,
            [FromForm] string? kind,
            [FromForm] IFormFileCollection? files,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == id, ct);
            if (order is null || !await OrderService.SeeByStaffAsync(db, user, order, ct))
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            var uploaded = await ReadFilesAsync(files);
            if (uploaded.Count == 0)
            {
                return Results.BadRequest(new ApiError("invalid", "No files uploaded."));
            }

            var result = await service.AddAttachmentsAsync(
                id, kind ?? "", uploaded, user.Id, ct);
            if (result.Error is not null)
            {
                // All attachment failures are client errors.
                return Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin, owner: false, staff: true, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("staff.orders.attachments");

        // Per-order assignment (admin): the order's own employee, else the
        // customer's default handler applies.
        orders.MapPatch("/{id}/assignment", async (
            string id,
            OrderAssignmentRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var result = await service.AssignAsync(id, request.EmployeeId, user.DisplayName, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "order_not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, user.IsAdmin, owner: false, staff: true, ct));
        })
        .RequireAuthorization(Policies.Admin)
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("staff.orders.assign");
    }

    // Plan 07: the same payment/delivery handlers serve the admin surface —
    // an admin may record a receipt-less payment (then a written reason is
    // mandatory) and a proof-less delivery; the pure status jumps without
    // either record go through /admin/orders/{id}/status (rule 3).
    private static async Task<IResult> HandlePaymentAsync(
        string id,
        string? amount,
        string? method,
        string? note,
        IFormFile? receipt,
        AppDbContext db,
        OrderService service,
        ClaimsPrincipal principal,
        bool admin,
        CancellationToken ct)
    {
        var user = await db.GetCurrentUserAsync(principal);
        if (user is null)
        {
            return Unauthenticated();
        }

        var order = await db.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null || !await OrderService.SeeByStaffAsync(db, user, order, ct))
        {
            return Results.NotFound(ApiError.NotFound("order_not_found"));
        }

        UploadFile? file = null;
        if (receipt is not null && receipt.Length > 0)
        {
            await using var buffer = new MemoryStream();
            await receipt.CopyToAsync(buffer);
            file = new UploadFile(receipt.FileName, buffer.ToArray());
        }

        decimal? parsedAmount = null;
        if (!string.IsNullOrWhiteSpace(amount)
            && decimal.TryParse(
                amount.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture,
                out var value))
        {
            parsedAmount = value;
        }

        var result = await service.RecordPaymentAsync(
            id, parsedAmount, method, note, file,
            user.Id, user.DisplayName, user.IsAdmin ? "admin" : "employee", ct);
        if (result.Error is not null)
        {
            return result.Error.Code == "order_not_found"
                ? Results.NotFound(result.Error)
                : result.Error.Code == "invalid_status_change"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
        }

        var fresh = await LoadDetailAsync(db, id, ct);
        return Results.Ok(MapDetail(
            fresh!, admin, owner: false, staff: true, ct));
    }

    private static async Task<IResult> HandleDeliveryAsync(
        string id,
        string? method,
        string? actualAt,
        string? description,
        IFormFile? proof,
        AppDbContext db,
        OrderService service,
        ClaimsPrincipal principal,
        bool admin,
        CancellationToken ct)
    {
        var user = await db.GetCurrentUserAsync(principal);
        if (user is null)
        {
            return Unauthenticated();
        }

        var order = await db.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null || !await OrderService.SeeByStaffAsync(db, user, order, ct))
        {
            return Results.NotFound(ApiError.NotFound("order_not_found"));
        }

        UploadFile? file = null;
        if (proof is not null && proof.Length > 0)
        {
            await using var buffer = new MemoryStream();
            await proof.CopyToAsync(buffer);
            file = new UploadFile(proof.FileName, buffer.ToArray());
        }

        DateTime? parsedActual = null;
        if (!string.IsNullOrWhiteSpace(actualAt)
            && DateTime.TryParse(
                actualAt.Trim(), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var value))
        {
            parsedActual = value;
        }

        var result = await service.RecordDeliveryAsync(
            id, method, parsedActual, description, file,
            user.Id, user.DisplayName, user.IsAdmin ? "admin" : "employee", ct);
        if (result.Error is not null)
        {
            return result.Error.Code == "order_not_found"
                ? Results.NotFound(result.Error)
                : result.Error.Code == "invalid_status_change"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
        }

        var fresh = await LoadDetailAsync(db, id, ct);
        return Results.Ok(MapDetail(
            fresh!, admin, owner: false, staff: true, ct));
    }

    // ---- /admin/orders — admin surface -----------------------------------

    private static void MapAdminOrders(this IEndpointRouteBuilder app)
    {
        var orders = app
            .MapGroup("/admin/orders")
            .RequireAuthorization(Policies.Admin)
            .WithTags("Admin");

        // Mapped before /{id}: the static segment wins routing, and the
        // metrics panel is part of this surface.
        orders.MapGet("/metrics", async (OrderService service, CancellationToken ct) =>
            Results.Ok(await service.MetricsAsync(ct)))
        .Produces<OrderMetrics>(200)
        .WithName("admin.orders.metrics");

        orders.MapGet("", async (
            AppDbContext db,
            OrderService service,
            HttpContext context,
            CancellationToken ct) =>
        {
            await service.EnsureAutoCancelledAsync(ct);

            var (error, page) = await OrderListing.ListAsync(
                db.Orders.AsNoTracking()
                    .Include(o => o.Product).ThenInclude(p => p!.Translations)
                    .Include(o => o.AssignedEmployee)
                    .Include(o => o.Customer),
                OrderQueryBinders.Admin(), context.Request.Query, ct: ct);
            return error is null
                ? Results.Ok(new OrderPage(
                    page!.Items.Select(o => OrderSummary.From(o)).ToList(),
                    page.Total, page.Page, page.PageSize))
                : Results.BadRequest(error);
        })
        .Produces<OrderPage>(200)
        .Produces<ApiError>(400)
        .WithName("admin.orders.list");

        orders.MapGet("/{id}", async (
            string id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var order = await LoadDetailAsync(db, id, ct);
            if (order is null)
            {
                return Results.NotFound(ApiError.NotFound("order_not_found"));
            }

            return Results.Ok(MapDetail(
                order, true,
                owner: await OrderService.SeeByCustomerAsync(db, user, order, ct),
                staff: true,
                ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .WithName("admin.orders.get");

        // Plan 07: admin payment/delivery records (mapped after /metrics and
        // before /{id} is unreachable — static segments win, and these are
        // two-segment paths). Admin variant: receipt/proof optional, then
        // the written reason is mandatory (rule 3).
        orders.MapPost("/{id}/payment", async (
            string id,
            [FromForm] string? amount,
            [FromForm] string? method,
            [FromForm] string? note,
            [FromForm] IFormFile? receipt,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
            await HandlePaymentAsync(id, amount, method, note, receipt,
                db, service, principal, true, ct))
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("admin.orders.payment");

        orders.MapPost("/{id}/delivery", async (
            string id,
            [FromForm] string? method,
            [FromForm] string? actualAt,
            [FromForm] string? description,
            [FromForm] IFormFile? proof,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
            await HandleDeliveryAsync(id, method, actualAt, description, proof,
                db, service, principal, true, ct))
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("admin.orders.delivery");

        orders.MapPost("/{id}/status", async (
            string id,
            OrderStatusChangeRequest request,
            OrderService service,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Unauthenticated();
            }

            var result = await service.TransitionAsync(
                id, request.Status, request.Note, request.FinalPrice,
                user.Id, user.DisplayName, "admin", ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "invalid_status_change"
                    ? Results.Conflict(result.Error)
                    : Results.BadRequest(result.Error);
            }

            var fresh = await LoadDetailAsync(db, id, ct);
            return Results.Ok(MapDetail(
                fresh!, true, owner: false, staff: true, ct));
        })
        .Produces<OrderDetail>(200)
        .Produces<ApiError>(404)
        .Produces<ApiError>(409)
        .WithName("admin.orders.status");
    }

    // ---- /files/orders — order files --------------------------------------

    private static void MapOrderFiles(
        this IEndpointRouteBuilder app,
        IOptions<UploadsOptions> uploads)
    {
        app.MapGet("/files/orders/{orderId}/{fileName}", async (
            string orderId,
            string fileName,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            if (!OrderFiles.IsValid(orderId, fileName))
            {
                return Results.NotFound();
            }

            var user = await db.GetCurrentUserAsync(principal);
            if (user is null)
            {
                return Results.NotFound();
            }

            var file = await db.OrderAttachments.AsNoTracking()
                .FirstOrDefaultAsync(f => f.OrderId == orderId && f.StoredName == fileName, ct);
            if (file is null)
            {
                return Results.NotFound();
            }

            var order = await db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == orderId, ct);
            if (order is null
                || !(user.IsAdmin || user.IsEmployee
                    || (file.Kind is "sample" or "wip"
                        && await OrderService.SeeByCustomerAsync(db, user, order, ct))))
            {
                return Results.NotFound();
            }

            var path = Path.Combine(uploads.Value.Root, "orders", orderId, fileName);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            return Results.File(path, OrderFiles.ContentType(fileName));
        })
        .RequireAuthorization(Policies.Any)
        .WithName("files.getOrderFile")
        .WithTags("Files");
    }

    // ---- Helpers ----------------------------------------------------------

    /// <summary>
    /// The order with everything the detail view needs (the timeline is
    /// role-filtered in <see cref="MapDetail"/>).
    /// </summary>
    private static async Task<Order?> LoadDetailAsync(
        AppDbContext db,
        string id,
        CancellationToken ct)
    {
        return await db.Orders
            .AsNoTracking()
            .Include(o => o.Product).ThenInclude(p => p!.Translations)
            .Include(o => o.Product).ThenInclude(p => p!.Images)
            .Include(o => o.AssignedEmployee)
            .Include(o => o.Customer)
            .Include(o => o.Timeline)
            .Include(o => o.Attachments).ThenInclude(f => f.UploadedBy)
            .Include(o => o.Payment).ThenInclude(p => p!.ReceiptFile)
            .Include(o => o.Payment).ThenInclude(p => p!.RecordedBy)
            .Include(o => o.Delivery).ThenInclude(d => d!.ProofFile)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
    }

    private static OrderDetail MapDetail(
        Order order,
        bool admin,
        bool owner,
        bool staff,
        CancellationToken ct)
    {
        var timeline = order.Timeline
            .Where(e => admin || !e.AdminOnly)
            .OrderBy(e => e.At)
            .Select(OrderEventDto.From)
            .ToList();

        var attachments = order.Attachments
            .OrderBy(f => f.CreatedAt)
            .Where(f => staff || f.Kind is "sample" or "wip")
            .Select(f => OrderAttachmentDto.From(
                f,
                staff ? f.UploadedBy?.DisplayName : null))
            .ToList();

        var product = order.Product is null
            ? null
            : OrderProductInfo.From(order.Product);

        return new OrderDetail(
            order.Id,
            order.Kind,
            order.Status,
            order.ContactName,
            order.ContactPhone,
            order.ContactEmail,
            order.CustomerId is not null,
            product,
            order.Spec,
            order.EstimatedPrice,
            order.FinalPrice,
            order.Currency,
            order.Customer?.DisplayName,
            order.AssignedEmployeeId,
            order.AssignedEmployee?.DisplayName,
            order.Rating,
            order.RatingComment,
            order.RatedAt,
            timeline,
            attachments,
            order.Payment is null
                ? null
                : new PaymentDto(
                    order.Payment.Amount,
                    order.Payment.Currency,
                    order.Payment.Method,
                    order.Payment.ReceiptFileId is not null,
                    staff && order.Payment.ReceiptFile is not null
                        ? $"/files/orders/{order.Id}/{order.Payment.ReceiptFile.StoredName}"
                        : null,
                    // Without a receipt the note is the admin override reason —
                    // admin trace only (plan 07 rule 3), never the customer card.
                    staff || order.Payment.ReceiptFileId is not null
                        ? order.Payment.Note
                        : null,
                    order.Payment.RecordedAt),
            order.Delivery is null
                ? null
                : new DeliveryDto(
                    order.Delivery.Method,
                    order.Delivery.ActualAt,
                    order.Delivery.Description,
                    staff && order.Delivery.ProofFile is not null
                        ? $"/files/orders/{order.Id}/{order.Delivery.ProofFile.StoredName}"
                        : null,
                    order.Delivery.RecordedAt),
            owner && (order.Status == OrderStatus.Open || order.Status == OrderStatus.InProgress),
            owner && order.Status == OrderStatus.Closed && order.Rating is null,
            owner
                && order.Status == OrderStatus.Delivered
                && order.Timeline.All(e => e.Kind != "confirmation"),
            order.CreatedAt,
            order.UpdatedAt);
    }

    private static async Task<IReadOnlyList<UploadFile>> ReadFilesAsync(IFormFileCollection? files)
    {
        var uploaded = new List<UploadFile>();
        foreach (var file in files?.GetFiles("files") ?? [])
        {
            if (file is null || file.Length == 0)
            {
                continue;
            }

            await using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            uploaded.Add(new UploadFile(file.FileName, buffer.ToArray()));
        }

        return uploaded;
    }

    private static IResult Unauthenticated() => Results.Json(
        new ApiError("unauthenticated", "Sign in to continue."),
        statusCode: StatusCodes.Status401Unauthorized);
}

/// <summary>
/// Order file names: {32-hex attachment id}.{ext} under the order's own
/// folder — opaque, no path traversal (like the other uploaded files).
/// </summary>
public static class OrderFiles
{
    private static readonly Regex IdPattern = new(
        "^[0-9a-f]{32}$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex NamePattern = new(
        "^[0-9a-f]{32}\\.(jpg|png|webp|pdf)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsValid(string orderId, string fileName) =>
        IdPattern.IsMatch(orderId) && NamePattern.IsMatch(fileName);

    public static string ContentType(string fileName)
    {
        if (fileName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase))
        {
            return "image/jpeg";
        }

        if (fileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
        {
            return "image/png";
        }

        if (fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return "application/pdf";
        }

        return "image/webp";
    }
}
