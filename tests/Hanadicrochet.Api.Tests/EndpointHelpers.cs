using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Multipart form builder for the guest/public and staff file endpoints
/// (POST /orders, /chat/…/attachments, /staff/orders/…, /hiring, avatars).
/// </summary>
public sealed class Multipart
{
    public MultipartFormDataContent Content { get; } = new();

    public Multipart Field(string name, string? value)
    {
        if (value is not null)
        {
            Content.Add(new StringContent(value, Encoding.UTF8, "text/plain"), name);
        }

        return this;
    }

    public Multipart File(string name, byte[] bytes, string fileName, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        Content.Add(content, name, fileName);
        return this;
    }

    public async Task<HttpResponseMessage> PostAsync(HttpClient client, string url, string? csrfToken = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = Content };
        if (csrfToken is not null)
        {
            request.Headers.Add(TestUsers.CsrfHeader, csrfToken);
        }

        return await client.SendAsync(request);
    }
}

/// <summary>JSON/HTTP assertion helpers for endpoint tests.</summary>
public static class EndpointHttp
{
    /// <summary>Asserts the status and returns the parsed JSON body.</summary>
    public static async Task<JsonNode?> Json(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return await TestUsers.JsonOrNull(response);
    }

    /// <summary>Asserts an ApiError envelope: {"code": …}.</summary>
    public static async Task<string> Error(HttpResponseMessage response, HttpStatusCode expected, string code)
    {
        var body = await Json(response, expected);
        Assert.Equal(code, TestUsers.ApiErrorCode(body));
        return code;
    }

    /// <summary>GET with status + bytes (file routes).</summary>
    public static async Task<byte[]> Bytes(HttpClient client, string url, HttpStatusCode expected)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(expected, response.StatusCode);
        return await response.Content.ReadAsByteArrayAsync();
    }

    /// <summary>GET JSON with status.</summary>
    public static async Task<JsonNode?> GetJson(
        HttpClient client, string url, HttpStatusCode expected)
    {
        var response = await client.GetAsync(url);
        return await Json(response, expected);
    }

    /// <summary>True when the UserDto <c>roles</c> array contains <paramref name="role"/>.</summary>
    public static bool HasRole(JsonNode user, string role)
    {
        if (user is null)
        {
            return false;
        }

        foreach (var n in user["roles"]!.AsArray())
        {
            if (n!.ToString() == role)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>A fresh visitor bootstrap (guest id + thread + token).</summary>
    public static async Task<(string GuestId, JsonNode Thread, string Token)> BootstrapVisitor(
        HttpClient client)
    {
        var guestId = Guid.NewGuid().ToString();
        var response = await client.PostAsync("/chat/visitor", new StringContent(
            $"{{\"guestId\":\"{guestId}\"}}", Encoding.UTF8, "application/json"));
        var body = await Json(response, HttpStatusCode.OK);
        var thread = body!["thread"]!;
        var token = body["token"]!.ToString()!;
        return (guestId, thread, token);
    }
}
