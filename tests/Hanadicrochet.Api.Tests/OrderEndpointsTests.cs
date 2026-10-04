using System.Net;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Order endpoint coverage (plan 05/07): guest-first creation, the customer
/// surface (my orders, cancel, rate), the staff workflow on /staff/orders
/// (status, notes, payment, delivery, attachments, assignment) and the admin
/// override paths on /admin/orders.
/// </summary>
[Collection("Api")]
public class OrderEndpointsTests(ApiTestFixture fx)
{
    private static string UniquePhone() => "+1 20" + Guid.NewGuid().ToString("N")[..8];

    private static Multipart GuestOrder(
        string? kind = "custom",
        string? productId = null,
        string? name = null,
        string? phone = null,
        string? guestId = null,
        string? spec = "A small custom piece",
        string? email = null,
        string? website = null,
        bool withName = true,
        bool withGuestId = true)
    {
        var form = new Multipart()
            .Field("kind", kind)
            .Field("productId", productId)
            .Field("phone", phone ?? UniquePhone())
            .Field("email", email)
            .Field("spec", spec);
        if (withName)
        {
            form.Field("name", name ?? TestUsers.UniqueName("Guest"));
        }

        if (withGuestId)
        {
            form.Field("guestId", guestId ?? Guid.NewGuid().ToString());
        }
        if (website is not null)
        {
            form.Field("website", website);
        }

        return form;
    }

    private static async Task<HttpResponseMessage> PostGuestOrderAsync(
        HttpClient client, Multipart form)
    {
        // Public guest submit: no auth, no antiforgery.
        return await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/orders") { Content = form.Content });
    }

    [Fact]
    public async Task Guest_Create_Custom_200()
    {
        var client = fx.CreateClient();
        var response = await PostGuestOrderAsync(client, GuestOrder(spec: "A granny square in oat"));

        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        Assert.False(string.IsNullOrWhiteSpace(body!["id"]!.ToString()));
        Assert.Equal("open", body["status"]!.ToString());
    }

    [Fact]
    public async Task Guest_Create_Catalog_200()
    {
        var client = fx.CreateClient();
        var page = await EndpointHttp.GetJson(client, "/catalog/products?$top=1", HttpStatusCode.OK);
        var product = page!["items"]!.AsArray()[0]!;

        var response = await PostGuestOrderAsync(
            client, GuestOrder(kind: "catalog", productId: product["id"]!.ToString()));

        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        Assert.Equal("open", body!["status"]!.ToString());
    }

    [Fact]
    public async Task Guest_Create_Validation_Failures()
    {
        var client = fx.CreateClient();

        // Missing name.
        var r1 = await PostGuestOrderAsync(client, GuestOrder(withName: false));
        await EndpointHttp.Error(r1, HttpStatusCode.BadRequest, "invalid");

        // Unknown kind.
        var r2 = await PostGuestOrderAsync(client, GuestOrder(kind: "bogus"));
        await EndpointHttp.Error(r2, HttpStatusCode.BadRequest, "invalid");

        // Custom without a spec.
        var r3 = await PostGuestOrderAsync(client, GuestOrder(spec: ""));
        await EndpointHttp.Error(r3, HttpStatusCode.BadRequest, "invalid");

        // Catalog without a product.
        var r4 = await PostGuestOrderAsync(client, GuestOrder(kind: "catalog"));
        await EndpointHttp.Error(r4, HttpStatusCode.BadRequest, "not_found");

        // Unknown product.
        var r5 = await PostGuestOrderAsync(
            client, GuestOrder(kind: "catalog", productId: Guid.NewGuid().ToString("N")));
        await EndpointHttp.Error(r5, HttpStatusCode.BadRequest, "not_found");

        // Missing guest id.
        var r6 = await PostGuestOrderAsync(client, GuestOrder(withGuestId: false));
        await EndpointHttp.Error(r6, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Guest_Create_Honeypot_FakeSuccess_NoRow()
    {
        var client = fx.CreateClient();
        var phone = UniquePhone();
        var response = await PostGuestOrderAsync(
            client, GuestOrder(phone: phone, website: "spam.example"));

        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        Assert.False(string.IsNullOrWhiteSpace(body!["id"]!.ToString()));

        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.Orders.AnyAsync(o => o.ContactPhone == phone));
    }

    [Fact]
    public async Task Guest_Cap_Enforced_409()
    {
        var client = fx.CreateClient();
        var phone = UniquePhone();
        for (var i = 0; i < 3; i++)
        {
            var ok = await PostGuestOrderAsync(client, GuestOrder(phone: phone));
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        }

        var fourth = await PostGuestOrderAsync(client, GuestOrder(phone: phone));
        await EndpointHttp.Error(fourth, HttpStatusCode.Conflict, "guest_cap");
    }

    [Fact]
    public async Task Customer_Link_MyOrders_Detail_Cancel()
    {
        var client = fx.CreateClient();
        var guestId = Guid.NewGuid().ToString();
        var email = TestUsers.UniqueEmail("order");
        var phone = UniquePhone();

        // 1) Anonymous guest starts the order.
        var created = await PostGuestOrderAsync(
            client, GuestOrder(phone: phone, guestId: guestId, email: email, spec: "A custom tote"));
        var id = (await EndpointHttp.Json(created, HttpStatusCode.OK))!["id"]!.ToString()!;

        // 2) The same person registers (same e-mail) and signs in.
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var customer = await TestUsers.LoginAsync(fx, email);

        // 3) Link the device guest to the account.
        var linked = await customer.PostJsonAsync("/identity/guest-link", new { guestId });
        Assert.Equal(HttpStatusCode.OK, linked.StatusCode);

        // 4) The order shows up in "my orders" and the detail is readable.
        var mine = await EndpointHttp.Json(await customer.GetAsync("/orders"), HttpStatusCode.OK);
        Assert.Contains(mine!["items"]!.AsArray(), i => i!["id"]!.ToString() == id);

        var detail = await EndpointHttp.Json(
            await customer.GetAsync($"/orders/{id}"), HttpStatusCode.OK);
        Assert.Equal(id, detail!["id"]!.ToString());
        Assert.Equal("open", detail["status"]!.ToString());
        Assert.True(detail["canCancel"]!.GetValue<bool>());
        Assert.False(detail["canRate"]!.GetValue<bool>());

        // 5) Customer cancels with a reason.
        var cancelled = await EndpointHttp.Json(
            await customer.PostJsonAsync($"/orders/{id}/cancel", new { reason = "Changed my mind." }),
            HttpStatusCode.OK);
        Assert.Equal("cancelled", cancelled!["status"]!.ToString());
    }

    [Fact]
    public async Task Staff_Queue_Includes_AssignedGuestOrder()
    {
        var (order, _, worker) = await CreateAssignedOrderAsync();

        var queue = await EndpointHttp.Json(
            await worker.GetAsync("/staff/orders"), HttpStatusCode.OK);
        Assert.Contains(queue!["items"]!.AsArray(), i => i!["id"]!.ToString() == order);
    }

    [Fact]
    public async Task Staff_Full_Workflow_Pay_Deliver_Close_Rate()
    {
        var client = fx.CreateClient();
        var page = await EndpointHttp.GetJson(client, "/catalog/products?$top=1", HttpStatusCode.OK);
        var product = page!["items"]!.AsArray()[0]!;
        var guestId = Guid.NewGuid().ToString();
        var email = TestUsers.UniqueEmail("wf");
        var phone = UniquePhone();

        var created = await PostGuestOrderAsync(
            client,
            GuestOrder(
                kind: "catalog",
                productId: product["id"]!.ToString(),
                guestId: guestId,
                email: email,
                phone: phone));
        var id = (await EndpointHttp.Json(created, HttpStatusCode.OK))!["id"]!.ToString()!;

        // Customer link (so the rating gate passes).
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var customer = await TestUsers.LoginAsync(fx, email);
        Assert.Equal(
            HttpStatusCode.OK,
            (await customer.PostJsonAsync("/identity/guest-link", new { guestId })).StatusCode);

        // Staff drives the workflow — an admin assigns the order first.
        var staff = await TestUsers.CreateAsync(fx, "employee");
        var worker = await TestUsers.LoginAsync(fx, staff.Email!);
        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var assigned = await admin.PatchJsonAsync(
            $"/staff/orders/{id}/assignment", new { employeeId = staff.Id });
        Assert.Equal(HttpStatusCode.OK, assigned.StatusCode);

        var inProgress = await EndpointHttp.Json(
            await worker.PostJsonAsync($"/staff/orders/{id}/status", new { status = "in_progress" }),
            HttpStatusCode.OK);
        Assert.Equal("in_progress", inProgress!["status"]!.ToString());

        var price = product["price"]!.GetValue<double>();

        var ready = await EndpointHttp.Json(
            await worker.PostJsonAsync(
                $"/staff/orders/{id}/status",
                new { status = "ready_for_payment", finalPrice = price }),
            HttpStatusCode.OK);
        Assert.Equal("ready_for_payment", ready!["status"]!.ToString());

        // Payment: amount + method + receipt file (PDF, magic-byte-validated).
        var pay = new Multipart()
            .Field("amount", price.ToString("0.00"))
            .Field("method", "bank transfer")
            .File("receipt", FileFixtures.Pdf, "receipt.pdf", "application/pdf");
        var paid = await EndpointHttp.Json(
            await pay.PostAsync(worker, $"/staff/orders/{id}/payment", await TestUsers.GetCsrfTokenAsync(worker)),
            HttpStatusCode.OK);
        Assert.Equal("paid", paid!["status"]!.ToString());
        Assert.NotNull(paid["payment"]!);

        // Delivery: method + actual date/time (+ optional proof file).
        var deliv = new Multipart()
            .Field("method", "courier")
            .Field("actualAt", DateTime.UtcNow.ToString("o"))
            .Field("description", "Handed at the door.")
            .File("proof", FileFixtures.Pdf, "proof.pdf", "application/pdf");
        var delivered = await EndpointHttp.Json(
            await deliv.PostAsync(worker, $"/staff/orders/{id}/delivery", await TestUsers.GetCsrfTokenAsync(worker)),
            HttpStatusCode.OK);
        Assert.Equal("delivered", delivered!["status"]!.ToString());
        Assert.NotNull(delivered!["delivery"]);

        // The customer confirms receipt (a timeline event), then staff closes.
        var confirmed = await EndpointHttp.Json(
            await customer.PostJsonAsync($"/orders/{id}/confirm-delivery", new { }),
            HttpStatusCode.OK);
        Assert.Equal("delivered", confirmed!["status"]!.ToString());

        var closed = await EndpointHttp.Json(
            await worker.PostJsonAsync(
                $"/staff/orders/{id}/status", new { status = "closed" }),
            HttpStatusCode.OK);
        Assert.Equal("closed", closed!["status"]!.ToString());

        // The customer rates the finished order.
        var detail = await EndpointHttp.Json(
            await customer.GetAsync($"/orders/{id}"), HttpStatusCode.OK);
        Assert.True(detail!["canRate"]!.GetValue<bool>());
        var rated = await EndpointHttp.Json(
            await customer.PostJsonAsync(
                $"/orders/{id}/rating", new { score = 5, comment = "Adorable!" }),
            HttpStatusCode.OK);
        Assert.Equal((byte)5, rated!["rating"]!.GetValue<byte>());

        var mine = await EndpointHttp.Json(await customer.GetAsync("/orders"), HttpStatusCode.OK);
        var mineItem = mine!["items"]!.AsArray().First(i => i!["id"]!.ToString() == id)!;
        Assert.Equal((byte)5, mineItem["rating"]!.GetValue<byte>());
    }

    [Fact]
    public async Task Staff_Payment_Without_Receipt_400()
    {
        var (order, _, worker) = await CreateReadyForPaymentAsync();

        var pay = new Multipart()
            .Field("amount", "40.00")
            .Field("method", "bank transfer");
        var rejected = await pay.PostAsync(
            worker, $"/staff/orders/{order}/payment", await TestUsers.GetCsrfTokenAsync(worker));
        await EndpointHttp.Error(rejected, HttpStatusCode.BadRequest, "receipt_required");
    }

    [Fact]
    public async Task Admin_Payment_Override_Without_Receipt_200()
    {
        var (order, _, _) = await CreateReadyForPaymentAsync();

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        var pay = new Multipart()
            .Field("amount", "40.00")
            .Field("method", "cash (shop visit)")
            .Field("note", "Cash in hand at the studio — no paper receipt.");
        var paid = await pay.PostAsync(
            boss, $"/admin/orders/{order}/payment", await TestUsers.GetCsrfTokenAsync(boss));
        var body = await EndpointHttp.Json(paid, HttpStatusCode.OK);
        Assert.Equal("paid", body!["status"]!.ToString());
    }

    [Fact]
    public async Task Staff_Status_InvalidTransition_409_Unknown_400()
    {
        var (order, _, worker) = await CreateAssignedOrderAsync();

        // open → ready_for_payment skips in_progress: not in the matrix.
        var skip = await worker.PostJsonAsync(
            $"/staff/orders/{order}/status", new { status = "ready_for_payment" });
        await EndpointHttp.Error(skip, HttpStatusCode.Conflict, "invalid_status_change");

        // Unknown status word.
        var bogus = await worker.PostJsonAsync(
            $"/staff/orders/{order}/status", new { status = "shipped" });
        await EndpointHttp.Error(bogus, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Staff_Notes_Attachments_Assignment()
    {
        var (order, admin, worker) = await CreateAssignedOrderAsync();

        // Note lands in the timeline.
        var noted = await EndpointHttp.Json(
            await worker.PostJsonAsync($"/staff/orders/{order}/notes", new { text = "Yarn is on its way." }),
            HttpStatusCode.OK);
        Assert.Contains(
            noted!["timeline"]!.AsArray(),
            e => e!["kind"]!.ToString() == "note" && e!["note"]!.ToString() == "Yarn is on its way.");

        // WIP attachment: uploaded, listed, and served from /files/orders/…
        var upload = new Multipart()
            .Field("kind", "wip")
            .File("files", FileFixtures.Png, "wip.png", "image/png");
        var uploaded = await EndpointHttp.Json(
            await upload.PostAsync(worker, $"/staff/orders/{order}/attachments", await TestUsers.GetCsrfTokenAsync(worker)),
            HttpStatusCode.OK);
        var list = uploaded!["attachments"]!.AsArray();
        Assert.Single(list);
        var url = list[0]!["url"]!.ToString()!;
        Assert.StartsWith($"/files/orders/{order}/", url);

        var bytes = await EndpointHttp.Bytes(worker, url, HttpStatusCode.OK);
        Assert.NotEmpty(bytes);

        // The helper's admin assignment is visible in the staff detail…
        var detail = await EndpointHttp.Json(
            await worker.GetAsync($"/staff/orders/{order}"), HttpStatusCode.OK);
        Assert.NotNull(detail!["assignedEmployeeId"]);

        // …and assignment itself is admin-only.
        var other = await TestUsers.CreateAsync(fx, "employee");
        var denied = await worker.PatchJsonAsync(
            $"/staff/orders/{order}/assignment", new { employeeId = other.Id });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    [Fact]
    public async Task OrderFiles_Anonymous_Cannot_Read_StaffProof()
    {
        var (order, _, worker) = await CreateReadyForPaymentAsync();

        var pay = new Multipart()
            .Field("amount", "40.00")
            .Field("method", "bank transfer")
            .File("receipt", FileFixtures.Pdf, "receipt.pdf", "application/pdf");
        await pay.PostAsync(worker, $"/staff/orders/{order}/payment", await TestUsers.GetCsrfTokenAsync(worker));

        // The receipt attachment is in the staff detail…
        var detail = await EndpointHttp.Json(
            await worker.GetAsync($"/staff/orders/{order}"), HttpStatusCode.OK);
        var receipt = detail!["attachments"]!.AsArray()
            .First(a => a!["kind"]!.ToString() == "receipt")!;
        var url = receipt["url"]!.ToString()!;

        // …and anonymous gets no access to it.
        var anon = fx.CreateClient();
        var denied = await anon.GetAsync(url);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
    }

    [Fact]
    public async Task Admin_Orders_List_And_Metrics()
    {
        var order = await CreateOpenAsync();
        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        var list = await EndpointHttp.Json(
            await boss.GetAsync("/admin/orders?page=1&pageSize=500"), HttpStatusCode.OK);
        Assert.Contains(list!["items"]!.AsArray(), i => i!["id"]!.ToString() == order);

        var metrics = await EndpointHttp.Json(
            await boss.GetAsync("/admin/orders/metrics"), HttpStatusCode.OK);
        Assert.NotNull(metrics!["employees"]);
        Assert.NotNull(metrics["openOrders"]);

        // Employees are not admins: /admin/* is forbidden.
        var staff = await TestUsers.CreateAsync(fx, "employee");
        var worker = await TestUsers.LoginAsync(fx, staff.Email!);
        var denied = await worker.GetAsync("/admin/orders/metrics");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    // ---- helpers -----------------------------------------------------------

    private async Task<string> CreateOpenAsync()
    {
        var created = await PostGuestOrderAsync(
            fx.CreateClient(), GuestOrder(spec: "An open order for the test"));
        return (await EndpointHttp.Json(created, HttpStatusCode.OK))!["id"]!.ToString()!;
    }

    // Staff see only orders assigned to them (or of their customers), and
    // only an admin assigns — so staff workflows run behind an admin step.
    private async Task<(string Order, HttpClient Admin, HttpClient Worker)> CreateAssignedOrderAsync()
    {
        var order = await CreateOpenAsync();
        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var staff = await TestUsers.CreateAsync(fx, "employee");
        var worker = await TestUsers.LoginAsync(fx, staff.Email!);

        var assigned = await admin.PatchJsonAsync(
            $"/staff/orders/{order}/assignment", new { employeeId = staff.Id });
        Assert.Equal(HttpStatusCode.OK, assigned.StatusCode);

        return (order, admin, worker);
    }

    /// <summary>Assigned guest order pushed to ready_for_payment by staff.</summary>
    private async Task<(string Order, HttpClient Admin, HttpClient Worker)> CreateReadyForPaymentAsync()
    {
        var (order, admin, worker) = await CreateAssignedOrderAsync();
        var progress = await worker.PostJsonAsync(
            $"/staff/orders/{order}/status", new { status = "in_progress" });
        Assert.Equal(HttpStatusCode.OK, progress.StatusCode);
        var ready = await worker.PostJsonAsync(
            $"/staff/orders/{order}/status", new { status = "ready_for_payment", finalPrice = 42.0m });
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        return (order, admin, worker);
    }
}
