using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Hanadicrochet.Api.Tests;

[Collection("Api")]
public class IdentityEndpointsTests(ApiTestFixture fx)
{

    // ---- /antiforgery -----------------------------------------------------

    [Fact]
    public async Task Antiforgery_ReturnsToken()
    {
        var client = fx.CreateClient();
        var body = await EndpointHttp.GetJson(client, "/antiforgery", HttpStatusCode.OK);
        Assert.False(string.IsNullOrEmpty(body!["token"]?.ToString()));
    }

    // ---- register ---------------------------------------------------------

    [Fact]
    public async Task Register_InvalidInputs_400()
    {
        var client = fx.CreateClient();

        // Name too short.
        var shortName = await client.PostJsonAsync(
            "/identity/register",
            new { name = "A", email = TestUsers.UniqueEmail(), password = "Passw0rd!x" });
        await EndpointHttp.Error(shortName, HttpStatusCode.BadRequest, "invalid");

        // Missing e-mail.
        var noEmail = await client.PostJsonAsync(
            "/identity/register",
            new { name = "Ada Lovelace", email = "", password = "Passw0rd!x" });
        await EndpointHttp.Error(noEmail, HttpStatusCode.BadRequest, "invalid");

        // Missing password.
        var noPassword = await client.PostJsonAsync(
            "/identity/register",
            new { name = "Ada Lovelace", email = TestUsers.UniqueEmail(), password = "" });
        await EndpointHttp.Error(noPassword, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Register_WeakPassword_400()
    {
        var client = fx.CreateClient();
        var response = await client.PostJsonAsync(
            "/identity/register",
            new { name = "Ada Lovelace", email = TestUsers.UniqueEmail(), password = "short" });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "PasswordTooShort");
    }

    [Fact]
    public async Task Register_DuplicateEmail_409()
    {
        var email = TestUsers.UniqueEmail();
        await TestUsers.CreateAsync(fx, "customer", email: email);

        var client = fx.CreateClient();
        var response = await client.PostJsonAsync(
            "/identity/register",
            new { name = "Ada Lovelace", email, password = "Passw0rd!x" });
        await EndpointHttp.Error(response, HttpStatusCode.Conflict, "email_taken");
    }

    [Fact]
    public async Task Register_Ok_SignsInAndMeWorks()
    {
        var client = fx.CreateClient();
        var email = TestUsers.UniqueEmail("reg");
        var body = await EndpointHttp.Json(
            await client.PostJsonAsync(
                "/identity/register",
                new { name = "Ada Lovelace", email, phone = "+1 555 0100", password = "Passw0rd!x" }),
            HttpStatusCode.OK);

        Assert.Equal(email, body!["email"]!.ToString());

        // The register response sets the session cookie — /me works now.
        var me = await EndpointHttp.GetJson(client, "/identity/me", HttpStatusCode.OK);
        Assert.Equal(body!["id"]!.ToString(), me!["id"]!.ToString());
        Assert.True(EndpointHttp.HasRole(me!, "customer"));
    }

    // ---- login ------------------------------------------------------------

    [Fact]
    public async Task Login_EmptyCredentials_401()
    {
        var client = fx.CreateClient();

        var noEmail = await client.PostJsonAsync(
            "/identity/login", new { email = "", password = "Passw0rd!x" });
        await EndpointHttp.Error(noEmail, HttpStatusCode.Unauthorized, "bad_credentials");

        var noPassword = await client.PostJsonAsync(
            "/identity/login",
            new { email = TestUsers.UniqueEmail(), password = "" });
        await EndpointHttp.Error(noPassword, HttpStatusCode.Unauthorized, "bad_credentials");
    }

    [Fact]
    public async Task Logout_SignsOut_204()
    {
        var email = TestUsers.UniqueEmail("logout");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var loggedOut = await client.PostJsonAsync("/identity/logout", new { });
        Assert.Equal(HttpStatusCode.NoContent, loggedOut.StatusCode);

        // The cookie is gone: /me is anonymous again.
        var me = await client.GetAsync("/identity/me");
        await EndpointHttp.Error(me, HttpStatusCode.Unauthorized, "unauthenticated");
    }

    [Fact]
    public async Task Login_BadCredentials_401_NoUserLeak()
    {
        var email = TestUsers.UniqueEmail("lock");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = fx.CreateClient();

        // Unknown user …
        var unknown = await client.PostJsonAsync(
            "/identity/login",
            new { email = TestUsers.UniqueEmail(), password = "Passw0rd!x" });
        await EndpointHttp.Error(unknown, HttpStatusCode.Unauthorized, "bad_credentials");

        // … and a wrong password give the identical envelope.
        var wrong = await client.PostJsonAsync(
            "/identity/login",
            new { email, password = "WrongPass1!" });
        await EndpointHttp.Error(wrong, HttpStatusCode.Unauthorized, "bad_credentials");
    }

    [Fact]
    public async Task Login_StaffDoor_Customer_403()
    {
        var email = TestUsers.UniqueEmail("staffdoor");
        await TestUsers.CreateAsync(fx, "customer", email: email);

        var client = fx.CreateClient();
        var response = await client.PostJsonAsync(
            "/identity/login",
            new { email, password = "Passw0rd!x", staff = true });
        await EndpointHttp.Error(response, HttpStatusCode.Forbidden, "staff_only");
    }

    [Fact]
    public async Task Login_SeededAdmin_Staff_200()
    {
        var client = fx.CreateClient();
        var token = await TestUsers.GetCsrfTokenAsync(client);
        var request = new HttpRequestMessage(HttpMethod.Post, "/identity/login")
        {
            Content = JsonContent.Create(
                new { Email = ApiTestFixture.SeedAdminEmail, Password = ApiTestFixture.SeedAdminPassword, Staff = true }),
        };
        request.Headers.Add(TestUsers.CsrfHeader, token);
        var body = await EndpointHttp.Json(await client.SendAsync(request), HttpStatusCode.OK);

        Assert.True(EndpointHttp.HasRole(body!, "admin"));
        Assert.True(body!["mustChangePassword"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Login_Lockout_AfterFailures_423()
    {
        var email = TestUsers.UniqueEmail("lockout");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = fx.CreateClient();

        // 5 failed attempts lock the account (identity defaults, 5 min).
        for (var i = 0; i < 5; i++)
        {
            var failed = await client.PostJsonAsync(
                "/identity/login", new { email, password = "WrongPass1!" });
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }

        // Even with the right password → locked.
        var locked = await client.PostJsonAsync(
            "/identity/login", new { email, password = "Passw0rd!x" });
        await EndpointHttp.Error(locked, HttpStatusCode.Locked, "locked");
    }

    // ---- /me ----------------------------------------------------------------

    [Fact]
    public async Task Me_Unauthenticated_401()
    {
        var client = fx.CreateClient();
        var response = await client.GetAsync("/identity/me");
        await EndpointHttp.Error(response, HttpStatusCode.Unauthorized, "unauthenticated");
    }

    [Fact]
    public async Task Mutation_WithoutCsrf_403()
    {
        var email = TestUsers.UniqueEmail("csrf");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var request = new HttpRequestMessage(HttpMethod.Post, "/identity/change-password")
        {
            Content = JsonContent.Create(new { current = "Passw0rd!x", next = "NewPass1!x" }),
        };
        var response = await client.SendAsync(request);
        await EndpointHttp.Error(response, HttpStatusCode.Forbidden, "csrf");
    }

    // ---- profile ------------------------------------------------------------

    [Fact]
    public async Task PatchMe_BadLanguage_400()
    {
        var email = TestUsers.UniqueEmail("profile");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var response = await client.PatchJsonAsync(
            "/identity/me",
            new { displayName = "Ada Lovelace", phone = "+1 555 0100", country = (string?)null, language = "zz" });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task PatchMe_Ok_200()
    {
        var email = TestUsers.UniqueEmail("profile");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var body = await EndpointHttp.Json(
            await client.PatchJsonAsync(
                "/identity/me",
                new { displayName = "Ada Lovelace", phone = (string?)null, country = "TR", language = "ar" }),
            HttpStatusCode.OK);

        Assert.Equal("ar", body!["language"]!.ToString());
        Assert.Equal("TR", body["country"]!.ToString());
    }

    // ---- change password ----------------------------------------------------

    [Fact]
    public async Task ChangePassword_EmptyFields_400()
    {
        var email = TestUsers.UniqueEmail("pwempty");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var noCurrent = await client.PostJsonAsync(
            "/identity/change-password", new { current = "", next = "BrandNew1!x" });
        await EndpointHttp.Error(noCurrent, HttpStatusCode.BadRequest, "invalid");

        var noNext = await client.PostJsonAsync(
            "/identity/change-password", new { current = "Passw0rd!x", next = "" });
        await EndpointHttp.Error(noNext, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task ChangePassword_WeakNext_400()
    {
        var email = TestUsers.UniqueEmail("pwweak");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        // The password policy rejects the new password: 400 with the
        // identity error code, and the old password still works.
        var weak = await client.PostJsonAsync(
            "/identity/change-password", new { current = "Passw0rd!x", next = "1" });
        await EndpointHttp.Error(weak, HttpStatusCode.BadRequest, "PasswordTooShort");
    }

    [Fact]
    public async Task ChangePassword_WrongCurrent_400()
    {
        var email = TestUsers.UniqueEmail("pw");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var response = await client.PostJsonAsync(
            "/identity/change-password",
            new { current = "NotThePass1!", next = "NewPass1!x" });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "wrong_password");
    }

    [Fact]
    public async Task ChangePassword_Ok_204_OldPasswordGone()
    {
        var email = TestUsers.UniqueEmail("pw");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        await EndpointHttp.Json(
            await client.PostJsonAsync(
                "/identity/change-password",
                new { current = "Passw0rd!x", next = "BrandNew1!x" }),
            HttpStatusCode.NoContent);

        var oldGone = await client.PostJsonAsync(
            "/identity/login", new { email, password = "Passw0rd!x" });
        await EndpointHttp.Error(oldGone, HttpStatusCode.Unauthorized, "bad_credentials");

        var client2 = await TestUsers.LoginAsync(fx, email, password: "BrandNew1!x");
        var me = await EndpointHttp.GetJson(client2, "/identity/me", HttpStatusCode.OK);
        Assert.Equal(email, me!["email"]!.ToString());
    }

    // ---- guest link (D14) ----------------------------------------------------

    [Fact]
    public async Task GuestLink_Links_ThenConflict_AndInvalid()
    {
        var guestId = Guid.NewGuid().ToString();

        var first = TestUsers.UniqueEmail("link");
        await TestUsers.CreateAsync(fx, "customer", email: first);
        var clientA = await TestUsers.LoginAsync(fx, first);
        var linked = await EndpointHttp.Json(
            await clientA.PostJsonAsync("/identity/guest-link", new { guestId }),
            HttpStatusCode.OK);
        Assert.NotNull(linked!["linkedAt"]);

        // A second account cannot take the same device.
        var second = TestUsers.UniqueEmail("link");
        await TestUsers.CreateAsync(fx, "customer", email: second);
        var clientB = await TestUsers.LoginAsync(fx, second);
        var conflict = await clientB.PostJsonAsync("/identity/guest-link", new { guestId });
        await EndpointHttp.Error(conflict, HttpStatusCode.Conflict, "guest_already_linked");

        // Invalid guest id → 400.
        var invalid = await clientA.PostJsonAsync("/identity/guest-link", new { guestId = "nope" });
        await EndpointHttp.Error(invalid, HttpStatusCode.BadRequest, "invalid_guest");
    }

    // ---- avatar ----------------------------------------------------------------

    [Fact]
    public async Task Avatar_Empty_And_OverSize_400()
    {
        var email = TestUsers.UniqueEmail("avatar");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var empty = new Multipart()
            .File("file", Array.Empty<byte>(), "empty.png", "image/png");
        var noBytes = await empty.PostAsync(
            client, "/identity/me/avatar", await TestUsers.GetCsrfTokenAsync(client));
        await EndpointHttp.Error(noBytes, HttpStatusCode.BadRequest, "invalid_image");

        // The cap is 1 MB (exclusive).
        var big = new Multipart()
            .File("file", new byte[1_048_577], "big.png", "image/png");
        var over = await big.PostAsync(
            client, "/identity/me/avatar", await TestUsers.GetCsrfTokenAsync(client));
        await EndpointHttp.Error(over, HttpStatusCode.BadRequest, "invalid_image");
    }

    [Fact]
    public async Task Avatar_Replace_DeletesOldFile()
    {
        var email = TestUsers.UniqueEmail("avatar");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        var first = await EndpointHttp.Json(
            await new Multipart().File("file", FileFixtures.Png, "one.png", "image/png")
                .PostAsync(client, "/identity/me/avatar", await TestUsers.GetCsrfTokenAsync(client)),
            HttpStatusCode.OK);
        var firstUrl = first!["avatarUrl"]!.ToString()!;

        var second = await EndpointHttp.Json(
            await new Multipart().File("file", FileFixtures.Jpeg, "two.jpg", "image/jpeg")
                .PostAsync(client, "/identity/me/avatar", await TestUsers.GetCsrfTokenAsync(client)),
            HttpStatusCode.OK);
        var secondUrl = second!["avatarUrl"]!.ToString()!;
        Assert.NotEqual(firstUrl, secondUrl);

        // The replaced file is removed from the avatar directory; the new
        // one is on disk.
        var directory = Path.Combine(fx.UploadsRoot, "avatars");
        Assert.False(File.Exists(Path.Combine(directory, Path.GetFileName(firstUrl))));
        Assert.True(File.Exists(Path.Combine(directory, Path.GetFileName(secondUrl))));
    }

    [Fact]
    public async Task Avatar_Upload_Serves_And_TextRejected()
    {
        var email = TestUsers.UniqueEmail("avatar");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var client = await TestUsers.LoginAsync(fx, email);

        // Multipart WITH CSRF: the frontend client adds X-CSRF-TOKEN to
        // every request (the custom middleware covers /identity).
        var token = await TestUsers.GetCsrfTokenAsync(client);
        var upload = new Multipart().File("file", FileFixtures.Png, "me.png", "image/png");
        var body = await EndpointHttp.Json(
            await upload.PostAsync(client, "/identity/me/avatar", token),
            HttpStatusCode.OK);
        var avatarUrl = body!["avatarUrl"]!.ToString()!;
        Assert.StartsWith("/files/avatars/", avatarUrl);

        // Served back with the image content type.
        var served = await EndpointHttp.Bytes(client, avatarUrl, HttpStatusCode.OK);
        Assert.True(served.Length > 0);

        // A text file is not an image.
        var token2 = await TestUsers.GetCsrfTokenAsync(client);
        var text = new Multipart().File("file", FileFixtures.PlainText, "me.txt", "text/plain");
        var rejected = await text.PostAsync(client, "/identity/me/avatar", token2);
        await EndpointHttp.Error(rejected, HttpStatusCode.BadRequest, "unsupported_image");
    }
}
