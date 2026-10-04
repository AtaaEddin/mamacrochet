using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Hanadicrochet.Api.Tests;

[Collection("Api")]
public class HealthTests(ApiTestFixture _fx)
{
    [Fact]
    public async Task Health_ReturnsOkWithDatabase()
    {
        var client = _fx.CreateClient();
        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonNode?>();
        Assert.Equal("ok", body?["status"]?.ToString());
        Assert.Equal("connected", body?["database"]?.ToString());
    }

    [Fact]
    public async Task Antiforgery_ReturnsToken()
    {
        var client = _fx.CreateClient();
        using var response = await client.GetAsync("/antiforgery");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonNode?>();
        var token = json?["token"]?.ToString();
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public async Task UnknownRoute_Returns404()
    {
        var client = _fx.CreateClient();
        using var response = await client.GetAsync("/definitely-not-a-route");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
