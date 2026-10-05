using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Real SignalR round-trips over the TestServer (plan 20261005-1348/02):
/// guest token via ?access_token=, cookie auth, JoinThread access checks,
/// the newMessage broadcast to the thread group, and HubException surfaces.
///
/// Transport: SSE (not WebSockets) — every request (negotiate, the
/// event-stream GET, and the streaming send POST) is plain HTTP, so the
/// in-memory TestServer handles it. The hub connection's requests ride a
/// handler that (a) routes to the TestServer and (b) shares one
/// CookieContainer with a regular REST client — so logging in through the
/// REST client authenticates the hub connection exactly like a browser
/// would (cookies on both), and no request is ever forwarded through an
/// existing HttpClient (which forbids re-sent request messages and hides
/// Set-Cookie).
/// </summary>
public class ChatHubTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public ChatHubTests(ApiTestFixture fx) => _fx = fx;

    private const int TimeoutSeconds = 15;

    /// <summary>
    /// Routes requests to the TestServer and, when a cookie container is
    /// given, carries + stores the session/identity cookies itself (the
    /// raw handler exposes Set-Cookie; HttpClient pipelines hide it).
    /// </summary>
    private sealed class TestServerHandler(
        HttpMessageHandler server, CookieContainer? cookies)
        : DelegatingHandler(server)
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
        {
            if (cookies is not null)
            {
                var cookieHeader = cookies.GetCookieHeader(request.RequestUri!);
                if (cookieHeader.Length > 0)
                {
                    request.Headers.TryAddWithoutValidation("Cookie", cookieHeader);
                }
            }

            var response = await base.SendAsync(request, ct);

            if (cookies is not null &&
                response.Headers.TryGetValues("Set-Cookie", out var setCookies))
            {
                foreach (var set in setCookies)
                {
                    var pair = set.Split(';', 2)[0].Trim();
                    var eq = pair.IndexOf('=');
                    if (eq > 0)
                    {
                        cookies.Add(new Cookie(
                            pair[..eq].Trim(), pair[(eq + 1)..].Trim(), "/", "localhost"));
                    }
                }
            }

            return response;
        }
    }

    /// <summary>A hub connection + the REST client that shares its cookies.</summary>
    private sealed record HubSession(HubConnection Connection, HttpClient Rest);

    /// <summary>
    /// Builds a hub session. <paramref name="user"/> signs in through the
    /// session's REST client (cookie auth for the hub); <paramref
    /// name="accessToken"/> is the visitor-thread token (query auth, the
    /// frontend's guest pattern).
    /// </summary>
    private async Task<HubSession> CreateHubSessionAsync(
        AppUser? user = null, string? accessToken = null)
    {
        var cookies = new CookieContainer();
        var rest = new HttpClient(
            new TestServerHandler(_fx.Factory.Server.CreateHandler(), cookies))
        {
            BaseAddress = new Uri("http://localhost/"),
        };

        if (user is not null)
        {
            var login = await rest.PostJsonAsync(
                "/identity/login",
                new { Email = user.Email, Password = "Passw0rd!x", Staff = user.IsEmployee });
            if (login.StatusCode != HttpStatusCode.OK)
            {
                throw new InvalidOperationException(
                    $"login failed: {(int)login.StatusCode} {await login.Content.ReadAsStringAsync()}");
            }
        }

        var url = "http://localhost/hubs/chat";
        if (accessToken is not null)
        {
            url += $"?access_token={accessToken}";
        }

        var connection = new HubConnectionBuilder()
            .WithUrl(
                url,
                HttpTransportType.ServerSentEvents,
                options => options.HttpMessageHandlerFactory =
                    _ => new TestServerHandler(_fx.Factory.Server.CreateHandler(), cookies))
            .Build();

        return new HubSession(connection, rest);
    }

    private static TaskCompletionSource<JsonNode?> NextMessageAsync(HubConnection conn)
    {
        var tcs = new TaskCompletionSource<JsonNode?>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        conn.On<JsonNode?>("newMessage", node => tcs.TrySetResult(node));
        return tcs;
    }

    private static async Task<JsonNode?> AwaitAsync(TaskCompletionSource<JsonNode?> tcs)
    {
        var completed = await Task.WhenAny(tcs.Task, Task.Delay(TimeoutSeconds * 1000));
        if (completed != tcs.Task)
        {
            throw new TimeoutException("timed out waiting for a hub broadcast");
        }

        return await tcs.Task;
    }

    /// <summary>Guest bootstraps a visitor thread; returns (client, threadId, token).</summary>
    private async Task<(HttpClient Client, string Thread, string Token)> BootstrapGuestAsync()
    {
        var client = _fx.CreateClient();
        var bootstrap = await client.PostAsJsonAsync("/chat/visitor",
            new { guestId = Guid.NewGuid().ToString("N"), name = "Guesty" });
        Assert.Equal(HttpStatusCode.OK, bootstrap.StatusCode);
        var created = (await bootstrap.Content.ReadFromJsonAsync<JsonNode>())!;
        return (client, created["thread"]!["id"]!.ToString(), created["token"]!.ToString());
    }

    [Fact]
    public async Task Guest_Sends_ViaHub_AssignedEmployee_ReceivesBroadcast()
    {
        var (_, threadId, token) = await BootstrapGuestAsync();

        // An employee claims the thread (REST, like the staff Visitors inbox).
        var employeeUser = await TestUsers.CreateAsync(_fx, role: "employee");
        var staff = await CreateHubSessionAsync(user: employeeUser);
        var claim = await staff.Rest.PostJsonAsync($"/chat/threads/{threadId}/claim", new { });
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        var employeeSession = staff;
        var guestSession = await CreateHubSessionAsync(accessToken: token);
        try
        {
            var employeeGot = NextMessageAsync(employeeSession.Connection);
            await employeeSession.Connection.StartAsync();
            await employeeSession.Connection.InvokeAsync("JoinThread", threadId);

            await guestSession.Connection.StartAsync();
            await guestSession.Connection.InvokeAsync("JoinThread", threadId);

            await guestSession.Connection.InvokeAsync(
                "SendMessage", threadId, "hello from the hub", null, null, "client-42");

            var broadcast = await AwaitAsync(employeeGot);
            Assert.Equal("hello from the hub", broadcast?["body"]!.ToString());
            Assert.Equal("guest", broadcast?["senderRole"]!.ToString());
            Assert.Equal("client-42", broadcast?["clientId"]!.ToString());
            Assert.NotNull(broadcast?["id"]);
        }
        finally
        {
            await employeeSession.Connection.StopAsync();
            await guestSession.Connection.StopAsync();
        }

        // Persisted exactly once, guest-sent, clientId never persisted.
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var message = await db.ChatMessages.SingleAsync(m => m.ThreadId == threadId);
        Assert.Equal("hello from the hub", message.Body);
        Assert.Equal("guest", message.SenderRole);
        Assert.NotNull(message.SenderGuestId);
        Assert.Null(message.SenderId);
    }

    [Fact]
    public async Task CustomerCookie_AuthAndAccess_JoinAndSend_Verified()
    {
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var customerSession = await CreateHubSessionAsync(user: customer);
        var created = await customerSession.Rest.PostJsonAsync(
            "/chat/threads", new { Subject = "hello there" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var threadId = (await created.Content.ReadFromJsonAsync<JsonNode>())!["id"]!.ToString();

        // An UNRELATED customer is rejected server-side on join.
        var other = await TestUsers.CreateAsync(_fx, role: "customer");
        var otherSession = await CreateHubSessionAsync(user: other);
        await otherSession.Connection.StartAsync();
        try
        {
            var ex = await Assert.ThrowsAsync<HubException>(
                () => otherSession.Connection.InvokeAsync("JoinThread", threadId));
            Assert.Contains("forbidden", ex.Message);
        }
        finally
        {
            await otherSession.Connection.StopAsync();
        }

        // An employee who has NOT claimed the thread is also rejected.
        var employeeUser = await TestUsers.CreateAsync(_fx, role: "employee");
        var staffSession = await CreateHubSessionAsync(user: employeeUser);
        await staffSession.Connection.StartAsync();
        try
        {
            var ex = await Assert.ThrowsAsync<HubException>(
                () => staffSession.Connection.InvokeAsync("JoinThread", threadId));
            Assert.Contains("forbidden", ex.Message);
        }
        finally
        {
            await staffSession.Connection.StopAsync();
        }

        // Claim, then the employee joins and receives the customer's send.
        var claim = await staffSession.Rest.PostJsonAsync(
            $"/chat/threads/{threadId}/claim", new { });
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        // (Re)start the employee connection — it was stopped after the
        // rejection above — and join the thread before sending.
        var employeeGot = NextMessageAsync(staffSession.Connection);
        await staffSession.Connection.StartAsync();
        await staffSession.Connection.InvokeAsync("JoinThread", threadId);

        await customerSession.Connection.StartAsync();
        await customerSession.Connection.InvokeAsync("JoinThread", threadId);
        await customerSession.Connection.InvokeAsync(
            "SendMessage", threadId, "staff, this is me", null, null, null);

        var broadcast = await AwaitAsync(employeeGot);
        Assert.Equal("staff, this is me", broadcast?["body"]!.ToString());
        Assert.Equal("customer", broadcast?["senderRole"]!.ToString());

        await customerSession.Connection.StopAsync();
    }

    [Fact]
    public async Task GuestToken_CannotJoin_NonVisitorThread()
    {
        var (_, _, token) = await BootstrapGuestAsync();

        // A customer's own thread is not a visitor thread — the token must
        // be refused even though it validates (different thread binding).
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var customerClient = await TestUsers.LoginAsync(_fx, customer.Email!);
        var mine = await customerClient.PostJsonAsync(
            "/chat/threads", new { Subject = "mine" });
        Assert.Equal(HttpStatusCode.Created, mine.StatusCode);
        var otherThreadId = (await mine.Content.ReadFromJsonAsync<JsonNode>())!["id"]!.ToString();

        var guestSession = await CreateHubSessionAsync(accessToken: token);
        await guestSession.Connection.StartAsync();
        try
        {
            var ex = await Assert.ThrowsAsync<HubException>(
                () => guestSession.Connection.InvokeAsync("JoinThread", otherThreadId));
            Assert.Contains("forbidden", ex.Message);
        }
        finally
        {
            await guestSession.Connection.StopAsync();
        }
    }

    [Fact]
    public async Task HubValidationError_SurfacesAsHubException()
    {
        var (_, threadId, token) = await BootstrapGuestAsync();

        var guestSession = await CreateHubSessionAsync(accessToken: token);
        await guestSession.Connection.StartAsync();
        try
        {
            // Empty body + no work + no files is rejected before persisting.
            var ex = await Assert.ThrowsAsync<HubException>(
                () => guestSession.Connection.InvokeAsync(
                    "SendMessage", threadId, "", null, null, null));
            Assert.Contains("message", ex.Message, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            await guestSession.Connection.StopAsync();
        }

        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(0, await db.ChatMessages.CountAsync(m => m.ThreadId == threadId));
    }

    [Fact]
    public async Task MarkRead_PersistsReadMarker_ForAuthorizedUser()
    {
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var customerSession = await CreateHubSessionAsync(user: customer);
        var created = await customerSession.Rest.PostJsonAsync(
            "/chat/threads", new { Subject = "read me" });
        var threadId = (await created.Content.ReadFromJsonAsync<JsonNode>())!["id"]!.ToString();

        await customerSession.Connection.StartAsync();
        try
        {
            await customerSession.Connection.InvokeAsync("MarkRead", threadId); // no error
        }
        finally
        {
            await customerSession.Connection.StopAsync();
        }

        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var marker = await db.ChatThreadReads.SingleOrDefaultAsync(
            r => r.ThreadId == threadId && r.UserId == customer.Id);
        Assert.NotNull(marker);
        // A just-written marker (not the epoch default).
        Assert.True(marker!.LastReadAt > DateTime.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task MarkRead_ForGuest_IsSilentNoOp()
    {
        var (_, threadId, token) = await BootstrapGuestAsync();

        var guestSession = await CreateHubSessionAsync(accessToken: token);
        await guestSession.Connection.StartAsync();
        try
        {
            // Guests have no account — MarkRead returns without error and
            // without writing anything (ChatService never sees it).
            await guestSession.Connection.InvokeAsync("MarkRead", threadId);
        }
        finally
        {
            await guestSession.Connection.StopAsync();
        }
    }
}
