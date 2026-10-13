using System.IO;
using System.Net;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Hiring endpoint coverage (plan 08): the public multipart application
/// (honeypot, caps, file uploads), the admin queue, accept (→ employee
/// account + one-time temp password) and decline, and admin-only file access.
/// </summary>
[Collection("Api")]
public class HiringEndpointsTests(ApiTestFixture fx)
{
    private static Multipart Application(
        string? name = null,
        string? email = null,
        string? phone = null,
        string? country = null,
        string? nationality = null,
        string? languages = null,
        string? previousWork = null,
        string? message = null,
        string? company = null,
        byte[]? file = null,
        string? fileName = "cv.pdf")
    {
        var form = new Multipart()
            .Field("name", name ?? TestUsers.UniqueName("Applicant"))
            .Field("email", email ?? TestUsers.UniqueEmail("hire"))
            .Field("phone", phone ?? "+1 30" + Guid.NewGuid().ToString("N")[..8])
            .Field("country", country ?? "Tunisia")
            .Field("nationality", nationality)
            .Field("languages", languages ?? "English, Arabic")
            .Field("previousWork", previousWork ?? "Two years of crochet for a local shop.")
            .Field("message", message ?? "I would love to join!");
        if (company is not null)
        {
            form.Field("company", company);
        }

        if (file is not null)
        {
            form.File("files", file, fileName ?? "cv.pdf", "application/pdf");
        }

        return form;
    }

    private static async Task<string> SubmitAsync(HttpClient client)
    {
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = Application().Content });
        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        return body!["id"]!.ToString()!;
    }

    [Fact]
    public async Task Submit_Application_Appears_In_AdminQueue()
    {
        var client = fx.CreateClient();
        var id = await SubmitAsync(client);

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        var queue = await EndpointHttp.Json(
            await boss.GetAsync("/admin/hiring?status=new"), HttpStatusCode.OK);
        var items = queue!["items"]!.AsArray();
        Assert.Contains(items, i => i!["id"]!.ToString() == id);

        var detail = await EndpointHttp.Json(
            await boss.GetAsync($"/admin/hiring/{id}"), HttpStatusCode.OK);
        Assert.Equal(id, detail!["application"]!["id"]!.ToString());
    }

    [Fact]
    public async Task Submit_Validation_Failures()
    {
        var client = fx.CreateClient();

        async Task<HttpResponseMessage> Post(Multipart form) =>
            await client.SendAsync(
                new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = form.Content });

        // Name too short.
        await EndpointHttp.Error(await Post(Application(name: "A")), HttpStatusCode.BadRequest, "invalid");

        // Phone too short.
        await EndpointHttp.Error(await Post(Application(phone: "12")), HttpStatusCode.BadRequest, "invalid");

        // Country too long (65 chars).
        await EndpointHttp.Error(
            await Post(Application(country: new string('c', 65))),
            HttpStatusCode.BadRequest,
            "invalid");

        // Too many languages (7 distinct).
        await EndpointHttp.Error(
            await Post(Application(languages: "a1, a2, a3, a4, a5, a6, a7")),
            HttpStatusCode.BadRequest,
            "invalid_language");

        // Duplicate languages (case-insensitive) are deduplicated, not rejected.
        var dup = await Post(Application(languages: "English, english"));
        var dupBody = await EndpointHttp.Json(dup, HttpStatusCode.OK);
        Assert.False(string.IsNullOrWhiteSpace(dupBody!["id"]!.ToString()));

        // Message too long (2001 chars).
        await EndpointHttp.Error(
            await Post(Application(message: new string('x', 2001))),
            HttpStatusCode.BadRequest,
            "invalid");
    }

    [Fact]
    public async Task Submit_Honeypot_FakeSuccess_NoRow()
    {
        var client = fx.CreateClient();
        var email = TestUsers.UniqueEmail("honey");
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring")
            {
                Content = Application(email: email, company: "evil.example").Content,
            });
        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        Assert.False(string.IsNullOrWhiteSpace(body!["id"]!.ToString()));

        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.HiringApplications.AnyAsync(a => a.Email == email));
    }

    [Fact]
    public async Task Admin_Accept_CreatesEmployee_TempPassword_Logins()
    {
        var client = fx.CreateClient();
        var id = await SubmitAsync(client);

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        var email = TestUsers.UniqueEmail("hired");
        var accepted = await EndpointHttp.Json(
            await boss.PostJsonAsync(
                $"/admin/hiring/{id}/accept",
                new
                {
                    email,
                    displayName = TestUsers.UniqueName("New Hire"),
                    phone = (string?)null,
                    country = (string?)null,
                    language = "en",
                }),
            HttpStatusCode.OK);
        var temp = accepted!["temporaryPassword"]!.ToString()!;
        Assert.False(string.IsNullOrWhiteSpace(temp));
        Assert.True(EndpointHttp.HasRole(accepted["user"]!, "employee"));

        // The temp password signs in (staff door) with must-change flag.
        var login = await TestUsers.LoginAsync(fx, email, password: temp, staff: true);
        var me = await EndpointHttp.Json(await login.GetAsync("/identity/me"), HttpStatusCode.OK);
        Assert.True(me!["mustChangePassword"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Admin_Accept_DuplicateEmail_409()
    {
        var id = await SubmitAsync(fx.CreateClient());

        var existingEmail = TestUsers.UniqueEmail("exist");
        await TestUsers.CreateAsync(fx, "customer", email: existingEmail);

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);
        var rejected = await boss.PostJsonAsync(
            $"/admin/hiring/{id}/accept",
            new
            {
                email = existingEmail,
                displayName = "Taken",
                phone = (string?)null,
                country = (string?)null,
                language = "en",
            });
        await EndpointHttp.Error(rejected, HttpStatusCode.Conflict, "email_taken");
    }

    [Fact]
    public async Task Admin_Decline_Note_SecondDecline_409()
    {
        var id = await SubmitAsync(fx.CreateClient());

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        var declined = await EndpointHttp.Json(
            await boss.PostJsonAsync(
                $"/admin/hiring/{id}/decline", new { note = "We are fully staffed." }),
            HttpStatusCode.OK);
        Assert.Equal("declined", declined!["status"]!.ToString());

        var again = await boss.PostJsonAsync(
            $"/admin/hiring/{id}/decline", new { note = "again" });
        await EndpointHttp.Error(again, HttpStatusCode.Conflict, "already_decided");
    }

    [Fact]
    public async Task Admin_Declined_Cannot_Be_Accepted()
    {
        var id = await SubmitAsync(fx.CreateClient());

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);
        await boss.PostJsonAsync($"/admin/hiring/{id}/decline", new { note = "no" });

        var rejected = await boss.PostJsonAsync(
            $"/admin/hiring/{id}/accept",
            new
            {
                email = TestUsers.UniqueEmail(),
                displayName = "Too Late",
                phone = (string?)null,
                country = (string?)null,
                language = "en",
            });
        await EndpointHttp.Error(rejected, HttpStatusCode.Conflict, "already_decided");
    }

    [Fact]
    public async Task Files_AdminOnly_Served_BySignedRoute()
    {
        var client = fx.CreateClient();
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring")
            {
                Content = Application(file: FileFixtures.Pdf, fileName: "portfolio.pdf").Content,
            });
        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        var id = body!["id"]!.ToString()!;

        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);

        // The file is listed in the detail with its stored name.
        var detail = await EndpointHttp.Json(
            await boss.GetAsync($"/admin/hiring/{id}"), HttpStatusCode.OK);
        var files = detail!["application"]!["files"]!.AsArray();
        Assert.Single(files);

        // The file URL is admin-served; anonymous gets no access.
        var url = files[0]!["fileName"]!.ToString()!;
        Assert.StartsWith($"/files/hiring/{id}/", url);
        var ok = await EndpointHttp.Bytes(boss, url, HttpStatusCode.OK);
        Assert.NotEmpty(ok);
        var denied = await fx.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
    }

    [Fact]
    public async Task Queue_BadStatusFilter_400()
    {
        var admin = await TestUsers.CreateAsync(fx, "admin");
        var boss = await TestUsers.LoginAsync(fx, admin.Email!);
        var rejected = await boss.GetAsync("/admin/hiring?status=bogus");
        await EndpointHttp.Error(rejected, HttpStatusCode.BadRequest, "invalid");
    }

    // ===== batch 04C: remaining validation + admin error paths =====

    private async Task<string> SubmitRawAsync(HttpClient client, Multipart form)
    {
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = form.Content });
        var body = await EndpointHttp.Json(response, HttpStatusCode.OK);
        return body!["id"]!.ToString()!;
    }

    /// <summary>Six one-letter entries pass the count check but are all filtered out,
    /// so the cleaned language list is empty and rejected.</summary>
    [Fact]
    public async Task Submit_LanguagesAllTooShort_400()
    {
        var client = fx.CreateClient();
        var form = Application(languages: "a, b, c, d, e, f");
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = form.Content });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid_language");
    }

    /// <summary>More than HiringFiles.MaxFiles files is rejected before any disk write.</summary>
    [Fact]
    public async Task Submit_TooManyFiles_400()
    {
        var client = fx.CreateClient();
        var mp = new Multipart()
            .Field("name", "Max Files")
            .Field("email", TestUsers.UniqueEmail("many"))
            .Field("phone", "+31 6 10000006")
            .Field("country", "NL")
            .Field("languages", "English");
        for (var i = 0; i < 4; i++)
        {
            mp.File("files", FileFixtures.Pdf, $"cv-{i}.pdf", "application/pdf");
        }

        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = mp.Content });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "too_many_files");
    }

    /// <summary>A plain-text upload is rejected (unsupported_file_type).</summary>
    [Fact]
    public async Task Submit_UnsupportedFileType_400()
    {
        var client = fx.CreateClient();
        var form = Application(file: FileFixtures.PlainText, fileName: "notes.txt");
        var response = await client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/hiring") { Content = form.Content });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "unsupported_file_type");
    }

    /// <summary>Re-applying with the same e-mail updates the same row (no duplicate),
    /// appends the new file and deletes the previous files from disk.</summary>
    [Fact]
    public async Task Submit_Reapply_UpdatesSameRow_DeletesOldFiles()
    {
        var client = fx.CreateClient();
        var email = TestUsers.UniqueEmail("reapply");
        var id = await SubmitRawAsync(client, Application(email: email, file: FileFixtures.Pdf, fileName: "cv.pdf"));

        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var detail1 = await EndpointHttp.Json(
            await admin.GetAsync($"/admin/hiring/{id}"), HttpStatusCode.OK);
        var oldName = detail1!["application"]!["files"]!.AsArray()[0]!["fileName"]!.ToString()!.Split('/').Last();

        var id2 = await SubmitRawAsync(client, Application(
            email: email, file: FileFixtures.Jpeg, fileName: "portfolio.jpg"));
        Assert.Equal(id, id2);

        var detail2 = await EndpointHttp.Json(
            await admin.GetAsync($"/admin/hiring/{id}"), HttpStatusCode.OK);
        var files = detail2!["application"]!["files"]!.AsArray();
        Assert.Single(files);
        var newName = files[0]!["fileName"]!.ToString()!.Split('/').Last();
        Assert.NotEqual(oldName, newName);

        var dir = Path.Combine(fx.UploadsRoot, "hiring", id);
        Assert.False(File.Exists(Path.Combine(dir, oldName)));
        Assert.True(File.Exists(Path.Combine(dir, newName)));
    }

    /// <summary>A stored name that fails IsValidStoredName (poked in the DB) is skipped
    /// on disk delete but still removed from the metadata.</summary>
    [Fact]
    public async Task Submit_Reapply_InvalidStoredName_SkipsDiskDelete()
    {
        var client = fx.CreateClient();
        var email = TestUsers.UniqueEmail("badname");
        var id = await SubmitRawAsync(client, Application(
            email: email, file: FileFixtures.Pdf, fileName: "cv.pdf"));

        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var fileRow = await db.HiringApplicationFiles.FirstAsync(f => f.ApplicationId == id);
        fileRow.StoredName = "not-a-valid name.exe";
        await db.SaveChangesAsync();

        var id2 = await SubmitRawAsync(client, Application(
            email: email, file: FileFixtures.Pdf, fileName: "cv2.pdf"));
        Assert.Equal(id, id2);

        using var scope2 = fx.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var remaining = await db2.HiringApplicationFiles
            .Where(f => f.ApplicationId == id).CountAsync();
        Assert.Equal(1, remaining);
    }

    /// <summary>Unknown (but well-formed) id on accept: 404 hiring_not_found.</summary>
    [Fact]
    public async Task Admin_Accept_UnknownId_404()
    {
        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var missing = Guid.NewGuid().ToString("N");
        var response = await admin.PostJsonAsync(
            $"/admin/hiring/{missing}/accept",
            new { email = "probe@x.test", displayName = "Probe", language = "en" });
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    /// <summary>Accept with a malformed e-mail: 400 invalid.</summary>
    [Fact]
    public async Task Admin_Accept_InvalidEmail_400()
    {
        var client = fx.CreateClient();
        var id = await SubmitAsync(client);

        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var response = await admin.PostJsonAsync(
            $"/admin/hiring/{id}/accept",
            new { email = "not-an-email", displayName = "Probe", language = "en" });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    /// <summary>Unknown (but well-formed) id on decline: 404 hiring_not_found.</summary>
    [Fact]
    public async Task Admin_Decline_UnknownId_404()
    {
        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var missing = Guid.NewGuid().ToString("N");
        var response = await admin.PostJsonAsync($"/admin/hiring/{missing}/decline", new { note = (string?)null });
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    /// <summary>A decline note over 1000 chars is rejected.</summary>
    [Fact]
    public async Task Admin_Decline_LongNote_400()
    {
        var client = fx.CreateClient();
        var id = await SubmitAsync(client);

        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var note = new string('x', 1001);
        var response = await admin.PostJsonAsync($"/admin/hiring/{id}/decline", new { note });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    /// <summary>Non-hex ids (both endpoints): clean 404, no 500.</summary>
    [Fact]
    public async Task Admin_Decide_BadIdFormat_404()
    {
        var adminUser = await TestUsers.CreateAsync(fx, "admin");
        var admin = await TestUsers.LoginAsync(fx, adminUser.Email!);
        var accept = await admin.PostJsonAsync(
            "/admin/hiring/abc/accept",
            new { email = "probe@x.test", displayName = "Probe", language = "en" });
        await EndpointHttp.Error(accept, HttpStatusCode.NotFound, "not_found");

        var decline = await admin.PostJsonAsync("/admin/hiring/abc/decline", new { note = (string?)null });
        await EndpointHttp.Error(decline, HttpStatusCode.NotFound, "not_found");
    }
}
