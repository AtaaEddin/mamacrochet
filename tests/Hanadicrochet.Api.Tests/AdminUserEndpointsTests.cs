using System.Net;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Hanadicrochet.Api.Tests;

[Collection("Api")]
public class AdminUserEndpointsTests(ApiTestFixture fx)
{
    private async Task<(HttpClient Admin, AppUser AdminUser)> NewAdminAsync()
    {
        var admin = await TestUsers.CreateAsync(fx, "admin");
        var client = await TestUsers.LoginAsync(fx, admin.Email!, password: "Passw0rd!x");
        return (client, admin);
    }

    private static object CreateUserBody(string email, string name, params string[] roles) => new
    {
        email,
        displayName = name,
        phone = (string?)null,
        country = (string?)null,
        language = "en",
        roles,
    };

    [Fact]
    public async Task Create_Employee_TempPassword_Logins()
    {
        var (admin, _) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("hired");

        var created = await EndpointHttp.Json(
            await admin.PostJsonAsync(
                "/admin/users", CreateUserBody(email, TestUsers.UniqueName("Hired"), "employee")),
            HttpStatusCode.OK);

        Assert.Equal(email, created!["user"]!["email"]!.ToString());
        var temp = created["temporaryPassword"]!.ToString()!;
        Assert.False(string.IsNullOrEmpty(temp));

        // The temporary password works and flags must-change.
        var client = await TestUsers.LoginAsync(fx, email, password: temp);
        var me = await EndpointHttp.GetJson(client, "/identity/me", HttpStatusCode.OK);
        Assert.True(EndpointHttp.HasRole(me!, "employee"));
        Assert.True(me!["mustChangePassword"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Create_DuplicateEmail_409_And_BadRole_Ignored()
    {
        var (admin, _) = await NewAdminAsync();
        var existing = await TestUsers.CreateAsync(fx, "customer");

        var dup = await admin.PostJsonAsync(
            "/admin/users", CreateUserBody(existing.Email!, TestUsers.UniqueName(), "customer"));
        await EndpointHttp.Error(dup, HttpStatusCode.Conflict, "email_taken");

        // Unknown role names are ignored (roles are flags): the account is
        // created with no staff/admin flags, i.e. plain customer.
        var email = TestUsers.UniqueEmail();
        var badRole = await EndpointHttp.Json(
            await admin.PostJsonAsync(
                "/admin/users",
                new
                {
                    email,
                    displayName = "Bad Role",
                    phone = (string?)null,
                    country = (string?)null,
                    language = "en",
                    roles = new[] { "superuser" },
                }),
            HttpStatusCode.OK);
        var roles = badRole!["user"]!["roles"]!;
        Assert.Single(roles.AsArray());
        Assert.Equal("customer", roles[0]!.ToString());
    }

    [Fact]
    public async Task Roles_OnAdminUsers()
    {
        var anon = fx.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/admin/users")).StatusCode);

        var staffEmail = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: staffEmail);
        var staff = await TestUsers.LoginAsync(fx, staffEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/admin/users")).StatusCode);
    }

    [Fact]
    public async Task Patch_RoleToggle_EmployeeToCustomer()
    {
        var (admin, _) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("toggle");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var scope = fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FirstAsync(u => u.Email == email);

        var staff = await TestUsers.LoginAsync(fx, email);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/staff/products")).StatusCode);

        var patched = await EndpointHttp.Json(
            await admin.PatchJsonAsync($"/admin/users/{user.Id}", new
            {
                displayName = user.DisplayName,
                phone = user.Phone,
                country = user.Country,
                language = "en",
                roles = new[] { "customer" },
                assignedEmployeeId = (string?)null,
                isActive = true,
            }),
            HttpStatusCode.OK);
        Assert.True(EndpointHttp.HasRole(patched!, "customer"));
        Assert.False(EndpointHttp.HasRole(patched!, "employee"));

        // The demoted user loses staff access.
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/staff/products")).StatusCode);
    }

    [Fact]
    public async Task PasswordReset_NewTempLogin()
    {
        var (admin, _) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("reset");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var scope = fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FirstAsync(u => u.Email == email);

        var reset = await EndpointHttp.Json(
            await admin.PostJsonAsync($"/admin/users/{user.Id}/password-reset", new { }),
            HttpStatusCode.OK);
        var temp = reset!["temporaryPassword"]!.ToString()!;

        var oldGone = await fx.CreateClient().PostJsonAsync(
            "/identity/login", new { email, password = "Passw0rd!x" });
        await EndpointHttp.Error(oldGone, HttpStatusCode.Unauthorized, "bad_credentials");

        var client = await TestUsers.LoginAsync(fx, email, password: temp);
        var me = await EndpointHttp.GetJson(client, "/identity/me", HttpStatusCode.OK);
        Assert.Equal(email, me!["email"]!.ToString());
    }

    [Fact]
    public async Task Deactivate_BlocksLogin()
    {
        var (admin, _) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("deact");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var scope = fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FirstAsync(u => u.Email == email);

        var deactivated = await admin.PatchJsonAsync($"/admin/users/{user.Id}", new
        {
            displayName = user.DisplayName,
            phone = user.Phone,
            country = user.Country,
            language = "en",
            roles = new[] { "customer" },
            assignedEmployeeId = (string?)null,
            isActive = false,
        });
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);

        var client = fx.CreateClient();
        var login = await client.PostJsonAsync(
            "/identity/login", new { email, password = "Passw0rd!x" });
        await EndpointHttp.Error(login, HttpStatusCode.Forbidden, "deactivated");
    }

    [Fact]
    public async Task Delete_SoftLoginGone_And_SelfDelete_403()
    {
        var (admin, adminUser) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("gone");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var scope = fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FirstAsync(u => u.Email == email);

        // Self-delete is forbidden.
        var self = await admin.DeleteWithCsrfAsync($"/admin/users/{adminUser.Id}");
        await EndpointHttp.Error(self, HttpStatusCode.Forbidden, "self_modification");

        var ok = await admin.DeleteWithCsrfAsync($"/admin/users/{user.Id}");
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var client = fx.CreateClient();
        var login = await client.PostJsonAsync(
            "/identity/login", new { email, password = "Passw0rd!x" });
        await EndpointHttp.Error(login, HttpStatusCode.Unauthorized, "bad_credentials");

        // Hidden from the admin list.
        var list = await EndpointHttp.GetJson(admin, "/admin/users?search=gone", HttpStatusCode.OK);
        Assert.Empty(list!["items"]!.AsArray());
    }

    [Fact]
    public async Task List_Search_ByDisplayName()
    {
        var (admin, _) = await NewAdminAsync();
        var email = TestUsers.UniqueEmail("findme");
        var name = $"Findable {Guid.NewGuid():N}";
        await TestUsers.CreateAsync(fx, "customer", email: email, displayName: name);

        var list = await EndpointHttp.GetJson(admin, $"/admin/users?search={Uri.EscapeDataString(name)}", HttpStatusCode.OK);
        Assert.Single(list!["items"]!.AsArray());
        Assert.Equal(email, list["items"]![0]!["email"]!.ToString());
    }
}
