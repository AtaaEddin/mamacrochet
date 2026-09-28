using Mamacrochet.Api.Data;

namespace Mamacrochet.Api.Models;

// ---- Plan 05: orders & status board -------------------------------------

public sealed record CancelOrderRequest(string Reason);

public sealed record RateOrderRequest(int Score, string? Comment);

/// <summary>
/// A status transition. Note is optional for staff moves (mandatory for
/// cancelled + every admin override); FinalPrice is required when moving to
/// ready_for_payment.
/// </summary>
public sealed record OrderStatusChangeRequest(string Status, string? Note, decimal? FinalPrice);

public sealed record OrderNoteRequest(string Text);

/// <summary>Per-order employee assignment (admin). Null clears it.</summary>
public sealed record OrderAssignmentRequest(string? EmployeeId);

public sealed record OrderCreated(string Id, string Status);

public sealed record OrderEventDto(
    string Id,
    string Kind,
    string? Status,
    string? Note,
    string ActorName,
    string ActorRole,
    DateTimeOffset At)
{
    public static OrderEventDto From(OrderEvent evt) => new(
        evt.Id,
        evt.Kind,
        evt.Status,
        evt.Note,
        evt.ActorName,
        evt.ActorRole,
        evt.At);
}

public sealed record OrderAttachmentDto(
    string Id,
    string Kind,
    string Url,
    string OriginalName,
    long Bytes,
    string? UploadedByName,
    DateTimeOffset CreatedAt)
{
    public static OrderAttachmentDto From(OrderAttachment file, string? uploadedByName) => new(
        file.Id,
        file.Kind,
        $"/files/orders/{file.OrderId}/{file.StoredName}",
        file.OriginalName,
        file.Bytes,
        uploadedByName,
        file.CreatedAt);
}

/// <summary>
/// The product behind an order (all localizations — the client picks the
/// language like the catalog does; null for pure custom orders).
/// </summary>
public sealed record OrderProductInfo(
    string Id,
    IReadOnlyList<LocalizedName> Localizations,
    decimal Price,
    string Currency,
    int StockUnits,
    bool InStock,
    string? CoverImageUrl)
{
    public static OrderProductInfo? From(Product? product)
    {
        if (product is null)
        {
            return null;
        }

        var cover = product.Images.OrderBy(i => i.SortOrder).FirstOrDefault();
        return new OrderProductInfo(
            product.Id,
            product.Translations
                .OrderBy(t => t.Language)
                .Select(t => new LocalizedName(t.Language, t.Title))
                .ToList(),
            product.Price,
            product.Currency,
            product.StockUnits,
            product.StockUnits > 0,
            cover is null ? null : ProductDto.ImageDto(cover).Url);
    }
}

/// <summary>
/// One order row (customer "my orders", staff queue, admin table — the same
/// shape for all three; role-specific reads filter the rows, not the shape).
/// </summary>
public sealed record OrderSummary(
    string Id,
    string Kind,
    string Status,
    OrderProductInfo? Product,
    string ContactName,
    string? CustomerName,
    string? AssignedEmployeeName,
    decimal? Price,
    string Currency,
    byte? Rating,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static OrderSummary From(Order order) => new(
        order.Id,
        order.Kind,
        order.Status,
        OrderProductInfo.From(order.Product),
        order.ContactName,
        order.Customer?.DisplayName,
        order.AssignedEmployee?.DisplayName,
        order.FinalPrice ?? order.EstimatedPrice,
        order.Currency,
        order.Rating,
        order.CreatedAt,
        order.UpdatedAt);
}

/// <summary>
/// The order detail = the status board. Timeline is role-filtered
/// (AdminOnly events never reach the customer); attachments the same
/// (customers see sample/wip only).
/// </summary>
public sealed record OrderDetail(
    string Id,
    string Kind,
    string Status,
    string ContactName,
    string ContactPhone,
    string? ContactEmail,
    bool GuestLinked,
    OrderProductInfo? Product,
    string? Spec,
    decimal? EstimatedPrice,
    decimal? FinalPrice,
    string Currency,
    string? CustomerName,
    string? AssignedEmployeeId,
    string? AssignedEmployeeName,
    byte? Rating,
    string? RatingComment,
    DateTimeOffset? RatedAt,
    IReadOnlyList<OrderEventDto> Timeline,
    IReadOnlyList<OrderAttachmentDto> Attachments,
    bool CanCancel,
    bool CanRate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record OrderPage(
    IReadOnlyList<OrderSummary> Items,
    int Total,
    int Page,
    int PageSize);

/// <summary>Internal paged result of the order listing (entities, pre-map).</summary>
public sealed record OrderListPage(
    IReadOnlyList<Order> Items,
    int Total,
    int Page,
    int PageSize);

/// <summary>One employee row of the admin metrics panel.</summary>
public sealed record OrderEmployeeMetric(
    string EmployeeId,
    string EmployeeName,
    int CompletedOrders,
    double? AvgDaysOpenToDelivered,
    double? AvgRating);

/// <summary>Admin metrics (D4): per-employee speed + quality.</summary>
public sealed record OrderMetrics(
    IReadOnlyList<OrderEmployeeMetric> Employees,
    int OpenOrders,
    int InProgressOrders,
    int ReadyForPaymentOrders);
