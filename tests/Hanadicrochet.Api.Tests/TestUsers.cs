using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>User creation (UserManager) + login (real HTTP) helpers.</summary>
public static class TestUsers
{
    /// <summary>CSRF header name (matches the API antiforgery middleware).</summary>
    public const string CsrfHeader = "X-CSRF-TOKEN";

    public static string UniqueEmail(string prefix = "user") =>
        $"{prefix}-{Guid.NewGuid():N}@example.com";

    public static string UniqueName(string prefix = "Test") =>
        $"{prefix} {Guid.NewGuid():N}";

    /// <summary>
    /// Creates a user directly in the database. <paramref name="role"/> is
    /// "customer" | "employee" | "admin" (roles are flags on <see cref="AppUser"/>).
    /// </summary>
    public static async Task<AppUser> CreateAsync(
        ApiTestFixture fx,
        string role = "customer",
        string? email = null,
        string? displayName = null,
        string password = "Passw0rd!x",
        string? phone = "+1 555 0100")
    {
        using var scope = fx.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var userEmail = email ?? UniqueEmail(role);
        var user = new AppUser
        {
            // Identity needs a username; the email doubles as it (unique).
            UserName = userEmail,
            Email = userEmail,
            DisplayName = displayName ?? UniqueName(role),
            Phone = phone,
            IsEmployee = role is "employee" or "admin",
            IsAdmin = role == "admin",
            CreatedAt = DateTime.UtcNow,
        };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "User creation failed: " + string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        return user;
    }

    /// <summary>
    /// Signed-in client (cookie stored on the client's handler). The login
    /// POST is in the CSRF area, so the anonymous token is fetched first —
    /// exactly like the frontend does it.
    /// </summary>
    public static async Task<HttpClient> LoginAsync(
        ApiTestFixture fx,
        string email,
        string password = "Passw0rd!x",
        bool staff = false)
    {
        var client = fx.CreateClient();
        var token = await GetCsrfTokenAsync(client);
        var request = new HttpRequestMessage(HttpMethod.Post, "/identity/login")
        {
            Content = JsonContent.Create(new { Email = email, Password = password, Staff = staff }),
        };
        request.Headers.Add(CsrfHeader, token);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    /// <summary>
    /// The antiforgery token is principal-scoped: fetch it with the same
    /// client that performs the mutation.
    /// </summary>
    public static async Task<string> GetCsrfTokenAsync(HttpClient client)
    {
        var json = await client.GetFromJsonAsync<JsonNode?>("/antiforgery");
        var token = json?["token"]?.ToString();
        Assert.False(string.IsNullOrEmpty(token), "no antiforgery token returned");
        return token!;
    }

    /// <summary>POST a JSON body with the CSRF header (cookie client).</summary>
    public static async Task<HttpResponseMessage> PostJsonAsync(
        this HttpClient client,
        string url,
        object body)
    {
        var token = await GetCsrfTokenAsync(client);
        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add(CsrfHeader, token);
        return await client.SendAsync(request);
    }

    /// <summary>PATCH a JSON body with the CSRF header.</summary>
    public static async Task<HttpResponseMessage> PatchJsonAsync(
        this HttpClient client,
        string url,
        object body)
    {
        var token = await GetCsrfTokenAsync(client);
        var request = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add(CsrfHeader, token);
        return await client.SendAsync(request);
    }

    /// <summary>DELETE with the CSRF header.</summary>
    public static async Task<HttpResponseMessage> DeleteAsync(this HttpClient client, string url)
    {
        var token = await GetCsrfTokenAsync(client);
        var request = new HttpRequestMessage(HttpMethod.Delete, url);
        request.Headers.Add(CsrfHeader, token);
        return await client.SendAsync(request);
    }

    /// <summary>Reads a JSON body (null for an empty body).</summary>
    public static async Task<JsonNode?> JsonOrNull(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
    }

    /// <summary>API 4xx envelope: {"code": "...", "message": "..."}</summary>
    public static string ApiErrorCode(JsonNode? body) => body?["code"]?.ToString() ?? "?";
}
