using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Staff customer search endpoint (plan 20261005-1348/03): the picker
/// behind "New conversation". Also drives ChatService.SearchCustomersAsync
/// (LIKE escaping, paging clamps, staff exclusion).
/// </summary>
public class StaffCustomerEndpointsTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public StaffCustomerEndpointsTests(ApiTestFixture fx) => _fx = fx;

    private async Task<(HttpClient Client, JsonNode Page)> GetAsync(
        HttpClient client, string url)
    {
        using var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (client, (await response.Content.ReadFromJsonAsync<JsonNode>())!);
    }

    [Fact]
    public async Task Employee_SeesCustomers_NotStaff()
    {
        var anna = await TestUsers.CreateAsync(
            _fx, role: "customer", displayName: "Anna Picker");
        var ben = await TestUsers.CreateAsync(
            _fx, role: "customer", displayName: "Ben Picker");
        var staffer = await TestUsers.CreateAsync(
            _fx, role: "employee", displayName: "Picky Staffer");

        var employee = await TestUsers.CreateAsync(_fx, role: "employee");
        var client = await TestUsers.LoginAsync(_fx, employee.Email!, staff: true);

        var (_, page) = await GetAsync(client, "/staff/customers");
        var names = page["customers"]!
            .AsArray().Select(n => n!["displayName"]!.ToString()).ToList();

        Assert.Contains(anna.DisplayName!, names);
        Assert.Contains(ben.DisplayName!, names);
        // Staff accounts are never in the picker.
        Assert.DoesNotContain(staffer.DisplayName!, names);
        Assert.True(page["page"]!.GetValue<int>() >= 1);
        Assert.True(page["pages"]!.GetValue<int>() >= 1);
    }

    [Fact]
    public async Task Search_ByDisplayName_Phone_Email_AndEscapes()
    {
        var needle = Guid.NewGuid().ToString("N")[..8];
        var named = await TestUsers.CreateAsync(
            _fx, role: "customer",
            displayName: $"Zed{needle} Customer",
            phone: $"+9 777 {needle}");
        var underscored = await TestUsers.CreateAsync(
            _fx, role: "customer",
            displayName: $"Ann_{needle}_B");

        var employee = await TestUsers.CreateAsync(_fx, role: "employee");
        var client = await TestUsers.LoginAsync(_fx, employee.Email!, staff: true);

        // Display name hit.
        var (_, byName) = await GetAsync(client, $"/staff/customers?search={needle}");
        var nameHits = byName["customers"]!.AsArray()
            .Where(c => c!["displayName"]!.ToString().Contains(needle)).ToList();
        Assert.Contains(nameHits, c => c!["displayName"]!.ToString() == named.DisplayName);

        // Phone hit (same term matches the phone column).
        Assert.Contains(nameHits, c =>
            c!["phone"]!.ToString() == $"+9 777 {needle}");

        // E-mail hit: search a fragment of the generated e-mail.
        var emailFrag = named.Email![10..18]; // inside the guid part
        var (_, byEmail) = await GetAsync(client, $"/staff/customers?search={emailFrag}");
        Assert.Contains(byEmail["customers"]!.AsArray(),
            c => c!["email"]!.ToString() == named.Email);

        // LIKE '_' is a single-char wildcard in SQL — it must be escaped:
        // "Ann{needle}B" (no underscore) must NOT match "Ann_{needle}_B".
        var (_, byNoUnderscore) = await GetAsync(
            client, $"/staff/customers?search=Ann{needle}B");
        Assert.DoesNotContain(
            byNoUnderscore["customers"]!.AsArray(),
            c => c!["displayName"]!.ToString() == underscored.DisplayName);

        // …while the literal underscore DOES match.
        var (_, byUnderscore) = await GetAsync(
            client, $"/staff/customers?search=Ann_{needle}_B");
        Assert.Contains(byUnderscore["customers"]!.AsArray(),
            c => c!["displayName"]!.ToString() == underscored.DisplayName);
    }

    [Fact]
    public async Task Paging_SizeOne_FullPages_AndClampedParams()
    {
        var tag = Guid.NewGuid().ToString("N")[..8];
        for (var i = 0; i < 3; i++)
        {
            await TestUsers.CreateAsync(
                _fx, role: "customer", displayName: $"Page{tag} {i}");
        }

        var employee = await TestUsers.CreateAsync(_fx, role: "employee");
        var client = await TestUsers.LoginAsync(_fx, employee.Email!, staff: true);

        var url = $"/staff/customers?search=Page{tag}&pageSize=1";
        var (_, page1) = await GetAsync(client, url);
        Assert.Single(page1["customers"]!.AsArray());
        Assert.Equal(3, page1["pages"]!.GetValue<int>());
        Assert.Equal(1, page1["page"]!.GetValue<int>());

        var (_, page3) = await GetAsync(client, url + "&page=3");
        Assert.Single(page3["customers"]!.AsArray());

        // Clamped: page=0 → 1, pageSize=999 → 50 (both still 200).
        var (_, clampedA) = await GetAsync(
            client, $"/staff/customers?search=Page{tag}&page=0");
        Assert.Equal(1, clampedA["page"]!.GetValue<int>());
        var (_, clampedB) = await GetAsync(
            client, $"/staff/customers?search=Page{tag}&pageSize=999");
        Assert.True(clampedB["customers"]!.AsArray().Count <= 50);
    }

    [Fact]
    public async Task NonStaff_CustomerGets403_AnonymousGets401()
    {
        var customer = await TestUsers.CreateAsync(_fx, role: "customer");
        var client = await TestUsers.LoginAsync(_fx, customer.Email!);
        using var forbidden = await client.GetAsync("/staff/customers");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        var body = await EndpointHttp.Json(forbidden, HttpStatusCode.Forbidden);
        Assert.Equal("forbidden", TestUsers.ApiErrorCode(body));

        var anon = _fx.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anon.GetAsync("/staff/customers")).StatusCode);
    }
}
