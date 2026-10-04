using System.Text;
using Hanadicrochet.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Stateless HMAC guest tokens + file read-signatures (pure — no DB):
/// round-trips, tamper rejection, expiry, and key validation.
/// </summary>
public class ChatTokenServiceTests
{
    private const string FixedKey = "c2VlZC10ZXN0LWtleS0zMi1ieXRlcy1vZi1kYXRhLW9r"; // base64 of 33 bytes

    private static ChatTokenService New(
        string? tokenKey = null,
        TimeSpan? tokenLifetime = null,
        TimeSpan? fileSignatureLifetime = null)
    {
        var options = new ChatTokenOptions
        {
            TokenKey = tokenKey ?? FixedKey,
        };
        if (tokenLifetime is not null)
        {
            options.TokenLifetime = tokenLifetime.Value;
        }
        if (fileSignatureLifetime is not null)
        {
            options.FileSignatureLifetime = fileSignatureLifetime.Value;
        }
        return new ChatTokenService(Options.Create(options), NullLogger<ChatTokenService>.Instance);
    }

    [Fact]
    public void ThreadToken_RoundTripsThreadAndDevice()
    {
        var svc = New();
        var token = svc.CreateThreadToken("thread-1", "guest-1");
        var validated = svc.TryValidateThreadToken(token);
        Assert.NotNull(validated);
        Assert.Equal("thread-1", validated!.Value.ThreadId);
        Assert.Equal("guest-1", validated.Value.GuestId);
    }

    [Fact]
    public void ThreadToken_TamperedPayloadOrMac_IsRejected()
    {
        var svc = New();
        var token = svc.CreateThreadToken("thread-1", "guest-1");
        var parts = token.Split('.', 2);
        var (a, b) = (parts[0], parts[1]);

        // Corrupt one payload char.
        var payload = Encoding.UTF8.GetBytes(a);
        payload[2] = payload[2] == (byte)'a' ? (byte)'b' : (byte)'a';
        Assert.Null(svc.TryValidateThreadToken($"{B64Url(payload)}.{b}"));

        // Corrupt the mac.
        var mac = Encoding.UTF8.GetBytes(b);
        mac[3] = mac[3] == (byte)'a' ? (byte)'b' : (byte)'a';
        Assert.Null(svc.TryValidateThreadToken($"{a}.{B64Url(mac)}"));

        // A token minted by ANOTHER key does not validate here.
        var other = New(tokenKey: Convert.ToBase64String(Enumerable.Repeat((byte)7, 32).ToArray()));
        Assert.Null(svc.TryValidateThreadToken(other.CreateThreadToken("thread-1", "guest-1")));
    }

    private static string B64Url(byte[] data)
    {
        var s = Convert.ToBase64String(data);
        return s.TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-token")]
    [InlineData("a.b.c")]
    [InlineData("!!!.!!!")]
    public void ThreadToken_MalformedTokens_AreNull(string? token)
    {
        Assert.Null(New().TryValidateThreadToken(token));
    }

    [Fact]
    public void ThreadToken_Expired_IsRejected()
    {
        var svc = New(tokenLifetime: TimeSpan.FromSeconds(-5));
        var token = svc.CreateThreadToken("thread-1", "guest-1");
        Assert.Null(svc.TryValidateThreadToken(token));
    }

    [Fact]
    public void EphemeralKey_ModeWorksWhenUnset()
    {
        var options = Options.Create(new ChatTokenOptions());
        var svc = new ChatTokenService(options, NullLogger<ChatTokenService>.Instance);
        var token = svc.CreateThreadToken("t", "g");
        Assert.Equal(("t", "g"), svc.TryValidateThreadToken(token));
    }

    [Fact]
    public void TokenKey_BadBase64_Throws()
    {
        var options = Options.Create(new ChatTokenOptions { TokenKey = "not base64!!" });
        Assert.Throws<InvalidOperationException>(
            () => new ChatTokenService(options, NullLogger<ChatTokenService>.Instance));
    }

    [Fact]
    public void TokenKey_ShorterThan32Bytes_Throws()
    {
        var options = Options.Create(new ChatTokenOptions
        {
            TokenKey = Convert.ToBase64String(new byte[16]),
        });
        Assert.Throws<InvalidOperationException>(
            () => new ChatTokenService(options, NullLogger<ChatTokenService>.Instance));
    }

    [Fact]
    public void FileSignature_RoundTripsAndRejectsTampering()
    {
        var svc = New();
        var (exp, sig) = svc.CreateFileSignature("thread-1", "abc.png");
        Assert.True(svc.VerifyFileSignature("thread-1", "abc.png", sig, exp));

        // Different file / different thread / wrong exp → no.
        Assert.False(svc.VerifyFileSignature("thread-1", "other.png", sig, exp));
        Assert.False(svc.VerifyFileSignature("thread-2", "abc.png", sig, exp));
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", sig, exp + 1));

        // Tampered signature.
        var tampered = Encoding.UTF8.GetBytes(sig);
        tampered[4] = tampered[4] == (byte)'a' ? (byte)'b' : (byte)'a';
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", Convert.ToBase64String(tampered), exp));

        // Missing pieces.
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", sig, null));
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", null, exp));
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", "", exp));
    }

    [Fact]
    public void FileSignature_Expired_IsRejected()
    {
        var svc = New(fileSignatureLifetime: TimeSpan.FromSeconds(-5));
        var (exp, sig) = svc.CreateFileSignature("thread-1", "abc.png");
        Assert.False(svc.VerifyFileSignature("thread-1", "abc.png", sig, exp));
    }
}
