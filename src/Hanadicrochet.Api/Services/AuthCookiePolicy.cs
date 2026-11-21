using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace Hanadicrochet.Api.Services;

/// <summary>
/// Decides how the auth cookie is scoped to HTTPS (plan 20261121-1452/02).
/// </summary>
/// <remarks>
/// HTTPS stays the default: outside Development the cookie is marked
/// <c>Secure</c> unless the install opts out with <c>Auth:RequireHttps=false</c>.
/// That opt-out exists for a self-hosted LAN install served over plain HTTP
/// (a Raspberry Pi on <c>http://192.168.x.x</c>, no domain): that address is not
/// a secure context, so browsers silently drop <c>Secure</c> cookies and every
/// sign-in looks successful while every following request is 401.
/// With the opt-out the policy is <see cref="CookieSecurePolicy.SameAsRequest"/>,
/// which still marks the cookie <c>Secure</c> whenever the request arrives over
/// HTTPS — including behind Caddy, whose <c>X-Forwarded-Proto</c> restores the
/// original scheme (forwarded headers are configured in <c>Program.cs</c>).
/// </remarks>
public static class AuthCookiePolicy
{
    /// <summary>Configuration switch: <c>true</c> forces <c>Secure</c> cookies.</summary>
    public const string RequireHttpsKey = "Auth:RequireHttps";

    /// <summary>
    /// <see cref="CookieSecurePolicy.Always"/> unless the install explicitly
    /// disables HTTPS; Development keeps its request-relative behaviour.
    /// </summary>
    public static CookieSecurePolicy ResolveSecurePolicy(
        bool isDevelopment,
        IConfiguration configuration)
    {
        // An empty value (`AUTH_REQUIRE_HTTPS=` in .env, or compose passing
        // `${AUTH_REQUIRE_HTTPS:-}`) means "not configured", not "false".
        var configured = configuration[RequireHttpsKey];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            if (!bool.TryParse(configured, out var explicitValue))
            {
                throw new InvalidOperationException(
                    $"Configuration '{RequireHttpsKey}' must be 'true' or 'false' (got '{configured}').");
            }

            return explicitValue
                ? CookieSecurePolicy.Always
                : CookieSecurePolicy.SameAsRequest;
        }

        // Default: HTTPS required outside Development.
        return isDevelopment ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    }
}
