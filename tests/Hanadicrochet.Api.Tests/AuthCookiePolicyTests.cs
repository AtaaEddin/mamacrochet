using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// The auth-cookie HTTPS policy (plan 20261121-1452/02): HTTPS by default, with
/// an explicit opt-out for a plain-HTTP LAN install.
/// </summary>
public class AuthCookiePolicyTests
{
    private static IConfiguration Config(string? requireHttps = null)
    {
        var values = new Dictionary<string, string?>();
        if (requireHttps is not null)
        {
            values[AuthCookiePolicy.RequireHttpsKey] = requireHttps;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    [Fact]
    public void Development_Default_IsRequestRelative()
    {
        Assert.Equal(
            CookieSecurePolicy.SameAsRequest,
            AuthCookiePolicy.ResolveSecurePolicy(isDevelopment: true, Config()));
    }

    [Fact]
    public void Production_Default_RequiresHttps()
    {
        Assert.Equal(
            CookieSecurePolicy.Always,
            AuthCookiePolicy.ResolveSecurePolicy(isDevelopment: false, Config()));
    }

    [Fact]
    public void Production_OptOut_IsRequestRelative()
    {
        Assert.Equal(
            CookieSecurePolicy.SameAsRequest,
            AuthCookiePolicy.ResolveSecurePolicy(isDevelopment: false, Config("false")));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ExplicitTrue_RequiresHttpsInEveryEnvironment(bool isDevelopment)
    {
        Assert.Equal(
            CookieSecurePolicy.Always,
            AuthCookiePolicy.ResolveSecurePolicy(isDevelopment, Config("true")));
    }

    [Fact]
    public void BlankValue_IsTreatedAsNotConfigured()
    {
        // `AUTH_REQUIRE_HTTPS=` in an .env file must not be parsed as false.
        Assert.Equal(
            CookieSecurePolicy.Always,
            AuthCookiePolicy.ResolveSecurePolicy(isDevelopment: false, Config("")));
    }

    [Fact]
    public void InvalidValue_FailsFast()
    {
        var error = Assert.Throws<InvalidOperationException>(
            () => AuthCookiePolicy.ResolveSecurePolicy(isDevelopment: false, Config("yes please")));
        Assert.Contains(AuthCookiePolicy.RequireHttpsKey, error.Message);
    }
}
