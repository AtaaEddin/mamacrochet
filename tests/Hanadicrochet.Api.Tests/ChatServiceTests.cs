using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// ChatService domain rules (sub-plan 02): guest bootstrap + tokens, the
/// server-side access matrix, guest rate caps, messages/attachments,
/// claim/assign/close, stale sweeps, orphan-attachment purge.
/// </summary>
[Collection("Api")]
public class ChatServiceTests(ApiTestFixture _fx)
{
    private sealed class Ctx(IServiceScope scope, AppDbContext db, ChatService chat, ChatTokenService tokens) : IDisposable
    {
        public AppDbContext Db { get; } = db;
        public ChatService Chat { get; } = chat;
        public ChatTokenService Tokens { get; } = tokens;

        public void Dispose() => scope.Dispose();
    }

    private async Task<Ctx> NewAsync()
    {
        var scope = _fx.CreateScope();
        return new Ctx(
            scope,
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<ChatService>(),
            scope.ServiceProvider.GetRequiredService<ChatTokenService>());
    }

    private static ChatService.ValidatedThreadToken? Validate(ChatTokenService tokens, string token)
    {
        var v = tokens.TryValidateThreadToken(token);
        return v is null
            ? null
            : new ChatService.ValidatedThreadToken(v.Value.ThreadId, v.Value.GuestId);
    }

    private async Task<(ChatService Chat, string ThreadId, string GuestId, ChatService.ValidatedThreadToken Token)>
        BootstrapVisitor(Ctx c, string? name = "Guest")
    {
        var guest = Guid.NewGuid().ToString();
        var r = await c.Chat.BootstrapVisitorThreadAsync(guest, name, null, false, default);
        Assert.Null(r.Error);
        Assert.NotNull(r.Created);
        var token = Validate(c.Tokens, r.Created!.Token);
        Assert.NotNull(token);
        return (c.Chat, r.Created.Thread.Id, guest, token!.Value);
    }

    // ---- Bootstrap ------------------------------------------------------------------

    [Fact]
    public async Task Bootstrap_CreatesThreadAndValidToken()
    {
        using var c = await NewAsync();
        var (_, threadId, guest, _) = await BootstrapVisitor(c);

        var thread = await c.Db.ChatThreads.FirstAsync(t => t.Id == threadId);
        Assert.Equal("visitor", thread.Kind);
        Assert.Equal(guest, thread.GuestId);
        Assert.False(thread.IsClosed);
    }

    [Fact]
    public async Task Bootstrap_Honeypot_ReturnsNothing()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();

        var r = await c.Chat.BootstrapVisitorThreadAsync(guest, "Bot", "i-am-a-bot", false, default);

        Assert.True(r.HoneyPotted);
        Assert.Null(r.Error);
        // The token binds to a fabricated thread: it must not validate to a
        // real conversation.
        var validated = Validate(c.Tokens, r.Created!.Token);
        if (validated is not null)
        {
            Assert.False(await c.Db.ChatThreads.AnyAsync(t => t.Id == validated.Value.ThreadId));
        }
        Assert.False(await c.Db.ChatThreads.AnyAsync(t => t.GuestId == guest));
    }

    [Fact]
    public async Task Bootstrap_MissingGuestId_Rejected()
    {
        using var c = await NewAsync();
        var r = await c.Chat.BootstrapVisitorThreadAsync(null, "Guest", null, false, default);
        Assert.Equal("invalid_request", r.Error!.Code);
    }

    [Fact]
    public async Task Bootstrap_SameDevice_ReturnsExistingThread()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();
        var first = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, false, default);
        Assert.Null(first.Error);
        var firstId = first.Created!.Thread.Id;

        var second = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, false, default);

        Assert.Null(second.Error);
        Assert.Equal(firstId, second.Created!.Thread.Id);
        Assert.True(
            await c.Db.ChatThreads.CountAsync(t => t.GuestId == guest && t.Kind == "visitor" && !t.IsClosed) == 1);
    }

    [Fact]
    public async Task Bootstrap_ExistingClosed_CreatesFreshThread()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();
        var first = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, false, default);
        var closedThread = await c.Db.ChatThreads.FirstAsync(t => t.Id == first.Created!.Thread.Id);
        closedThread.IsClosed = true;
        closedThread.ClosedReason = "test";
        await c.Db.SaveChangesAsync();

        var second = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, false, default);

        Assert.NotNull(second.Created);
        Assert.NotEqual(first.Created!.Thread.Id, second.Created!.Thread.Id);
    }

    [Fact]
    public async Task Bootstrap_Reset_ClosesOldAndMakesFresh()
    {
        using var c = await NewAsync();
        var guest = Guid.NewGuid().ToString();
        var first = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, false, default);

        var second = await c.Chat.BootstrapVisitorThreadAsync(guest, "Guest", null, true, default);

        Assert.NotNull(second.Created);
        Assert.NotEqual(first.Created!.Thread.Id, second.Created!.Thread.Id);
        var old = await c.Db.ChatThreads.FirstAsync(t => t.Id == first.Created!.Thread.Id);
        Assert.True(old.IsClosed);
        Assert.Equal("guest_reset", old.ClosedReason);
    }

    // ---- Messages ---------------------------------------------------------------------

    [Fact]
    public async Task Send_GuestMessage_StoresWithGuestSender()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);

        var r = await chat.SendMessageAsync(threadId, null, token, "hello there", null, null, null, default);

        Assert.Null(r.Error);
        Assert.Equal("hello there", r.Message!.Body);
        Assert.Equal("Guest", r.Message.SenderName);
        Assert.Equal("guest", r.Message.SenderRole);
        var thread = await c.Db.ChatThreads.FirstAsync(t => t.Id == threadId);
        Assert.NotNull(thread.LastMessageAt);
    }

    [Fact]
    public async Task Send_ClosedThread_Rejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var close = await chat.CloseThreadAsync(threadId, employee, "done", default);
        Assert.Null(close.Error);

        var r = await chat.SendMessageAsync(threadId, null, token, "too late", null, null, null, default);

        Assert.Equal("conflict", r.Error!.Code);
    }

    [Fact]
    public async Task Send_UnknownThread_NotFound()
    {
        using var c = await NewAsync();
        var r = await c.Chat.SendMessageAsync(
            Guid.NewGuid().ToString(), null, null, "hi", null, null, null, default);
        Assert.Equal("not_found", r.Error!.Code);
    }

    [Fact]
    public async Task Send_UnauthenticatedWithoutContent_Rejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);

        var r = await chat.SendMessageAsync(threadId, null, token, null, null, null, null, default);

        Assert.Equal("invalid_request", r.Error!.Code);
    }

    [Fact]
    public async Task Send_BodyTooLong_Rejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);

        var r = await chat.SendMessageAsync(
            threadId, null, token, new string('x', ChatService.MaxBodyLength + 1), null, null, null, default);

        Assert.Equal("invalid_request", r.Error!.Code);
    }

    [Fact]
    public async Task Send_WrongThreadForToken_Forbidden()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var other = Seed.Thread(c.Db, "visitor", guestId: Guid.NewGuid().ToString());
        await c.Db.SaveChangesAsync();

        var r = await chat.SendMessageAsync(other.Id, null, token, "hi", null, null, null, default);

        Assert.Equal("forbidden", r.Error!.Code);
    }

    [Fact]
    public async Task Send_GuestRateLimit_TenthPassesEleventhRejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);

        for (var i = 0; i < ChatService.GuestMessagesPerMinute; i++)
        {
            var ok = await chat.SendMessageAsync(
                threadId, null, token, $"msg {i}", null, null, null, default);
            Assert.Null(ok.Error);
        }

        var eleventh = await chat.SendMessageAsync(
            threadId, null, token, "too fast", null, null, null, default);
        Assert.Equal("rate_limited", eleventh.Error!.Code);
    }

    [Fact]
    public async Task Send_AttachmentCap_Rejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var ids = new List<string>(6);
        for (var i = 0; i < 6; i++)
        {
            ids.Add(Seed.Attachment(c.Db, threadId).Id);
        }
        await c.Db.SaveChangesAsync();

        var r = await chat.SendMessageAsync(threadId, null, token, "see files", null, ids, null, default);

        Assert.Equal("invalid_request", r.Error!.Code);
    }

    [Fact]
    public async Task Send_AttachmentFromOtherThread_Rejected()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var stranger = Seed.Thread(c.Db, "visitor", guestId: Guid.NewGuid().ToString());
        var attachment = Seed.Attachment(c.Db, stranger.Id);
        await c.Db.SaveChangesAsync();

        var r = await chat.SendMessageAsync(
            threadId, null, token, "hi", null, [attachment.Id], null, default);

        Assert.Equal("invalid_request", r.Error!.Code);
    }

    [Fact]
    public async Task Send_WithAttachment_LinksItToMessage()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var attachment = Seed.Attachment(c.Db, threadId);
        await c.Db.SaveChangesAsync();

        var r = await chat.SendMessageAsync(
            threadId, null, token, "with file", null, [attachment.Id], null, default);

        Assert.Null(r.Error);
        Assert.Single(r.Message!.Attachments);
        var row = await c.Db.ChatAttachments.FirstAsync(a => a.Id == attachment.Id);
        Assert.Equal(r.Message!.Id, row.MessageId);
    }

    // ---- Access matrix -----------------------------------------------------------------

    [Fact]
    public async Task Access_VisitorThread_Matrix()
    {
        using var c = await NewAsync();
        var admin = await TestUsers.CreateAsync(_fx, "admin");
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var other = await TestUsers.CreateAsync(_fx, "employee");
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();
        var thread = Seed.Thread(c.Db, "visitor", guestId: guest, assignedEmployeeId: employee.Id);
        var strangerThread = Seed.Thread(c.Db, "visitor", guestId: Guid.NewGuid().ToString());
        await c.Db.SaveChangesAsync();

        var token = Validate(c.Tokens, c.Tokens.CreateThreadToken(thread.Id, guest));
        Assert.NotNull(token);
        var strangerToken = Validate(
            c.Tokens, c.Tokens.CreateThreadToken(strangerThread.Id, strangerThread.GuestId!));
        Assert.NotNull(strangerToken);

        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, customer, null, default));
        Assert.Equal(ThreadAccess.Employee, await c.Chat.CheckAccessAsync(thread, employee, null, default));
        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, other, null, default));
        Assert.Equal(ThreadAccess.Admin, await c.Chat.CheckAccessAsync(thread, admin, null, default));
        Assert.Equal(ThreadAccess.Guest, await c.Chat.CheckAccessAsync(thread, null, token, default));
        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, null, strangerToken, default));
    }

    [Fact]
    public async Task Access_OrderThread_Matrix()
    {
        using var c = await NewAsync();
        var admin = await TestUsers.CreateAsync(_fx, "admin");
        var assigned = await TestUsers.CreateAsync(_fx, "employee");
        var other = await TestUsers.CreateAsync(_fx, "employee");
        var owner = await TestUsers.CreateAsync(_fx, "customer");
        var stranger = await TestUsers.CreateAsync(_fx, "customer");
        var guest = Guid.NewGuid().ToString();

        var order = new Order { CustomerId = owner.Id, GuestId = guest, AssignedEmployeeId = assigned.Id };
        c.Db.Orders.Add(order);
        var thread = Seed.Thread(
            c.Db, "order", guestId: guest, customerId: owner.Id, orderId: order.Id, assignedEmployeeId: assigned.Id);
        await c.Db.SaveChangesAsync();

        Assert.Equal(ThreadAccess.Customer, await c.Chat.CheckAccessAsync(thread, owner, null, default));
        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, stranger, null, default));
        Assert.Equal(ThreadAccess.Employee, await c.Chat.CheckAccessAsync(thread, assigned, null, default));
        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, other, null, default));
        Assert.Equal(ThreadAccess.Admin, await c.Chat.CheckAccessAsync(thread, admin, null, default));

        // Guests can only reach VISITOR threads: an order thread that carries
        // the guest id is still sign-in territory (the guest becomes a customer).
        var token = Validate(c.Tokens, c.Tokens.CreateThreadToken(thread.Id, guest));
        Assert.NotNull(token);
        Assert.Equal(ThreadAccess.None, await c.Chat.CheckAccessAsync(thread, null, token, default));
    }

    // ---- Claim / assign / close / create / link ------------------------------------------

    [Fact]
    public async Task Claim_OrderThread_Rejected()
    {
        using var c = await NewAsync();
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var order = Seed.Order(c.Db, OrderStatus.Open);
        var thread = Seed.Thread(c.Db, "order", orderId: order.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Chat.ClaimThreadAsync(thread.Id, employee, default);

        Assert.Equal("conflict", r.Error!.Code);
    }

    [Fact]
    public async Task Claim_FirstStaffWins_SecondConflicts()
    {
        using var c = await NewAsync();
        var first = await TestUsers.CreateAsync(_fx, "employee");
        var second = await TestUsers.CreateAsync(_fx, "employee");
        var thread = Seed.Thread(c.Db, "visitor");
        await c.Db.SaveChangesAsync();

        var r1 = await c.Chat.ClaimThreadAsync(thread.Id, first, default);
        Assert.Null(r1.Error);
        Assert.Equal(first.Id, thread.AssignedEmployeeId);

        var r2 = await c.Chat.ClaimThreadAsync(thread.Id, second, default);
        Assert.Equal("conflict", r2.Error!.Code);
        Assert.Equal(first.Id, thread.AssignedEmployeeId);
    }

    [Fact]
    public async Task AssignThread_AdminOnly()
    {
        using var c = await NewAsync();
        var admin = await TestUsers.CreateAsync(_fx, "admin");
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var thread = Seed.Thread(c.Db, "visitor");
        await c.Db.SaveChangesAsync();

        var denied = await c.Chat.AssignThreadAsync(thread.Id, employee, employee.Id, default);
        Assert.Equal("forbidden", denied.Error!.Code);

        var unknown = await c.Chat.AssignThreadAsync(thread.Id, admin, Guid.NewGuid().ToString(), default);
        Assert.Equal("not_found", unknown.Error!.Code);

        var ok = await c.Chat.AssignThreadAsync(thread.Id, admin, employee.Id, default);
        Assert.Null(ok.Error);
        Assert.Equal(employee.Id, thread.AssignedEmployeeId);
    }

    [Fact]
    public async Task Close_StaffCanClose_CustomerCannot()
    {
        using var c = await NewAsync();
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var customer = await TestUsers.CreateAsync(_fx, "customer");
        var thread = Seed.Thread(c.Db, "order", customerId: customer.Id);
        await c.Db.SaveChangesAsync();

        var denied = await c.Chat.CloseThreadAsync(thread.Id, customer, "please", default);
        Assert.Equal("forbidden", denied.Error!.Code);

        var ok = await c.Chat.CloseThreadAsync(thread.Id, employee, "resolved", default);
        Assert.Null(ok.Error);
        Assert.True(thread.IsClosed);
        Assert.Equal("resolved", thread.ClosedReason);

        var again = await c.Chat.CloseThreadAsync(thread.Id, employee, "again", default);
        Assert.Equal("conflict", again.Error!.Code);
    }

    [Fact]
    public async Task CreateThread_CustomerThread_OwnerSet()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");

        var r = await c.Chat.CreateThreadAsync(customer, "a question", customer.Id, default);

        Assert.Null(r.Error);
        Assert.Equal("visitor", r.Thread!.Kind);
        var thread = await c.Db.ChatThreads.FirstAsync(t => t.Id == r.Thread!.Id);
        Assert.Equal(customer.Id, thread.CustomerId);
    }

    [Fact]
    public async Task CreateThread_BadSubject_Rejected()
    {
        using var c = await NewAsync();
        var customer = await TestUsers.CreateAsync(_fx, "customer");

        var short1 = await c.Chat.CreateThreadAsync(customer, "x", customer.Id, default);
        var long1 = await c.Chat.CreateThreadAsync(customer, new string('x', 81), customer.Id, default);
        Assert.Equal("invalid_request", short1.Error!.Code);
        Assert.Equal("invalid_request", long1.Error!.Code);
    }

    [Fact]
    public async Task CreateThread_StaffNeedsExistingCustomer()
    {
        using var c = await NewAsync();
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var customer = await TestUsers.CreateAsync(_fx, "customer");

        var noCustomer = await c.Chat.CreateThreadAsync(employee, null, null, default);
        Assert.Equal("invalid_request", noCustomer.Error!.Code);

        var unknown = await c.Chat.CreateThreadAsync(employee, null, Guid.NewGuid().ToString(), default);
        Assert.Equal("not_found", unknown.Error!.Code);

        var ok = await c.Chat.CreateThreadAsync(employee, "hi", customer.Id, default);
        Assert.Null(ok.Error);
        var thread = await c.Db.ChatThreads.FirstAsync(t => t.Id == ok.Thread!.Id);
        Assert.Equal(customer.Id, thread.CustomerId);
        Assert.Equal(employee.Id, thread.AssignedEmployeeId);
    }

    [Fact]
    public async Task LinkThreadToOrder_MergesVisitorThread()
    {
        using var c = await NewAsync();
        var owner = await TestUsers.CreateAsync(_fx, "customer");
        var employee = await TestUsers.CreateAsync(_fx, "employee");
        var order = Seed.Order(c.Db, OrderStatus.InProgress, customerId: owner.Id);
        order.AssignedEmployeeId = employee.Id;
        var thread = Seed.Thread(c.Db, "visitor");
        await c.Db.SaveChangesAsync();

        var r = await c.Chat.LinkThreadToOrderAsync(thread.Id, order.Id, default);

        Assert.Null(r.Error);
        Assert.Equal("order", thread.Kind);
        Assert.Equal(order.Id, thread.OrderId);
        Assert.Equal(owner.Id, thread.CustomerId);
        Assert.Equal(employee.Id, thread.AssignedEmployeeId);
    }

    [Fact]
    public async Task LinkThreadToOrder_AlreadyLinked_Conflict()
    {
        using var c = await NewAsync();
        var order = Seed.Order(c.Db, OrderStatus.Open);
        var other = Seed.Order(c.Db, OrderStatus.Open);
        var thread = Seed.Thread(c.Db, "order", orderId: order.Id);
        await c.Db.SaveChangesAsync();

        var r = await c.Chat.LinkThreadToOrderAsync(thread.Id, other.Id, default);

        Assert.Equal("conflict", r.Error!.Code);
    }

    [Fact]
    public async Task LinkThreadToOrder_UnknownOrder_NotFound()
    {
        using var c = await NewAsync();
        var thread = Seed.Thread(c.Db, "visitor");
        await c.Db.SaveChangesAsync();

        var r = await c.Chat.LinkThreadToOrderAsync(thread.Id, Guid.NewGuid().ToString(), default);

        Assert.Equal("not_found", r.Error!.Code);
    }

    // ---- Listing / pagination ------------------------------------------------------------

    [Fact]
    public async Task ListMessages_PagesBackward()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var baseAt = new DateTime(2026, 10, 4, 12, 0, 0, DateTimeKind.Utc);
        for (var i = 1; i <= 4; i++)
        {
            c.Db.ChatMessages.Add(new ChatMessage
            {
                ThreadId = threadId,
                Body = $"m{i}",
                SenderName = "Guest",
                SenderRole = "guest",
                At = baseAt.AddMinutes(i),
            });
        }
        await c.Db.SaveChangesAsync();

        var page = await chat.ListMessagesAsync(threadId, null, token, null, null, 2, default);
        Assert.Null(page.Error);
        Assert.Equal(2, page.Page!.Messages.Count);
        Assert.True(page.Page.HasOlder);
        Assert.Equal("m3", page.Page.Messages[0].Body);
        Assert.Equal("m4", page.Page.Messages[1].Body);

        var older = await chat.ListMessagesAsync(
            threadId, null, token, page.Page.Messages[0].Id, null, 2, default);
        Assert.Equal("m1", older.Page!.Messages[0].Body);
        Assert.Equal("m2", older.Page.Messages[1].Body);
        Assert.True(older.Page.HasNewer);
    }

    [Fact]
    public async Task ListMessages_ForbiddenForStranger()
    {
        using var c = await NewAsync();
        var (chat, threadId, _, token) = await BootstrapVisitor(c);
        var stranger = await TestUsers.CreateAsync(_fx, "customer");

        var r = await chat.ListMessagesAsync(threadId, stranger, null, null, null, 50, default);

        Assert.Equal("forbidden", r.Error!.Code);
        // The token alone does NOT grant a signed-in user's thread access.
        var withToken = await chat.ListMessagesAsync(
            threadId, stranger, token, null, null, 50, default);
        Assert.Equal("forbidden", withToken.Error!.Code);
    }

    [Fact]
    public async Task SearchCustomers_FindsByNameAndPages()
    {
        using var c = await NewAsync();
        var marker = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var wanted = await TestUsers.CreateAsync(_fx, "customer", displayName: $"Zoe{marker} One");
        await TestUsers.CreateAsync(_fx, "customer", displayName: $"Zoe{marker} Two");

        var r = await c.Chat.SearchCustomersAsync($"Zoe{marker}", 1, 1, default);

        Assert.Equal(2, r.Pages);
        Assert.Single(r.Customers);
        Assert.Equal(wanted.Id, r.Customers[0].Id);
    }

    // ---- Sweeps ---------------------------------------------------------------------------

    [Fact]
    public async Task CloseStaleVisitorThreads_OldVisitorOnly()
    {
        using var c = await NewAsync();
        var stale = Seed.Thread(c.Db, "visitor", lastMessageAt: DateTime.UtcNow.AddDays(-31), createdAt: DateTime.UtcNow.AddDays(-32));
        var neverActive = Seed.Thread(c.Db, "visitor", createdAt: DateTime.UtcNow.AddDays(-31));
        var active = Seed.Thread(c.Db, "visitor", lastMessageAt: DateTime.UtcNow.AddDays(-1));
        var oldOrder = Seed.Thread(c.Db, "order", lastMessageAt: DateTime.UtcNow.AddDays(-31));
        var alreadyClosed = Seed.Thread(c.Db, "visitor", closed: true, lastMessageAt: DateTime.UtcNow.AddDays(-31));
        await c.Db.SaveChangesAsync();

        var n = await c.Chat.CloseStaleVisitorThreadsAsync(default);

        Assert.True(n >= 2);
        Assert.True(stale.IsClosed);
        Assert.True(neverActive.IsClosed);
        Assert.False(active.IsClosed);
        Assert.False(oldOrder.IsClosed);
        Assert.True(alreadyClosed.IsClosed);
    }

    [Fact]
    public async Task PurgeOrphanAttachments_OldUnreferencedOnly()
    {
        using var c = await NewAsync();
        var thread = Seed.Thread(c.Db, "visitor");
        var stale = Seed.Attachment(c.Db, thread.Id, createdAt: DateTime.UtcNow.AddHours(-25), writeFile: true, uploadsRoot: _fx.UploadsRoot);
        var fresh = Seed.Attachment(c.Db, thread.Id, createdAt: DateTime.UtcNow.AddHours(-1), writeFile: true, uploadsRoot: _fx.UploadsRoot);

        // A referenced attachment (real message link) must survive.
        var message = new ChatMessage
        {
            ThreadId = thread.Id,
            Body = "kept",
            SenderName = "Guest",
            SenderRole = "guest",
            At = DateTime.UtcNow,
        };
        c.Db.ChatMessages.Add(message);
        var referenced = new ChatAttachment
        {
            ThreadId = thread.Id,
            StoredName = Guid.NewGuid().ToString("N") + ".png",
            OriginalName = "kept.png",
            ContentType = "image/png",
            Bytes = 1,
            CreatedAt = DateTime.UtcNow.AddDays(-2),
        };
        message.Attachments.Add(referenced);
        await c.Db.SaveChangesAsync();

        var stalePath = Path.Combine(_fx.UploadsRoot, "chat", thread.Id, stale.StoredName);
        Assert.True(File.Exists(stalePath));

        var n = await c.Chat.PurgeOrphanAttachmentsAsync(default);

        Assert.True(n >= 1);
        Assert.False(File.Exists(stalePath));
        Assert.False(await c.Db.ChatAttachments.AnyAsync(a => a.Id == stale.Id));
        Assert.True(await c.Db.ChatAttachments.AnyAsync(a => a.Id == fresh.Id));
        Assert.True(await c.Db.ChatAttachments.AnyAsync(a => a.Id == referenced.Id));
    }
}
