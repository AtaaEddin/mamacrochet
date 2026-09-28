using System.Linq.Expressions;
using Mamacrochet.Api.Data;
using Mamacrochet.Api.Endpoints;
using Mamacrochet.Api.Models;
using Mamacrochet.Api.QuerySpec;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Mamacrochet.Api.Services;

/// <summary>
/// Domain rules for orders (plan 05): guest-first creation (D14/D16), the
/// lifecycle state machine (every transition guarded), timeline events
/// (the customer status board AND the admin trace), notes, per-order
/// assignment, ratings, attachments, 7-day auto-cancel of unconfirmed guest
/// orders, and the per-employee admin metrics.
/// </summary>
public sealed class OrderService(AppDbContext db, IOptions<UploadsOptions> uploads)
{
    public const int MaxSampleFiles = 5;
    public const long MaxFileBytes = 10_485_760; // 10 MB
    public static readonly TimeSpan AutoCancelAfter = TimeSpan.FromDays(7);

    private static readonly Dictionary<string, string[]> Transitions = new(StringComparer.OrdinalIgnoreCase)
    {
        [OrderStatus.Open] = [OrderStatus.InProgress, OrderStatus.Cancelled],
        [OrderStatus.InProgress] = [OrderStatus.ReadyForPayment, OrderStatus.Cancelled],
        [OrderStatus.ReadyForPayment] = [OrderStatus.Paid],
        [OrderStatus.Paid] = [OrderStatus.Delivered],
        [OrderStatus.Delivered] = [OrderStatus.Closed],
    };

    public static bool IsInMatrix(string from, string to) =>
        Transitions.TryGetValue(from, out var next)
            && next.Contains(to, StringComparer.OrdinalIgnoreCase);

    // ---- Guest-friendly creation -----------------------------------------

    public async Task<CreateOrderResult> CreateAsync(
        CreateOrderInput input,
        AppUser? actor,
        CancellationToken ct)
    {
        // Honeypot (D16): bots fill the hidden field — answer warmly, store nothing.
        if (!string.IsNullOrWhiteSpace(input.Honeypot))
        {
            return new CreateOrderResult(null, null, true);
        }

        var kind = (input.Kind ?? "").Trim().ToLowerInvariant();
        if (kind is not ("catalog" or "custom"))
        {
            return new CreateOrderResult(
                Invalid("Order kind must be 'catalog' or 'custom'."), null, false);
        }

        if (!GuestLinkService.IsValidGuestId(input.GuestId))
        {
            return new CreateOrderResult(
                Invalid("Guest id is missing or invalid."), null, false);
        }

        var name = (input.Name ?? "").Trim();
        var phone = (input.Phone ?? "").Trim();
        var email = (input.Email ?? "").Trim();
        var spec = (input.Spec ?? "").Trim();
        if (name.Length is < 2 or > 80)
        {
            return new CreateOrderResult(
                Invalid("Please enter your name (2-80 characters)."), null, false);
        }

        if (phone.Length is < 3 or > 20)
        {
            return new CreateOrderResult(
                Invalid("Please enter a contact phone number."), null, false);
        }

        if (email.Length > 320)
        {
            return new CreateOrderResult(
                Invalid("The e-mail address is too long."), null, false);
        }

        if (kind == "custom" && spec.Length is < 1 or > 4000)
        {
            return new CreateOrderResult(
                Invalid("Please describe the piece you'd like (1-4000 characters)."),
                null, false);
        }

        if (spec.Length > 4000)
        {
            return new CreateOrderResult(
                Invalid("The note is too long (4000 characters max)."), null, false);
        }

        // Catalog orders buy a listed product; custom orders may reference
        // one ("request this as custom") but the product is optional there.
        Product? product = null;
        if (!string.IsNullOrWhiteSpace(input.ProductId))
        {
            product = await db.Products.AsNoTracking()
                .Include(p => p.Translations)
                .Include(p => p.Images)
                .FirstOrDefaultAsync(p => p.Id == input.ProductId!.Trim() && p.DeletedAt == null, ct);
            if (product is null
                || (kind == "catalog" && !product.IsListed))
            {
                return new CreateOrderResult(ApiError.NotFound("product_not_found"), null, false);
            }
        }
        else if (kind == "catalog")
        {
            return new CreateOrderResult(ApiError.NotFound("product_not_found"), null, false);
        }

        // D16 caps (guests only — signed-in callers are confirmed): 3 open
        // unowned guest orders per device AND per phone.
        if (actor is null)
        {
            IQueryable<Order> openUnlinked = db.Orders.AsQueryable().Where(o =>
                o.CustomerId == null
                && (o.Status == OrderStatus.Open
                    || o.Status == OrderStatus.InProgress
                    || o.Status == OrderStatus.ReadyForPayment
                    || o.Status == OrderStatus.Paid));
            var byDevice = await openUnlinked.CountAsync(o => o.GuestId == input.GuestId, ct);
            var byPhone = await openUnlinked.CountAsync(o => o.ContactPhone == phone, ct);
            if (byDevice >= 3 || byPhone >= 3)
            {
                return new CreateOrderResult(
                    new ApiError("guest_cap", "Too many open orders from this device. " +
                        "Sign in, or wait a few days for older ones to close."),
                    null, false);
            }
        }

        var now = DateTime.UtcNow;
        var order = new Order
        {
            Kind = kind,
            Status = OrderStatus.Open,
            GuestId = input.GuestId!.Trim(),
            ContactName = name,
            ContactPhone = phone,
            ContactEmail = email.Length > 0 ? email : null,
            ProductId = product?.Id,
            Spec = spec.Length > 0 ? spec : null,
            EstimatedPrice = kind == "catalog" ? product!.Price : null,
            Currency = kind == "catalog" ? product!.Currency : "USD",
            CreatedAt = now,
            UpdatedAt = now,
        };

        // Signed-in customers order through the same flow: the order is
        // theirs from the start, and the device guest is linked (first
        // wins) — with D14 backfill so the device's earlier guest orders
        // join the account too.
        if (actor is not null)
        {
            order.CustomerId = actor.Id;
        var byUser = await db.GuestAccountLinks.AnyAsync(g => g.UserId == actor.Id);
        if (!byUser)
        {
            db.GuestAccountLinks.Add(new GuestAccountLink(order.GuestId!, actor.Id, now));
        }

        // D14 backfill: attribute the device's earlier unowned orders.
        var unowned = await db.Orders
            .Where(o => o.GuestId == order.GuestId && o.CustomerId == null)
            .ToListAsync(ct);
        foreach (var old in unowned)
        {
            old.CustomerId = actor.Id;
            old.UpdatedAt = now;
        }
        }

        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "status",
            Status = OrderStatus.Open,
            ActorId = actor?.Id,
            ActorName = actor?.DisplayName ?? name,
            ActorRole = "customer",
            At = now,
        });

        var fileError = await SaveAttachmentsAsync(order, "sample", input.Files, actor?.Id, ct);
        if (fileError is not null)
        {
            return new CreateOrderResult(fileError, null, false);
        }

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return new CreateOrderResult(null, order, false);
    }

    // ---- State machine ---------------------------------------------------

    public async Task<TransitionResult> TransitionAsync(
        string orderId,
        string newStatus,
        string? note,
        decimal? finalPrice,
        string? actorId,
        string actorName,
        string actorRole, // customer | employee | admin
        CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        var trimmedStatus = newStatus.Trim().ToLowerInvariant();
        if (!OrderStatus.IsValid(trimmedStatus))
        {
            return new TransitionResult(Invalid("Unknown order status."), null);
        }

        if (OrderStatus.IsTerminal(order.Status))
        {
            return Conflict("This order is already " + order.Status + ".");
        }

        if (trimmedStatus == order.Status)
        {
            return Conflict("The order is already in this state.");
        }

        var trimmedNote = note?.Trim();
        if (actorRole == "admin"
            && (trimmedNote is null || trimmedNote.Length is < 1 or > 1000))
        {
            return new TransitionResult(
                Invalid("Admin status changes require a reason note."), null);
        }

        var inMatrix = IsInMatrix(order.Status, trimmedStatus);
        if (!inMatrix && actorRole != "admin")
        {
            return Conflict("Invalid order status change.");
        }

        if (trimmedStatus == OrderStatus.Cancelled
            && (trimmedNote is null || trimmedNote.Length is < 1 or > 1000))
        {
            return new TransitionResult(Invalid("Cancelling requires a reason."), null);
        }

        if (trimmedStatus == OrderStatus.ReadyForPayment && finalPrice is null or <= 0)
        {
            return new TransitionResult(
                Invalid("Setting ready requires the final price."), null);
        }

        order.Status = trimmedStatus;
        order.UpdatedAt = DateTime.UtcNow;
        if (trimmedStatus == OrderStatus.ReadyForPayment)
        {
            order.FinalPrice = finalPrice;
        }

        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "status",
            Status = trimmedStatus,
            Note = trimmedNote,
            // Out-of-matrix moves are admin overrides: the reason stays in
            // the admin trace only (plan 07 rule 3).
            AdminOnly = !inMatrix,
            ActorId = actorId,
            ActorName = actorName,
            ActorRole = actorRole,
            At = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    // ---- Notes, assignment, rating ----------------------------------------

    public async Task<TransitionResult> AddNoteAsync(
        string orderId,
        string text,
        string? actorId,
        string actorName,
        string actorRole,
        CancellationToken ct)
    {
        var trimmed = text?.Trim();
        if (trimmed is null || trimmed.Length is < 1 or > 1000)
        {
            return new TransitionResult(Invalid("Note must be 1-1000 characters."), null);
        }

        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (OrderStatus.IsTerminal(order.Status))
        {
            return new TransitionResult(
                new ApiError("order_closed", "This order is " + order.Status + "."), null);
        }

        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "note",
            Note = trimmed,
            ActorId = actorId,
            ActorName = actorName,
            ActorRole = actorRole,
            At = DateTime.UtcNow,
        });
        order.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    public async Task<TransitionResult> AssignAsync(
        string orderId,
        string? employeeId,
        string actorName,
        CancellationToken ct)
    {
        var trimmedId = string.IsNullOrWhiteSpace(employeeId)
            ? null
            : employeeId.Trim();

        AppUser? employee = null;
        if (trimmedId is not null)
        {
            employee = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == trimmedId && u.DeletedAt == null, ct);
            if (employee is null || !employee.IsEmployee || !employee.IsActive)
            {
                return new TransitionResult(Invalid("Assigned employee not found."), null);
            }
        }

        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (order.AssignedEmployeeId == trimmedId)
        {
            return new TransitionResult(null, order);
        }

        order.AssignedEmployeeId = trimmedId;
        order.UpdatedAt = DateTime.UtcNow;
        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "assignment",
            Note = employee?.DisplayName,
            ActorId = null,
            ActorName = actorName,
            ActorRole = "admin",
            At = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    public async Task<TransitionResult> RateAsync(
        string orderId,
        int score,
        string? comment,
        AppUser customer,
        CancellationToken ct)
    {
        if (score is < 1 or > 5)
        {
            return new TransitionResult(Invalid("Rating must be between 1 and 5."), null);
        }

        var trimmed = comment?.Trim();
        if (trimmed is not null && trimmed.Length > 500)
        {
            return new TransitionResult(Invalid("Comment must be 500 characters max."), null);
        }

        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null || await SeeByCustomerAsync(db, customer, order, ct) is not true)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (order.Status != OrderStatus.Closed)
        {
            return new TransitionResult(
                new ApiError("not_finished", "You can rate this order once it is closed."), null);
        }

        if (order.Rating is not null)
        {
            return new TransitionResult(
                new ApiError("already_rated", "You already rated this order."), null);
        }

        order.Rating = (byte)score;
        order.RatingComment = trimmed;
        order.RatedAt = DateTime.UtcNow;

        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "rating",
            Note = trimmed,
            ActorId = customer.Id,
            ActorName = customer.DisplayName,
            ActorRole = "customer",
            At = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    // ---- Attachments (samples at creation, WIP from staff) ---------------

    public async Task<TransitionResult> AddAttachmentsAsync(
        string orderId,
        string kind,
        IReadOnlyList<UploadFile> files,
        string? actorId,
        CancellationToken ct)
    {
        var trimmedKind = kind.Trim().ToLowerInvariant();
        if (trimmedKind is not ("sample" or "wip"))
        {
            return new TransitionResult(
                Invalid("Attachment kind must be 'sample' or 'wip'."), null);
        }

        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        var existing = await db.OrderAttachments.CountAsync(f => f.OrderId == orderId, ct);
        if (existing + files.Count > MaxSampleFiles)
        {
            return new TransitionResult(
                new ApiError("attachment_too_many", $"An order keeps at most {MaxSampleFiles} files."), null);
        }

        var error = await SaveAttachmentsAsync(order, trimmedKind, files, actorId, ct);
        if (error is not null)
        {
            return new TransitionResult(error, null);
        }

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    private async Task<ApiError?> SaveAttachmentsAsync(
        Order order,
        string kind,
        IReadOnlyList<UploadFile> files,
        string? actorId,
        CancellationToken ct)
    {
        if (files.Count > MaxSampleFiles)
        {
            return new ApiError("attachment_too_many", $"At most {MaxSampleFiles} files.");
        }

        var directory = Path.Combine(uploads.Value.Root, "orders", order.Id);
        Directory.CreateDirectory(directory);

        foreach (var file in files)
        {
            if (file.Bytes.Length > MaxFileBytes)
            {
                return new ApiError("file_too_big", "Each file must be under 10 MB.");
            }

            var extension = AvatarImages.DetectExtension(file.Bytes);
            if (extension is null)
            {
                return new ApiError("file_invalid", "Files must be jpg, png or webp images.");
            }

            var attachment = new OrderAttachment
            {
                OrderId = order.Id,
                Kind = kind,
                OriginalName = TruncateName(file.OriginalName),
                ContentType = AvatarImages.ContentType(extension),
                Bytes = file.Bytes.Length,
                UploadedById = actorId,
                CreatedAt = DateTime.UtcNow,
            };
            attachment.StoredName = $"{attachment.Id}{extension}";
            await File.WriteAllBytesAsync(
                Path.Combine(directory, attachment.StoredName), file.Bytes, ct);
            order.Attachments.Add(attachment);
        }

        return null;
    }

    // ---- Auto-cancel (D16) ------------------------------------------------

    /// <summary>
    /// Unconfirmed guest orders (no account linked) older than 7 days are
    /// cancelled with a system event. Terminal statuses are never touched.
    /// Called by the hosted sweep and lazily on order reads.
    /// </summary>
    public async Task<int> EnsureAutoCancelledAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow - AutoCancelAfter;
        var stale = await db.Orders
            .Where(o => o.CustomerId == null
                && o.GuestId != null
                && (o.Status == OrderStatus.Open
                    || o.Status == OrderStatus.InProgress
                    || o.Status == OrderStatus.ReadyForPayment)
                && o.CreatedAt < cutoff)
            .ToListAsync(ct);

        if (stale.Count == 0)
        {
            return 0;
        }

        var now = DateTime.UtcNow;
        foreach (var order in stale)
        {
            order.Status = OrderStatus.Cancelled;
            order.UpdatedAt = now;
            order.Timeline.Add(new OrderEvent
            {
                OrderId = order.Id,
                Kind = "auto",
                Status = OrderStatus.Cancelled,
                ActorName = "system",
                ActorRole = "system",
                At = now,
            });
        }

        return await db.SaveChangesAsync(ct);
    }

    // ---- Admin metrics ----------------------------------------------------

    public async Task<OrderMetrics> MetricsAsync(CancellationToken ct)
    {
        var employees = await db.Users.AsNoTracking()
            .Where(u => u.DeletedAt == null && u.IsActive && u.IsEmployee)
            .OrderBy(u => u.DisplayName)
            .ToListAsync(ct);

        var deliveredAt = (await db.OrderEvents.AsNoTracking()
            .Where(e => e.Status == OrderStatus.Delivered)
            .ToDictionaryAsync(e => e.OrderId, e => e.At, ct));

        var orders = await db.Orders.AsNoTracking()
            .Include(o => o.Customer)
            .Where(o => o.Status != OrderStatus.Cancelled)
            .ToListAsync(ct);

        var rows = employees
            .Select(e =>
            {
                var mine = orders
                    .Where(o => o.AssignedEmployeeId == e.Id
                        || (o.AssignedEmployeeId == null && o.Customer?.AssignedEmployeeId == e.Id))
                    .ToList();
                var days = mine
                    .Where(o => o.Status is OrderStatus.Delivered or OrderStatus.Closed
                        && deliveredAt.TryGetValue(o.Id, out var at))
                    .Select(o => (deliveredAt[o.Id] - o.CreatedAt).TotalDays)
                    .ToList();
                var ratings = mine
                    .Where(o => o.Rating is not null)
                    .Select(o => o.Rating!.Value)
                    .ToList();
                return new OrderEmployeeMetric(
                    e.Id,
                    e.DisplayName,
                    mine.Count(o => o.Status == OrderStatus.Closed),
                    days.Count > 0 ? Math.Round(days.Average(), 1) : null,
                    ratings.Count > 0 ? Math.Round(ratings.Average(r => (double)r), 1) : null);
            })
            .ToList();

        return new OrderMetrics(
            rows,
            orders.Count(o => o.Status == OrderStatus.Open),
            orders.Count(o => o.Status == OrderStatus.InProgress),
            orders.Count(o => o.Status == OrderStatus.ReadyForPayment));
    }

    // ---- Visibility --------------------------------------------------------

    /// <summary>
    /// Employee view: assigned orders. Effective assignee = the order's own
    /// employee, else the customer's default handler (admin-assigned).
    /// </summary>
    public static IQueryable<Order> AssignedTo(AppDbContext db, AppUser user)
    {
        return db.Orders.Where(o => o.AssignedEmployeeId == user.Id
            || (o.AssignedEmployeeId == null
                && o.CustomerId != null
                && o.Customer!.AssignedEmployeeId == user.Id));
    }

    public static async Task<bool> SeeByStaffAsync(AppDbContext db, AppUser user, Order order, CancellationToken ct = default)
    {
        if (user.IsAdmin)
        {
            return true;
        }

        if (order.AssignedEmployeeId == user.Id)
        {
            return true;
        }

        if (order.CustomerId is null)
        {
            return false;
        }

        return await db.Users.AsNoTracking()
            .AnyAsync(u => u.Id == order.CustomerId && u.AssignedEmployeeId == user.Id, ct);
    }

    /// <summary>
    /// Customer view: own orders + this device's guest orders (D14) — the
    /// link row is what makes a guest's orders appear after registration.
    /// </summary>
    public static async Task<bool> SeeByCustomerAsync(
        AppDbContext db, AppUser user, Order order, CancellationToken ct = default)
    {
        if (order.CustomerId == user.Id)
        {
            return true;
        }

        if (order.GuestId is null)
        {
            return false;
        }

        return await db.GuestAccountLinks
            .AnyAsync(g => g.UserId == user.Id && g.GuestId == order.GuestId, ct);
    }

    private static string TruncateName(string original)
    {
        var name = Path.GetFileName(original);
        return name.Length > 200 ? name[^200..] : name;
    }

    private static ApiError Invalid(string message) => new("invalid", message);

    private static TransitionResult Conflict(string message) =>
        new(new ApiError("invalid_status_change", message), null);
}

/// <summary>Order creation input (form-bound; the endpoint reads the files).</summary>
public sealed record CreateOrderInput(
    string? Kind,
    string? ProductId,
    string? Name,
    string? Phone,
    string? Email,
    string? GuestId,
    string? Spec,
    string? Honeypot,
    IReadOnlyList<UploadFile> Files);

public sealed record CreateOrderResult(ApiError? Error, Order? Order, bool Honeypot);

public sealed record TransitionResult(ApiError? Error, Order? Order);
