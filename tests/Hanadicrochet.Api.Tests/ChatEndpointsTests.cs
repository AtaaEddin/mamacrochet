using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Chat endpoint coverage (plan 06): visitor bootstrap + token-auth guest
/// traffic, the customer thread surface, the staff claim/assign/close
/// workflow, attachments with signed file links, and access control.
/// </summary>
[Collection("Api")]
public class ChatEndpointsTests(ApiTestFixture fx)
{
    /// <summary>Sends a guest request authenticated by X-Chat-Token.</summary>
    private static async Task<HttpResponseMessage> Guest(
        HttpClient client, string token, HttpMethod method, string url, HttpContent? content = null)
    {
        var request = new HttpRequestMessage(method, url) { Content = content };
        request.Headers.Add("X-Chat-Token", token);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> GuestJson(
        HttpClient client, string token, string url, object body)
    {
        return await Guest(client, token, HttpMethod.Post, url, new StringContent(
            System.Text.Json.JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
    }

    private static async Task<(string GuestId, JsonNode Thread, string Token)> Bootstrap(HttpClient client)
    {
        var guestId = Guid.NewGuid().ToString();
        var name = TestUsers.UniqueName("Visitor");
        var response = await client.PostAsync("/chat/visitor", new StringContent(
            $"{{\"guestId\":\"{guestId}\",\"name\":\"{name}\"}}",
            Encoding.UTF8, "application/json"));
        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        return (guestId, body!["thread"]!, body["token"]!.ToString()!);
    }

    [Fact]
    public async Task Visitor_Bootstrap_Send_List_Details()
    {
        var client = fx.CreateClient();
        var (_, thread, token) = await Bootstrap(client);
        var threadId = thread["id"]!.ToString()!;

        // Guest sends the first message.
        var sent = await GuestJson(
            client, token, $"/chat/threads/{threadId}/messages", new { body = "Hi! Do you make totes?" });
        var message = await EndpointHttp.Json(sent, HttpStatusCode.Created);
        Assert.Equal("Hi! Do you make totes?", message!["body"]!.ToString());

        // Message list (ascending).
        var page = await EndpointHttp.Json(
            await Guest(client, token, HttpMethod.Get, $"/chat/threads/{threadId}/messages?limit=50"),
            HttpStatusCode.OK);
        var messages = page!["messages"]!.AsArray();
        Assert.Single(messages);
        Assert.Equal("Hi! Do you make totes?", messages[0]!["body"]!.ToString());

        // Thread detail for the owning guest.
        var detail = await EndpointHttp.Json(
            await Guest(client, token, HttpMethod.Get, $"/chat/threads/{threadId}"),
            HttpStatusCode.OK);
        Assert.Equal(threadId, detail!["id"]!.ToString());
        Assert.False(detail["isClosed"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Visitor_Bootstrap_Honeypot_And_Invalid()
    {
        var client = fx.CreateClient();

        // Honeypot hit: warm fake success, no row stored.
        var guestId = Guid.NewGuid().ToString();
        var honey = await client.PostAsync("/chat/visitor", new StringContent(
            $"{{\"guestId\":\"{guestId}\",\"website\":\"spam.example\"}}",
            Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, honey.StatusCode);
        using (var scope = fx.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.False(await db.ChatThreads.AnyAsync(t => t.GuestId == guestId));
        }

        // Missing guest id.
        var bad = await client.PostAsync("/chat/visitor", new StringContent(
            "{}", Encoding.UTF8, "application/json"));
        await EndpointHttp.Error(bad, HttpStatusCode.BadRequest, "invalid_request");
    }

    [Fact]
    public async Task Visitor_Token_Is_ThreadScoped()
    {
        var client = fx.CreateClient();
        var (_, threadA, tokenA) = await Bootstrap(client);
        var (_, threadB, tokenB) = await Bootstrap(client);
        var idB = threadB["id"]!.ToString()!;

        // A's token must not open B's thread.
        var cross = await Guest(client, tokenA, HttpMethod.Get, $"/chat/threads/{idB}");
        await EndpointHttp.Error(cross, HttpStatusCode.Forbidden, "forbidden");

        // B's own token works.
        var ok = await Guest(client, tokenB, HttpMethod.Get, $"/chat/threads/{idB}");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        // Garbage token → treated as no token → still no access.
        var garbage = await Guest(client, "not-a-token", HttpMethod.Get, $"/chat/threads/{idB}");
        await EndpointHttp.Error(garbage, HttpStatusCode.Forbidden, "forbidden");

        // The thread A belongs to stays readable for A.
        var own = await Guest(client, tokenA, HttpMethod.Get, $"/chat/threads/{threadA["id"]!.ToString()}");
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
    }

    [Fact]
    public async Task Attachment_Upload_Message_Signature_Served()
    {
        var client = fx.CreateClient();
        var (_, thread, token) = await Bootstrap(client);
        var threadId = thread["id"]!.ToString()!;

        // Upload an attachment (multipart, token-auth).
        var upload = new Multipart().File("files", FileFixtures.Png, "design.png", "image/png");
        var uploaded = await EndpointHttp.Json(
            await Guest(client, token, HttpMethod.Post, $"/chat/threads/{threadId}/attachments", upload.Content),
            HttpStatusCode.OK);
        var attachments = uploaded!["attachments"]!.AsArray();
        Assert.Single(attachments);
        var attachment = attachments[0]!;
        var url = attachment["url"]!.ToString()!;

        // The signed link serves the bytes (no cookies, no token needed).
        var bytes = await EndpointHttp.Bytes(client, url, HttpStatusCode.OK);
        Assert.NotEmpty(bytes);

        // Reference it in a message.
        var sent = await GuestJson(
            client, token, $"/chat/threads/{threadId}/messages",
            new
            {
                body = "My idea:",
                attachmentIds = new[] { attachment["id"]!.ToString() },
            });
        var message = await EndpointHttp.Json(sent, HttpStatusCode.Created);
        Assert.Single(message!["attachments"]!.AsArray());
    }

    [Fact]
    public async Task Customer_CreateThread_List_Delete()
    {
        var email = TestUsers.UniqueEmail("chat");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var customer = await TestUsers.LoginAsync(fx, email);

        // New conversation thread.
        var created = await EndpointHttp.Json(
            await customer.PostJsonAsync("/chat/threads", new { subject = "Question about a bag" }),
            HttpStatusCode.Created);
        var threadId = created!["id"]!.ToString()!;

        // It is in "my threads".
        var list = await EndpointHttp.Json(
            await customer.GetAsync("/chat/threads"), HttpStatusCode.OK);
        Assert.Contains(list!["threads"]!.AsArray(), t => t!["id"]!.ToString() == threadId);

        // Customer can send into their own thread.
        var sent = await customer.PostJsonAsync(
            $"/chat/threads/{threadId}/messages", new { body = "Hello!" });
        Assert.Equal(HttpStatusCode.Created, sent.StatusCode);

        // Customer deletes the thread.
        var deleted = await TestUsers.DeleteWithCsrfAsync(customer, $"/chat/threads/{threadId}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
    }

    [Fact]
    public async Task Staff_Claim_Close_And_Admin_Assign()
    {
        // A guest starts a thread…
        var client = fx.CreateClient();
        var (_, thread, _) = await Bootstrap(client);
        var threadId = thread["id"]!.ToString()!;

        // …an employee sees it in the visitor queue and claims it.
        var staff = await TestUsers.CreateAsync(fx, "employee");
        var worker = await TestUsers.LoginAsync(fx, staff.Email!);

        var queue = await EndpointHttp.Json(
            await worker.GetAsync("/chat/threads?kind=visitor"), HttpStatusCode.OK);
        Assert.Contains(queue!["threads"]!.AsArray(), t => t!["id"]!.ToString() == threadId);

        var claimed = await EndpointHttp.Json(
            await worker.PostJsonAsync($"/chat/threads/{threadId}/claim", new { }),
            HttpStatusCode.OK);
        Assert.Equal(threadId, claimed!["id"]!.ToString());

        // Admin assigns it to the employee.
        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);
        var assigned = await EndpointHttp.Json(
            await boss.PostJsonAsync(
                $"/chat/threads/{threadId}/assign", new { employeeId = staff.Id }),
            HttpStatusCode.OK);
        Assert.Equal(threadId, assigned!["id"]!.ToString());

        // Staff closes with a reason.
        var closed = await EndpointHttp.Json(
            await worker.PostJsonAsync(
                $"/chat/threads/{threadId}/close", new { reason = "Customer is happy." }),
            HttpStatusCode.OK);
        Assert.True(closed!["isClosed"]!.GetValue<bool>());

        // Closing twice is a conflict.
        var again = await worker.PostJsonAsync(
            $"/chat/threads/{threadId}/close", new { reason = "again" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Staff_Can_Claim_Threads_Assigns_To_Caller()
    {
        // Customer thread (owned by a customer account).
        var email = TestUsers.UniqueEmail("chat2");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var customer = await TestUsers.LoginAsync(fx, email);
        var created = await EndpointHttp.Json(
            await customer.PostJsonAsync("/chat/threads", new { subject = "Mine" }),
            HttpStatusCode.Created);
        var threadId = created!["id"]!.ToString()!;

        // Any staff member may take the conversation (assigns it to the caller).
        var staff = await TestUsers.CreateAsync(fx, "employee");
        var worker = await TestUsers.LoginAsync(fx, staff.Email!);
        var claimed = await worker.PostJsonAsync($"/chat/threads/{threadId}/claim", new { });
        var body = await EndpointHttp.Json(claimed, HttpStatusCode.OK);
        Assert.Equal(threadId, body!["id"]!.ToString());

        // A customer (non-staff) never gets the claim door.
        var denied = await customer.PostJsonAsync($"/chat/threads/{threadId}/claim", new { });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_Are_Kept_Out()
    {
        var client = fx.CreateClient();

        // No cookie, no token: "my threads" is unauthenticated.
        var mine = await client.GetAsync("/chat/threads");
        Assert.Equal(HttpStatusCode.Unauthorized, mine.StatusCode);

        // A guest thread with neither cookie nor token: not found.
        var (_, thread, _) = await Bootstrap(client);
        var anonymous = await client.GetAsync($"/chat/threads/{thread["id"]!.ToString()}");
        await EndpointHttp.Error(anonymous, HttpStatusCode.Forbidden, "forbidden");
    }
}
