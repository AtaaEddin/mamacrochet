using System.Security.Cryptography;
using Hanadicrochet.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Unit tests for ChatTokenService expiry and malformed-payload paths
/// (plan 20261005-1348/04, batch B). The token is HMAC-signed, so the
/// forged-token test signs with the known test key to get past the
/// signature check and into JSON parsing.
/// </summary>
public class ChatTokenServiceTests
{
    private static readonly byte[] Key =
        System.Linq.Enumerable.Repeat((byte)7, 32).ToArray();

    private static ChatTokenService CreateService(TimeSpan? lifetime = null)
    {
        var options = new ChatTokenOptions
        {
            TokenKey = Convert.ToBase64String(Key),
        };
        if (lifetime is not null)
        {
            options.TokenLifetime = lifetime.Value;
        }

        return new ChatTokenService(
            Options.Create(options), NullLogger<ChatTokenService>.Instance);
    }

    [Fact]
    public void ValidToken_ReturnsThreadIdAndGuestId()
    {
        var service = CreateService();
        var token = service.CreateThreadToken("thread-1", "guest-1");
        var result = service.TryValidateThreadToken(token);

        Assert.NotNull(result);
        Assert.Equal(("thread-1", "guest-1"), result!);
    }

    [Fact]
    public void ExpiredToken_ReturnsNull()
    {
        var service = CreateService(TimeSpan.FromMilliseconds(-5000));
        var token = service.CreateThreadToken("thread-1", "guest-1");

        Assert.Null(service.TryValidateThreadToken(token));
    }

    [Fact]
    public void MalformedPayloadWithValidSignature_ReturnsNull()
    {
        var service = CreateService();
        var payload = "this is not json";
        var token = $"{Base64Url(System.Text.Encoding.UTF8.GetBytes(payload))}.{Base64Url(HmacSha256(payload))}";

        Assert.Null(service.TryValidateThreadToken(token));
    }

    [Fact]
    public void TokenKey_NotBase64_Throws()
    {
        Assert.Throws<InvalidOperationException>(
            () => CreateServiceWithKey("not base64 !!!"));
    }

    [Fact]
    public void TokenKey_ShorterThanMinBytes_Throws()
    {
        Assert.Throws<InvalidOperationException>(
            () => CreateServiceWithKey(Convert.ToBase64String(new byte[16])));
    }

    [Fact]
    public void TryValidate_NullOrEmpty_ReturnsNull()
    {
        var service = CreateService();

        Assert.Null(service.TryValidateThreadToken(null));
        Assert.Null(service.TryValidateThreadToken(""));
        Assert.Null(service.TryValidateThreadToken("   "));
    }

    [Fact]
    public void TryValidate_UncodeableBase64Url_ReturnsNull()
    {
        var service = CreateService();

        Assert.Null(service.TryValidateThreadToken("!!!.###"));
    }

    [Fact]
    public void TryValidate_WrongMac_ReturnsNull()
    {
        var service = CreateService();
        var token = service.CreateThreadToken("thread-1", "guest-1");
        var wrongMac = Base64Url(System.Linq.Enumerable.Repeat((byte)8, 32).ToArray());
        var forged = token.Split('.')[0] + "." + wrongMac;

        Assert.Null(service.TryValidateThreadToken(forged));
    }

    [Fact]
    public void TryValidate_EmptyThreadIdOrGuestId_ReturnsNull()
    {
        var service = CreateService();
        long exp = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();

        Assert.Null(
            service.TryValidateThreadToken(
                ForgeToken($"{{\"threadId\":\"\",\"guestId\":\"g1\",\"exp\":{exp}}}")));
        Assert.Null(
            service.TryValidateThreadToken(
                ForgeToken($"{{\"threadId\":\"t1\",\"guestId\":\"\",\"exp\":{exp}}}")));
    }

    [Fact]
    public void VerifyFileSignature_MissingSigOrExp_ReturnsFalse()
    {
        var service = CreateService();

        Assert.False(service.VerifyFileSignature("t1", "a.png", null, 123));
        Assert.False(service.VerifyFileSignature("t1", "a.png", "sig", null));
    }

    [Fact]
    public void VerifyFileSignature_Expired_ReturnsFalse()
    {
        var service = CreateService();
        long past = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeSeconds();

        Assert.False(service.VerifyFileSignature("t1", "a.png", "AAAA", past));
    }

    private static ChatTokenService CreateServiceWithKey(string tokenKey)
    {
        var options = new ChatTokenOptions { TokenKey = tokenKey };
        return new ChatTokenService(
            Options.Create(options), NullLogger<ChatTokenService>.Instance);
    }

    private static string ForgeToken(string payloadJson)
    {
        var data = System.Text.Encoding.UTF8.GetBytes(payloadJson);
        return $"{Base64Url(data)}.{Base64Url(HmacSha256(payloadJson))}";
    }

    private static byte[] HmacSha256(string data)
    {
        using var hmac = new HMACSHA256(Key);
        return hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(data));
    }

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
