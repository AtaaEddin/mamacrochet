using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// OrderService domain rules (sub-plan 02): guest-first creation, the
/// lifecycle state machine, plan-07 payment/delivery gates, notes,
/// assignment, rating, auto-cancel, admin metrics.
/// </summary>
[Collection("Api")]
public class OrderServiceTests(ApiTestFixture _fx)
{
    private sealed class Ctx(IServiceScope scope, AppDbContext db, OrderService svc, AppUser employee) : IDisposable
    {
        public AppDbContext Db { get; } = db;
        public OrderService Svc { get; } = svc;
        public AppUser Employee { get; } = employee;

        public void Dispose() => scope.Dispose();
    }

    private async Task<Ctx> NewAsync()
    {
        var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<OrderService>();
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        return new Ctx(scope, db, svc, employee);
    }

    private static CreateOrderInput Input(
        string? kind = "custom",
        string? productId = null,
        string name = "Guest Tester",
        string? phone = null,
        string? email = null,
        string? guestId = null,
        string? spec = "a cozy bag",
        string? honeypot = null,
        IReadOnlyList<UploadFile>? files = null) =>
        // Unique phone per call: the D16 guest cap counts open unlinked
        // orders per phone globally (shared test DB).
        new(kind, productId, name,
            phone ?? "+1 555 " + Guid.NewGuid().ToString("N")[..10],
            email, guestId, spec, honeypot, files ?? []);

    private async Task<Order> MakeReadyAsync(Ctx c, Order order, decimal price = 50)
    {
        var r1 = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.InProgress, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(r1.Error);
        var r2 = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.ReadyForPayment, null, price,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(r2.Error);
        return r2.Order!;
    }

    // ---- Create ------------------------------------------------------------

    [Fact]
    public async Task Create_Catalog_SetsPriceAndOpenEvent()
    {
        using var c = await NewAsync();
        var product = Seed.Product(c.Db, price: 37);
        await c.Db.SaveChangesAsync();
        var guest = Guid.NewGuid().ToString();

        var r = await c.Svc.CreateAsync(Input("catalog", product.Id, guestId: guest), null, default);

        Assert.Null(r.Error);
        Assert.False(r.Honeypot);
        Assert.Equal(OrderStatus.Open, r.Order!.Status);
        Assert.Equal("catalog", r.Order.Kind);
        Assert.Equal(product.Id, r.Order.ProductId);
        Assert.Equal(37m, r.Order.EstimatedPrice);
        Assert.Equal("USD", r.Order.Currency);
        Assert.Single(r.Order.Timeline, e => e.Kind == "status" && e.Status == OrderStatus.Open);
        Assert.Equal("Guest Tester", r.Order.ContactName);
    }

    [Fact]
    public async Task Create_Custom_StoresSpec()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();

        var r = await c.Svc.CreateAsync(Input(guestId: guest, spec: "an amigurumi fox"), null, default);

        Assert.Null(r.Error);
        Assert.Equal("an amigurumi fox", r.Order!.Spec);
        Assert.Null(r.Order.EstimatedPrice);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("bogus")]
    public async Task Create_BadKind_Rejected(string? kind)
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(Input(kind, guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Create_BadGuestId_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(Input(guestId: "not-a-guid"), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Theory]
    [InlineData("G")]
    [InlineData("Guest Tester Guest Tester Guest Tester Guest Tester Guest Tester Guest Tester GUEST")] // > 80
    public async Task Create_BadName_Rejected(string name)
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(Input(name: name, guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Theory]
    [InlineData("+1")]
    [InlineData("+1 555 0100 12345678901234567")] // > 20
    public async Task Create_BadPhone_Rejected(string phone)
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(Input(phone: phone, guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Create_CustomWithoutSpec_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(
            Input(guestId: Guid.NewGuid().ToString(), spec: null), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Create_SpecTooLong_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(
            Input(guestId: Guid.NewGuid().ToString(), spec: new string('x', 4001)), null, default);
        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Create_CatalogWithoutProduct_NotFound()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(Input("catalog", guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Create_UnknownProduct_NotFound()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(
            Input("catalog", Guid.NewGuid().ToString(), guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Create_Catalog_UnlistedProduct_NotFound()
    {
        using var c = await NewAsync();
        var product = Seed.Product(c.Db, listed: false);
        await c.Db.SaveChangesAsync();
        var r = await c.Svc.CreateAsync(
            Input("catalog", product.Id, guestId: Guid.NewGuid().ToString()), null, default);
        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Create_GuestCap_FourthOpenOrderRejected()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();
        // Three open unowned orders already on this device.
        Seed.Order(c.Db, OrderStatus.Open, guestId: guest);
        Seed.Order(c.Db, OrderStatus.InProgress, guestId: guest);
        Seed.Order(c.Db, OrderStatus.ReadyForPayment, guestId: guest);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.CreateAsync(Input(guestId: guest), null, default);

        Assert.NotNull(r.Error);
        Assert.Equal("guest_cap", r.Error.Code);
        Assert.Null(r.Order);
    }

    [Fact]
    public async Task Create_SignedInOrdersAreNotCapped()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();
        Seed.Order(c.Db, OrderStatus.Open, guestId: guest);
        Seed.Order(c.Db, OrderStatus.Open, guestId: guest);
        Seed.Order(c.Db, OrderStatus.Open, guestId: guest);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.CreateAsync(Input(guestId: guest), customer, default);

        Assert.Null(r.Error);
        Assert.Equal(customer.Id, r.Order!.CustomerId);
    }

    [Fact]
    public async Task Create_Honeypot_StoresNothing()
    {
        using var c = await NewAsync();
        var before = await c.Db.Orders.CountAsync();

        var r = await c.Svc.CreateAsync(
            Input(guestId: Guid.NewGuid().ToString(), honeypot: "bot"), null, default);

        Assert.True(r.Honeypot);
        Assert.Null(r.Error);
        Assert.Equal(before, await c.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task Create_SampleFile_StoredOnDisk()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();

        var r = await c.Svc.CreateAsync(
            Input(guestId: guest, files: [new UploadFile("sample.png", FileFixtures.Png)]), null, default);

        Assert.Null(r.Error);
        var dir = Path.Combine(_fx.UploadsRoot, "orders", r.Order!.Id);
        var files = Directory.GetFiles(dir);
        Assert.Single(files);
        Assert.Equal(FileFixtures.Png, File.ReadAllBytes(files[0]));
    }

    [Fact]
    public async Task Create_SampleFile_TooBig_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(
            Input(guestId: Guid.NewGuid().ToString(), files: [new UploadFile("big.png", FileFixtures.TooBig)]), null, default);
        Assert.Equal("file_too_big", r.Error!.Code);
    }

    [Fact]
    public async Task Create_SampleFile_NonImage_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Svc.CreateAsync(
            Input(guestId: Guid.NewGuid().ToString(), files: [new UploadFile("note.pdf", FileFixtures.Pdf)]), null, default);
        Assert.Equal("file_invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Create_SignedIn_LinksDeviceAndBackfills()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();
        var earlier = Seed.Order(c.Db, OrderStatus.Open, guestId: guest);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.CreateAsync(Input(guestId: guest), customer, default);

        Assert.Null(r.Error);
        Assert.Equal(customer.Id, r.Order!.CustomerId);
        Assert.True(await c.Db.GuestAccountLinks.AnyAsync(g => g.GuestId == guest && g.UserId == customer.Id));
        await c.Db.Entry(earlier).ReloadAsync();
        Assert.Equal(customer.Id, earlier.CustomerId);
    }

    // ---- State machine ------------------------------------------------------

    [Fact]
    public async Task Lifecycle_FullHappyPath()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Open, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        await MakeReadyAsync(c, order);

        var pay = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("receipt.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(pay.Error);

        var del = await c.Svc.RecordDeliveryAsync(
            order.Id, "pickup", DateTime.UtcNow.AddHours(-1), "handed over", null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(del.Error);

        var confirm = await c.Svc.ConfirmDeliveryAsync(order.Id, customer, default);
        Assert.Null(confirm.Error);

        var close = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Closed, "done", null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(close.Error);

        var rate = await c.Svc.RateAsync(order.Id, 5, "love it", customer, default);
        Assert.Null(rate.Error);

        await c.Db.Entry(order).ReloadAsync();
        Assert.Equal(OrderStatus.Closed, order.Status);
        Assert.Equal((byte)5, order.Rating!.Value);
        Assert.Contains(order.Timeline, e => e.Kind == "confirmation");
        Assert.Contains(order.Timeline, e => e.Kind == "rating");
    }

    [Fact]
    public async Task Transition_InvalidEdge_Conflict()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.ReadyForPayment, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
        Assert.Equal(OrderStatus.Open, order.Status);
    }

    [Fact]
    public async Task Transition_TerminalStates_Immutable()
    {
        using var c = await NewAsync();
        var closed = Seed.Order(c.Db, OrderStatus.Closed);
        var cancelled = Seed.Order(c.Db, OrderStatus.Cancelled);
        await c.Db.SaveChangesAsync();

        var r1 = await c.Svc.TransitionAsync(
            closed.Id, OrderStatus.Open, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var r2 = await c.Svc.TransitionAsync(
            cancelled.Id, OrderStatus.Open, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r1.Error!.Code);
        Assert.Equal("invalid_status_change", r2.Error!.Code);
    }

    [Fact]
    public async Task Transition_SameStatus_Conflict()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Open, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_UnknownStatus_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, "bogus", null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_UnknownOrder_NotFound()
    {
        using var c = await NewAsync();
        var r = await c.Svc.TransitionAsync(
            Guid.NewGuid().ToString(), OrderStatus.InProgress, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_AdminChange_RequiresNote()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.InProgress, null, null,
            "admin-id", "Admin", "admin", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_ReadyRequiresFinalPrice()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.InProgress);
        await c.Db.SaveChangesAsync();

        var r0 = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.ReadyForPayment, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var r00 = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.ReadyForPayment, null, 0,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid", r0.Error!.Code);
        Assert.Equal("invalid", r00.Error!.Code);

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.ReadyForPayment, null, 75,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(r.Error);
        Assert.Equal(75m, r.Order!.FinalPrice);
    }

    [Fact]
    public async Task Transition_Cancel_RequiresNote()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r0 = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Cancelled, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid", r0.Error!.Code);

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Cancelled, "changed mind", null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(r.Error);
        Assert.Equal(OrderStatus.Cancelled, order.Status);
    }

    [Fact]
    public async Task Transition_EmployeePaid_WithoutReceipt_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Paid, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_EmployeeDelivered_WithoutRecord_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Delivered, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_EmployeeClosed_WithoutReceipt_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Delivered);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Closed, "done", null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task Transition_AdminOutOfMatrix_FlaggedAdminOnly()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.Closed, "admin override, no receipt in this test", null,
            "admin-id", "Admin", "admin", default);

        Assert.Null(r.Error);
        var e = r.Order!.Timeline.Last(t => t.Status == OrderStatus.Closed);
        Assert.True(e.AdminOnly);
    }

    [Fact]
    public async Task Transition_InMatrix_EventNotAdminOnly()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.TransitionAsync(
            order.Id, OrderStatus.InProgress, "starting", null,
            "admin-id", "Admin", "admin", default);

        Assert.Null(r.Error);
        var e = r.Order!.Timeline.Last(t => t.Status == OrderStatus.InProgress);
        Assert.False(e.AdminOnly);
    }

    // ---- Plan 07: payment -----------------------------------------------------

    [Fact]
    public async Task RecordPayment_StaffWithoutReceipt_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("receipt_required", r.Error!.Code);
    }

    [Fact]
    public async Task RecordPayment_WithReceipt_PaysOrder()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", "cash on delivery", new UploadFile("receipt.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Null(r.Error);
        Assert.Equal(OrderStatus.Paid, r.Order!.Status);
        Assert.NotNull(r.Order.Payment);
        Assert.Equal(50m, r.Order.Payment!.Amount);
        Assert.Equal("USD", r.Order.Payment.Currency);
        Assert.Equal("bank", r.Order.Payment.Method);
        Assert.NotNull(r.Order.Payment.ReceiptFileId);
        var receipt = await c.Db.OrderAttachments
            .FirstAsync(a => a.Id == r.Order.Payment!.ReceiptFileId);
        Assert.Equal("receipt", receipt.Kind);
        Assert.True(File.Exists(
            Path.Combine(_fx.UploadsRoot, "orders", order.Id, receipt.StoredName)));
        Assert.Contains(r.Order.Timeline, e => e.Kind == "payment" && e.Status == OrderStatus.Paid);
    }

    [Fact]
    public async Task RecordPayment_WrongStatus_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task RecordPayment_Duplicate_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        var first = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(first.Error);

        var second = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid_status_change", second.Error!.Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(10_000_001)]
    public async Task RecordPayment_BadAmount_Rejected(int amount)
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, amount, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task RecordPayment_NullAmount_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, null, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task RecordPayment_AdminWithoutReceipt_RequiresNote()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "cash", null, null,
            "admin-id", "Admin", "admin", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task RecordPayment_AdminWithoutReceipt_WithNote_PaysAdminOnly()
    {
        using var c = await NewAsync();
        var admin = await TestUsers.CreateAsync(_fx, "admin");
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);

        var r = await c.Svc.RecordPaymentAsync(
            order.Id, 50, "cash", "paid offline, receipt lost", null,
            admin.Id, admin.DisplayName, "admin", default);

        Assert.Null(r.Error);
        Assert.Equal(OrderStatus.Paid, r.Order!.Status);
        Assert.Null(r.Order.Payment!.ReceiptFileId);
        var e = r.Order.Timeline.Single(t => t.Kind == "payment");
        Assert.True(e.AdminOnly);
    }

    // ---- Plan 07: delivery -----------------------------------------------------

    [Fact]
    public async Task RecordDelivery_WrongStatus_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RecordDeliveryAsync(
            order.Id, "pickup", DateTime.UtcNow, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task RecordDelivery_RequiresMethodAndDate()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        var noMethod = await c.Svc.RecordDeliveryAsync(
            order.Id, null, DateTime.UtcNow, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var noDate = await c.Svc.RecordDeliveryAsync(
            order.Id, "pickup", null, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid", noMethod.Error!.Code);
        Assert.Equal("invalid", noDate.Error!.Code);
    }

    [Fact]
    public async Task RecordDelivery_ImpossibleDates_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        var future = await c.Svc.RecordDeliveryAsync(
            order.Id, "pickup", DateTime.UtcNow.AddDays(2), null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var past = await c.Svc.RecordDeliveryAsync(
            order.Id, "pickup", DateTime.UtcNow.AddYears(-6), null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid", future.Error!.Code);
        Assert.Equal("invalid", past.Error!.Code);
    }

    [Fact]
    public async Task RecordDelivery_Ok()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        var r = await c.Svc.RecordDeliveryAsync(
            order.Id, "post", DateTime.UtcNow.AddHours(-2), "sent by mail",
            new UploadFile("proof.jpg", FileFixtures.Jpeg),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Null(r.Error);
        Assert.Equal(OrderStatus.Delivered, r.Order!.Status);
        Assert.Equal("post", r.Order.Delivery!.Method);
        Assert.NotNull(r.Order.Delivery.ProofFileId);
        Assert.Contains(r.Order.Timeline, e => e.Kind == "delivery" && e.Status == OrderStatus.Delivered);
    }

    [Fact]
    public async Task RecordDelivery_Duplicate_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();
        order = await MakeReadyAsync(c, order);
        await c.Svc.RecordPaymentAsync(
            order.Id, 50, "bank", null, new UploadFile("r.pdf", FileFixtures.Pdf),
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var first = await c.Svc.RecordDeliveryAsync(
            order.Id, "post", DateTime.UtcNow, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Null(first.Error);

        var second = await c.Svc.RecordDeliveryAsync(
            order.Id, "post", DateTime.UtcNow, null, null,
            c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid_status_change", second.Error!.Code);
    }

    // ---- Confirm delivery --------------------------------------------------------

    [Fact]
    public async Task ConfirmDelivery_WrongStatus_Rejected()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Paid, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.ConfirmDeliveryAsync(order.Id, customer, default);

        Assert.Equal("invalid_status_change", r.Error!.Code);
    }

    [Fact]
    public async Task ConfirmDelivery_NotOwner_NotFound()
    {
        using var c = await NewAsync();
        var owner = await TestUsers.CreateAsync(_fx, "customer");
        var other = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Delivered, customerId: owner.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.ConfirmDeliveryAsync(order.Id, other, default);

        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task ConfirmDelivery_OkThenDuplicate()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Delivered, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var r1 = await c.Svc.ConfirmDeliveryAsync(order.Id, customer, default);
        var r2 = await c.Svc.ConfirmDeliveryAsync(order.Id, customer, default);

        Assert.Null(r1.Error);
        Assert.Equal("already_confirmed", r2.Error!.Code);
        Assert.Contains(order.Timeline, e => e.Kind == "confirmation");
    }

    // ---- Notes --------------------------------------------------------------------

    [Fact]
    public async Task AddNote_EmptyOrTooLong_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var e = await c.Svc.AddNoteAsync(order.Id, "  ", c.Employee.Id, c.Employee.DisplayName, "employee", default);
        var l = await c.Svc.AddNoteAsync(
            order.Id, new string('x', 1001), c.Employee.Id, c.Employee.DisplayName, "employee", default);
        Assert.Equal("invalid", e.Error!.Code);
        Assert.Equal("invalid", l.Error!.Code);
    }

    [Fact]
    public async Task AddNote_TerminalOrder_Locked()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Closed);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.AddNoteAsync(order.Id, "late note", c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Equal("order_closed", r.Error!.Code);
    }

    [Fact]
    public async Task AddNote_Ok()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.InProgress);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.AddNoteAsync(order.Id, "yarn is in", c.Employee.Id, c.Employee.DisplayName, "employee", default);

        Assert.Null(r.Error);
        Assert.Contains(order.Timeline, e => e.Kind == "note" && e.Note == "yarn is in");
    }

    // ---- Assignment ------------------------------------------------------------------

    [Fact]
    public async Task Assign_NonEmployee_Rejected()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.AssignAsync(order.Id, customer.Id, "Admin", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Assign_UnknownId_Rejected()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.AssignAsync(order.Id, Guid.NewGuid().ToString(), "Admin", default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Assign_Ok_SetsAssigneeAndEvent()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.AssignAsync(order.Id, c.Employee.Id, "Admin", default);

        Assert.Null(r.Error);
        Assert.Equal(c.Employee.Id, order.AssignedEmployeeId);
        Assert.Contains(order.Timeline, e => e.Kind == "assignment");
    }

    [Fact]
    public async Task Assign_SameEmployee_Idempotent()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        await c.Db.SaveChangesAsync();

        var r1 = await c.Svc.AssignAsync(order.Id, c.Employee.Id, "Admin", default);
        var r2 = await c.Svc.AssignAsync(order.Id, c.Employee.Id, "Admin", default);

        Assert.Null(r1.Error);
        Assert.Null(r2.Error);
        Assert.Single(order.Timeline, e => e.Kind == "assignment");
    }

    // ---- Rating -----------------------------------------------------------------------

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public async Task Rate_ScoreBounds_Rejected(int score)
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Closed);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RateAsync(order.Id, score, null, null!, default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    [Fact]
    public async Task Rate_NotClosed_Rejected()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Paid, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RateAsync(order.Id, 5, null, customer, default);

        Assert.Equal("not_finished", r.Error!.Code);
    }

    [Fact]
    public async Task Rate_OtherCustomer_NotFound()
    {
        using var c = await NewAsync();
        var owner = await TestUsers.CreateAsync(_fx, "customer");
        var other = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Closed, customerId: owner.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RateAsync(order.Id, 5, null, other, default);

        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Rate_OkThenDuplicate()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Closed, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var r1 = await c.Svc.RateAsync(order.Id, 4, "great", customer, default);
        var r2 = await c.Svc.RateAsync(order.Id, 5, null, customer, default);

        Assert.Null(r1.Error);
        Assert.Equal((byte)4, r1.Order!.Rating!.Value);
        Assert.Equal("already_rated", r2.Error!.Code);
    }

    [Fact]
    public async Task Rate_CommentTooLong_Rejected()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Closed, customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Svc.RateAsync(order.Id, 5, new string('x', 501), customer, default);

        Assert.Equal("invalid", r.Error!.Code);
    }

    // ---- Auto-cancel -------------------------------------------------------------------

    [Fact]
    public async Task AutoCancel_OldUnownedOnly()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var old = Seed.Order(c.Db, OrderStatus.Open, guestId: Guid.NewGuid().ToString(), createdAt: DateTime.UtcNow.AddDays(-8));
        var oldOwned = Seed.Order(c.Db, OrderStatus.Open, customerId: customer.Id, createdAt: DateTime.UtcNow.AddDays(-9));
        var fresh = Seed.Order(c.Db, OrderStatus.Open, guestId: Guid.NewGuid().ToString());
        var oldPaid = Seed.Order(c.Db, OrderStatus.Paid, guestId: Guid.NewGuid().ToString(), createdAt: DateTime.UtcNow.AddDays(-8));
        await c.Db.SaveChangesAsync();

        var n = await c.Svc.EnsureAutoCancelledAsync(default);

        Assert.True(n >= 1);
        Assert.Equal(OrderStatus.Cancelled, old.Status);
        Assert.Contains(old.Timeline, e => e.Kind == "auto" && e.Status == OrderStatus.Cancelled);
        Assert.Equal(OrderStatus.Open, oldOwned.Status);
        Assert.Equal(OrderStatus.Open, fresh.Status);
        Assert.Equal(OrderStatus.Paid, oldPaid.Status);
    }

    // ---- Metrics ------------------------------------------------------------------------

    [Fact]
    public async Task Metrics_EmployeeRow_CarriesDaysAndRating()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var order = Seed.Order(c.Db, OrderStatus.Closed, customerId: customer.Id);
        order.AssignedEmployeeId = c.Employee.Id;
        order.CreatedAt = DateTime.UtcNow.AddDays(-10);
        order.Rating = 5;
        Seed.DeliveredEvent(c.Db, order, DateTime.UtcNow.AddDays(-2));
        await c.Db.SaveChangesAsync();

        var m = await c.Svc.MetricsAsync(default);

        var row = m.Employees.FirstOrDefault(e => e.EmployeeId == c.Employee.Id);
        Assert.NotNull(row);
        Assert.Equal(1, row!.CompletedOrders);
        Assert.NotNull(row.AvgDaysOpenToDelivered);
        Assert.Equal(8.0, row.AvgDaysOpenToDelivered!.Value, 1);
        Assert.Equal(5.0, row.AvgRating!.Value, 1);
    }
}
