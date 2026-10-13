using System.Net;
using System.Net.Http.Json;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Program.cs pipeline coverage (plan 20261005-1348/04, batch B): the
/// dev-only OpenAPI document and /alive on the fixture app, a production
/// environment factory for the non-dev pipeline branches (CORS origins,
/// exception handler, forwarded headers) and the rate-limit rejection
/// envelope, plus unit tests of ApiExceptionHandler itself.
/// </summary>
public class ProgramTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public ProgramTests(ApiTestFixture fx) => _fx = fx;

    [Fact]
    public async Task OpenApi_Document_ServedInDevelopment()
    {
        using var client = _fx.CreateClient();
        using var response = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"openapi\"", body);
    }

    [Fact]
    public async Task Alive_Endpoint_Responds()
    {
        using var client = _fx.CreateClient();
        using var response = await client.GetAsync("/alive");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Production_Pipeline_Starts_RateLimits_WithEnvelope()
    {
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            // WebHostDefaults.EnvironmentKey is "environment" (not the
            // ASPNETCORE_ENVIRONMENT env var): this is what flips the host
            // into the non-Development pipeline.
            builder.UseSetting("environment", "Production");
            builder.UseSetting("ConnectionStrings:hanadicrochet", _fx.ConnectionString);
            builder.UseSetting("Uploads:Root", _fx.UploadsRoot);
            builder.UseSetting("AdminSeed:Email", ApiTestFixture.SeedAdminEmail);
            builder.UseSetting("AdminSeed:Password", ApiTestFixture.SeedAdminPassword);
            // Non-empty CORS origins: exercises the configured-origins branch
            // (the fixture dev app uses the localhost fallback list).
            builder.UseSetting("Cors:Origins:0", "https://prod-hanadicrochet.example");
            // Guest budget 1/min: two guest submits prove the 429 envelope.
            builder.UseSetting("RateLimit:Guest", "1");
            builder.UseSetting("RateLimit:Auth", "100000");
            builder.UseSetting("RateLimit:Default", "100000");
        });
        using (factory)
        {
            var client = factory.CreateClient();

            // The non-dev pipeline (forwarded headers + exception handler
            // middleware) serves a normal request.
            using (var health = await client.GetAsync("/health"))
            {
                Assert.Equal(HttpStatusCode.OK, health.StatusCode);
            }

            // CORS policy came from config (this origin is not in the dev
            // localhost fallback): the preflight proves the non-dev pipeline
            // is actually active.
            var preflight = new HttpRequestMessage(HttpMethod.Options, "/hiring");
            preflight.Headers.TryAddWithoutValidation("Origin", "https://prod-hanadicrochet.example");
            preflight.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "POST");
            using (var cors = await client.SendAsync(preflight))
            {
                Assert.Equal(HttpStatusCode.NoContent, cors.StatusCode);
                Assert.Equal(
                    new[] { "https://prod-hanadicrochet.example" },
                    cors.Headers.GetValues("Access-Control-Allow-Origin"));
            }

            // Guest submit budget is 1/minute: the first request consumes
            // the only permit (it may still fail validation), the second is
            // rejected by the limiter with the API error envelope.
            using var first = await client.PostAsJsonAsync("/hiring", new { });
            Assert.True((int)first.StatusCode < 500, $"first={first.StatusCode}");
            using var second = await client.PostAsJsonAsync("/hiring", new { });
            Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
            Assert.Contains(
                "rate_limited", await second.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task ApiExceptionHandler_Handles_WhenResponseNotStarted()
    {
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var handled = await handler.TryHandleAsync(
            context, new InvalidOperationException("boom"), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        context.Response.Body.Position = 0;
        var json = await new StreamReader(context.Response.Body).ReadToEndAsync();
        var options = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        };
        var error = System.Text.Json.JsonSerializer.Deserialize<ApiError>(json, options);
        Assert.NotNull(error);
        Assert.Equal("server_error", error.Code);
    }


}
