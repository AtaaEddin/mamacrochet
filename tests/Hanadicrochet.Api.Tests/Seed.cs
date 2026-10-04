using Hanadicrochet.Api.Data;
using Microsoft.Extensions.DependencyInjection;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Domain-entity seeding for service tests (direct <see cref="AppDbContext"/>
/// writes in the test's DI scope — the same context instance the services
/// under test receive).
/// </summary>
public static class Seed
{
    public static AppDbContext Db(this IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<AppDbContext>();

    /// <summary>A minimal order row (the service tests mutate it freely).</summary>
    public static Order Order(
        AppDbContext db,
        string status = OrderStatus.Open,
        string? customerId = null,
        string? guestId = null,
        DateTime? createdAt = null)
    {
        var at = createdAt ?? DateTime.UtcNow;
        var order = new Order
        {
            Kind = "custom",
            Status = status,
            CustomerId = customerId,
            GuestId = guestId,
            ContactName = "Guest",
            ContactPhone = $"+1 555 {Guid.NewGuid().ToString("N")[..4]}",
            CreatedAt = at,
            UpdatedAt = at,
        };
        db.Orders.Add(order);
        return order;
    }

    /// <summary>A listed product with an English translation.</summary>
    public static Product Product(
        AppDbContext db,
        decimal price = 42,
        bool listed = true,
        string? title = null)
    {
        var product = new Product
        {
            Price = price,
            StockUnits = 3,
            IsListed = listed,
            CreatedAt = DateTime.UtcNow,
        };
        product.Translations.Add(new ProductTranslation
        {
            Language = "en",
            Title = (title ?? "Crochet bag") + " " + Guid.NewGuid().ToString("N")[..8],
        });
        db.Products.Add(product);
        return product;
    }

    /// <summary>A chat thread row.</summary>
    public static ChatThread Thread(
        AppDbContext db,
        string kind,
        string? guestId = null,
        string? customerId = null,
        string? orderId = null,
        string? assignedEmployeeId = null,
        bool closed = false,
        DateTime? lastMessageAt = null,
        DateTime? createdAt = null)
    {
        var at = createdAt ?? DateTime.UtcNow;
        var thread = new ChatThread
        {
            Kind = kind,
            GuestId = guestId,
            CustomerId = customerId,
            OrderId = orderId,
            AssignedEmployeeId = assignedEmployeeId,
            IsClosed = closed,
            LastMessageAt = lastMessageAt,
            CreatedAt = at,
            UpdatedAt = at,
        };
        db.ChatThreads.Add(thread);
        return thread;
    }

    /// <summary>
    /// An orphan (unattached) chat attachment row (+ optional disk file).
    /// A referenced attachment is built in the test via message navigations.
    /// </summary>
    public static ChatAttachment Attachment(
        AppDbContext db,
        string threadId,
        DateTime? createdAt = null,
        bool writeFile = false,
        string uploadsRoot = "")
    {
        var at = createdAt ?? DateTime.UtcNow;
        var attachment = new ChatAttachment
        {
            ThreadId = threadId,
            StoredName = $"{Guid.NewGuid():N}.png",
            OriginalName = "photo.png",
            ContentType = "image/png",
            Bytes = FileFixtures.Png.Length,
            CreatedAt = at,
        };
        db.ChatAttachments.Add(attachment);
        if (writeFile && uploadsRoot.Length > 0)
        {
            var dir = Path.Combine(uploadsRoot, "chat", threadId);
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, attachment.StoredName), FileFixtures.Png);
        }
        return attachment;
    }

    public static OrderEvent DeliveredEvent(AppDbContext db, Order order, DateTime at)
    {
        var e = new OrderEvent
        {
            OrderId = order.Id,
            Kind = "delivery",
            Status = OrderStatus.Delivered,
            ActorName = "system",
            ActorRole = "system",
            At = at,
        };
        db.OrderEvents.Add(e);
        return e;
    }
}
