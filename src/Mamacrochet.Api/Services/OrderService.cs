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

        // Plan 07 gates (rule 2/3/5): staff may only move to paid with a
        // receipt on file, to delivered with a delivery record, and close
        // with a receipt on file. Admins may bypass each gate — the bypass
        // (like every out-of-matrix move) is flagged AdminOnly, so the
        // mandatory reason stays in the admin trace only.
        bool inMatrix = false;
        bool gateBypass = false;
        string? gateError = null;
        if (trimmedStatus is OrderStatus.Paid or OrderStatus.Delivered or OrderStatus.Closed)
        {
            inMatrix = IsInMatrix(order.Status, trimmedStatus);
            var hasReceipt = await db.Payments.AnyAsync(
                p => p.OrderId == order.Id && p.ReceiptFileId != null, ct);
            var hasDelivery = trimmedStatus == OrderStatus.Delivered
                ? await db.Deliveries.AnyAsync(d => d.OrderId == order.Id, ct)
                : false;
            if (actorRole != "admin")
            {
                if (!inMatrix)
                {
                    gateError = "Invalid order status change.";
                }
                else if (trimmedStatus == OrderStatus.Paid && !hasReceipt)
                {
                    gateError = "A receipt must be recorded before the order can be paid.";
                }
                else if (trimmedStatus == OrderStatus.Delivered && !hasDelivery)
                {
                    gateError = "A delivery record is required before the order can be delivered.";
                }
                else if (trimmedStatus == OrderStatus.Closed && !hasReceipt)
                {
                    gateError = "This order has no receipt on file — an admin can close it with a written reason.";
                }
            }
            else
            {
                gateBypass = (trimmedStatus is OrderStatus.Paid or OrderStatus.Closed && !hasReceipt)
                    || (trimmedStatus == OrderStatus.Delivered && !hasDelivery);
            }
        }
        else
        {
            inMatrix = IsInMatrix(order.Status, trimmedStatus);
            gateBypass = false;
            if (!inMatrix && actorRole != "admin")
            {
                gateError = "Invalid order status change.";
            }
        }

        if (gateError is not null)
        {
            return Conflict(gateError);
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
            // Out-of-matrix moves and gate bypasses are admin overrides:
            // the reason stays in the admin trace only (plan 07 rule 3).
            AdminOnly = !inMatrix || gateBypass,
            ActorId = actorId,
            ActorName = actorName,
            ActorRole = actorRole,
            At = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    // ---- Plan 07: payment, delivery, confirm delivery --------------------

    /// <summary>
    /// Record the payment and move the order to `paid` (rule 2): the
    /// receipt file is mandatory for staff, optional for admins — then a
    /// written reason note is mandatory and the event stays in the admin
    /// trace only (rule 3). One payment per order.
    /// </summary>
    public async Task<TransitionResult> RecordPaymentAsync(
        string orderId,
        decimal? amount,
        string? method,
        string? note,
        UploadFile? receipt,
        string? actorId,
        string actorName,
        string actorRole, // employee | admin
        CancellationToken ct)
    {
        var order = await db.Orders
            .Include(o => o.Payment)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (order.Payment is not null)
        {
            return Conflict("This order already has a recorded payment.");
        }

        if (order.Status != OrderStatus.ReadyForPayment)
        {
            return Conflict(
                "Payment can only be recorded when the order is ready for payment.");
        }

        if (amount is null or <= 0 or > 10_000_000)
        {
            return new TransitionResult(Invalid("Enter the paid amount."), null);
        }

        var trimmedMethod = method?.Trim();
        if (trimmedMethod is null || trimmedMethod.Length is < 1 or > 100)
        {
            return new TransitionResult(Invalid("Enter the payment method."), null);
        }

        var trimmedNote = note?.Trim();
        if (trimmedNote is not null && trimmedNote.Length > 500)
        {
            return new TransitionResult(Invalid("The note is too long (500 characters max)."), null);
        }

        OrderAttachment? receiptFile = null;
        if (receipt is null)
        {
            if (actorRole != "admin")
            {
                return new TransitionResult(
                    new ApiError("receipt_required", "A receipt file (PDF or image) is required."),
                    null);
            }

            // Admin override without a receipt: the written reason is mandatory.
            if (trimmedNote is null || trimmedNote.Length == 0)
            {
                return new TransitionResult(
                    Invalid("Recording a payment without a receipt requires a reason note."),
                    null);
            }
        }
        else
        {
            var (file, error) = await SaveProofFileAsync(order, "receipt", receipt, actorId, ct);
            if (error is not null)
            {
                return new TransitionResult(error, null);
            }

            receiptFile = file;
        }

        var now = DateTime.UtcNow;
        var payment = new Payment
        {
            OrderId = order.Id,
            Amount = amount!.Value,
            Currency = order.Currency,
            Method = trimmedMethod!,
            Note = trimmedNote,
            ReceiptFileId = receiptFile?.Id,
            RecordedById = actorId,
            RecordedAt = now,
        };

        order.Payment = payment;
        order.Status = OrderStatus.Paid;
        order.UpdatedAt = now;
        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "payment",
            Status = OrderStatus.Paid,
            Note = trimmedNote,
            AdminOnly = receipt is null, // admin override — rule 3
            ActorId = actorId,
            ActorName = actorName,
            ActorRole = actorRole,
            At = now,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    /// <summary>
    /// Record the delivery and move the order to `delivered` (rule 4):
    /// method + actual date/time are mandatory, description + proof file
    /// optional. One delivery per order.
    /// </summary>
    public async Task<TransitionResult> RecordDeliveryAsync(
        string orderId,
        string? method,
        DateTime? actualAt,
        string? description,
        UploadFile? proof,
        string? actorId,
        string actorName,
        string actorRole, // employee | admin
        CancellationToken ct)
    {
        var order = await db.Orders
            .Include(o => o.Delivery)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null)
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (order.Delivery is not null)
        {
            return Conflict("This order already has a recorded delivery.");
        }

        if (order.Status != OrderStatus.Paid)
        {
            return Conflict("Delivery can only be recorded once the order is paid.");
        }

        var trimmedMethod = method?.Trim();
        if (trimmedMethod is null || trimmedMethod.Length is < 1 or > 100)
        {
            return new TransitionResult(Invalid("Enter the delivery method."), null);
        }

        if (actualAt is null)
        {
            return new TransitionResult(Invalid("Enter the actual delivery date and time."), null);
        }

        var actual = actualAt.Value;
        if (actual > DateTime.UtcNow.AddDays(1) || actual < DateTime.UtcNow.AddYears(-5))
        {
            return new TransitionResult(
                Invalid("The delivery date/time looks wrong — it must be the actual moment the piece was handed over."),
                null);
        }

        var trimmedDescription = description?.Trim();
        if (trimmedDescription is not null && trimmedDescription.Length > 500)
        {
            return new TransitionResult(Invalid("The description is too long (500 characters max)."), null);
        }

        OrderAttachment? proofFile = null;
        if (proof is not null)
        {
            var (file, error) = await SaveProofFileAsync(order, "delivery-proof", proof, actorId, ct);
            if (error is not null)
            {
                return new TransitionResult(error, null);
            }

            proofFile = file;
        }

        var now = DateTime.UtcNow;
        var delivery = new Delivery
        {
            OrderId = order.Id,
            Method = trimmedMethod!,
            ActualAt = actual,
            Description = trimmedDescription,
            ProofFileId = proofFile?.Id,
            RecordedById = actorId,
            RecordedAt = now,
        };

        order.Delivery = delivery;
        order.Status = OrderStatus.Delivered;
        order.UpdatedAt = now;
        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "delivery",
            Status = OrderStatus.Delivered,
            Note = trimmedDescription,
            ActorId = actorId,
            ActorName = actorName,
            ActorRole = actorRole,
            At = now,
        });

        await db.SaveChangesAsync(ct);
        return new TransitionResult(null, order);
    }

    /// <summary>
    /// The customer's optional "delivered ✓" (rule 5): input, not a gate —
    /// the order is already delivered when this is possible. Once per order.
    /// </summary>
    public async Task<TransitionResult> ConfirmDeliveryAsync(
        string orderId,
        AppUser customer,
        CancellationToken ct)
    {
        var order = await db.Orders
            .Include(o => o.Timeline)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null || !await SeeByCustomerAsync(db, customer, order, ct))
        {
            return new TransitionResult(ApiError.NotFound("order_not_found"), null);
        }

        if (order.Status != OrderStatus.Delivered)
        {
            return Conflict("You can confirm the delivery once it has been made.");
        }

        if (order.Timeline.Any(e => e.Kind == "confirmation"))
        {
            return new TransitionResult(
                new ApiError("already_confirmed", "The delivery is already confirmed."), null);
        }

        order.Timeline.Add(new OrderEvent
        {
            OrderId = order.Id,
            Kind = "confirmation",
            Note = null,
            ActorId = customer.Id,
            ActorName = customer.DisplayName,
            ActorRole = "customer",
            At = DateTime.UtcNow,
        });
        order.UpdatedAt = DateTime.UtcNow;

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

        // The cap is on photos (sample/wip): receipts and delivery proofs
        // (plan 07) are single staff files and don't count against it.
        var existing = await db.OrderAttachments
            .CountAsync(f => f.OrderId == orderId && (f.Kind == "sample" || f.Kind == "wip"), ct);
        if (existing + files.Count > MaxSampleFiles)
        {
            return new TransitionResult(
                new ApiError("attachment_too_many", $"An order keeps at most {MaxSampleFiles} photos."), null);
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

    /// <summary>
    /// A single proof file (plan 07: receipt | delivery-proof) — PDF or
    /// image, magic-byte-validated like the other uploads (the client's
    /// Content-Type label is never trusted). Auth-protected: served staff/
    /// admin only (the file route keeps sample/wip as the customer kinds).
    /// </summary>
    private async Task<(OrderAttachment? File, ApiError? Error)> SaveProofFileAsync(
        Order order,
        string kind,
        UploadFile file,
        string? actorId,
        CancellationToken ct)
    {
        if (file.Bytes.Length > MaxFileBytes)
        {
            return (null, new ApiError("file_too_big", "The file must be under 10 MB."));
        }

        var extension = HiringFiles.DetectExtension(file.Bytes);
        if (extension is null)
        {
            return (null, new ApiError("file_invalid", "The file must be a PDF or an image (jpg, png, webp)."));
        }

        var directory = Path.Combine(uploads.Value.Root, "orders", order.Id);
        Directory.CreateDirectory(directory);

        var attachment = new OrderAttachment
        {
            OrderId = order.Id,
            Kind = kind,
            OriginalName = TruncateName(file.OriginalName),
            ContentType = HiringFiles.ContentType(extension),
            Bytes = file.Bytes.Length,
            UploadedById = actorId,
            CreatedAt = DateTime.UtcNow,
        };
        attachment.StoredName = $"{attachment.Id}{extension}";
        await File.WriteAllBytesAsync(
            Path.Combine(directory, attachment.StoredName), file.Bytes, ct);
        order.Attachments.Add(attachment);

        return (attachment, null);
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
