using System.Net;
using System.Text.Json.Nodes;
using Xunit;

namespace Hanadicrochet.Api.Tests;

[Collection("Api")]
public class CatalogEndpointsTests(ApiTestFixture fx)
{
    // ---- public catalog ----------------------------------------------------

    [Fact]
    public async Task Categories_Seeded_AtLeastFour()
    {
        var client = fx.CreateClient();
        var body = await EndpointHttp.GetJson(client, "/catalog/categories", HttpStatusCode.OK);
        Assert.NotNull(body!);
        Assert.True(body!.AsArray().Count >= 4, "seeded starter catalog missing");
    }

    [Fact]
    public async Task Products_Listed_TotalAndPaging()
    {
        var client = fx.CreateClient();
        var body = await EndpointHttp.GetJson(client, "/catalog/products", HttpStatusCode.OK);
        Assert.True(body!["total"]!.GetValue<int>() >= 6, "seeded starter catalog missing");
        Assert.True(body["items"]!.AsArray().Count <= 24, "default page cap is 24");

        // OData-style paging (D19): $top/$skip, total always included.
        var page = await EndpointHttp.GetJson(client, "/catalog/products?$top=2&$skip=2", HttpStatusCode.OK);
        Assert.Equal(2, page!["items"]!.AsArray().Count);
        Assert.True(page["total"]!.GetValue<int>() >= 6);
    }

    [Fact]
    public async Task Product_Detail_200_And_404()
    {
        var client = fx.CreateClient();
        var list = await EndpointHttp.GetJson(client, "/catalog/products?$top=1", HttpStatusCode.OK);
        var id = list!["items"]![0]!["id"]!.ToString()!;

        var body = await EndpointHttp.GetJson(client, $"/catalog/products/{id}", HttpStatusCode.OK);
        Assert.Equal(id, body!["id"]!.ToString());
        Assert.Contains(body!["localizations"]!.AsArray(), n => n!["language"]!.ToString() == "en");

        var missing = await client.GetAsync($"/catalog/products/{Guid.NewGuid():N}");
        await EndpointHttp.Error(missing, HttpStatusCode.NotFound, "not_found");
    }

    // ---- files: product images ----------------------------------------------

    [Fact]
    public async Task ProductFile_Missing_And_BadName_404()
    {
        var client = fx.CreateClient();
        var productId = new string('a', 32);
        // Valid shapes, no file on disk.
        var missing = await client.GetAsync($"/files/products/{productId}/{new string('b', 32)}.webp");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        // Invalid shapes (not a 32-hex image id).
        var bad = await client.GetAsync("/files/products/not-a-hex/zzz.webp");
        Assert.Equal(HttpStatusCode.NotFound, bad.StatusCode);
    }

    // ---- staff: roles --------------------------------------------------------

    [Fact]
    public async Task Staff_Products_Roles()
    {
        var anon = fx.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.GetAsync("/staff/products")).StatusCode);

        var email = TestUsers.UniqueEmail("cust");
        await TestUsers.CreateAsync(fx, "customer", email: email);
        var customer = await TestUsers.LoginAsync(fx, email);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await customer.GetAsync("/staff/products")).StatusCode);

        var staffEmail = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: staffEmail);
        var staff = await TestUsers.LoginAsync(fx, staffEmail);
        Assert.Equal(HttpStatusCode.OK,
            (await staff.GetAsync("/staff/products")).StatusCode);
    }

    // ---- staff: product CRUD --------------------------------------------------

    private static object CreateProductBody(string title, int priceCents = 2500) => new
    {
        localizations = new[]
        {
            new { language = "en", title, description = "A test piece." },
        },
        categoryId = (string?)null,
        price = priceCents / 100m,
        currency = "USD",
        stockUnits = 1,
    };

    [Fact]
    public async Task Staff_Create_Unlist_Lists_And_HidesFromPublic()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var anon = fx.CreateClient();

        // Create (listed by default).
        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", CreateProductBody("Test Tote 1")),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;
        Assert.True(created["isListed"]!.GetValue<bool>());

        // Unlist → hidden from the public catalog, still in the staff list.
        var unlist = await EndpointHttp.Json(
            await staff.PatchJsonAsync($"/staff/products/{id}", new
            {
                localizations = new[] { new { language = "en", title = "Test Tote 1", description = "A test piece." } },
                categoryId = (string?)null,
                price = 25m,
                currency = "USD",
                stockUnits = 1,
                isListed = false,
            }),
            HttpStatusCode.OK);
        Assert.False(unlist!["isListed"]!.GetValue<bool>());

        var publicList = await EndpointHttp.GetJson(anon, "/catalog/products?$top=96", HttpStatusCode.OK);
        Assert.DoesNotContain(publicList!["items"]!.AsArray(), n => n!["id"]!.ToString() == id);

        var staffList = await EndpointHttp.GetJson(staff, "/staff/products?$top=96", HttpStatusCode.OK);
        Assert.Contains(staffList!["items"]!.AsArray(), n => n!["id"]!.ToString() == id);
    }

    [Fact]
    public async Task Staff_Create_UnknownCategory_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var response = await staff.PostJsonAsync("/staff/products", new
        {
            localizations = new[] { new { language = "en", title = "Test Tote 2", description = (string?)null } },
            categoryId = new string('c', 32),
            price = 10m,
            currency = "USD",
            stockUnits = 1,
        });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    // ---- staff: product images -------------------------------------------------

    [Fact]
    public async Task Staff_ImagePipeline_Upload_Serve_Reorder_Delete()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", CreateProductBody("Image Bag")),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        // Upload two images (PNG in → WebP out, main + thumb).
        var firstToken = await TestUsers.GetCsrfTokenAsync(staff);
        var first = new Multipart().File("files", FileFixtures.Png, "one.png", "image/png");
        var firstBody = await EndpointHttp.Json(
            await first.PostAsync(staff, $"/staff/products/{id}/images", firstToken),
            HttpStatusCode.OK);
        var listA = firstBody!.AsArray();
        Assert.Single(listA);
        var urlA = listA[0]!["url"]!.ToString()!;
        Assert.StartsWith($"/files/products/{id}/", urlA);

        var secondToken = await TestUsers.GetCsrfTokenAsync(staff);
        var second = new Multipart().File("files", FileFixtures.Jpeg, "two.jpg", "image/jpeg");
        var secondBody = await EndpointHttp.Json(
            await second.PostAsync(staff, $"/staff/products/{id}/images", secondToken),
            HttpStatusCode.OK);
        var listB = secondBody!.AsArray();
        Assert.Single(listB);
        var urlB = listB[0]!["url"]!.ToString()!;
        var idB = listB[0]!["id"]!.ToString()!;
        var idA = listA[0]!["id"]!.ToString()!;

        // Served back as WebP.
        var webp = await staff.GetAsync(urlA);
        Assert.Equal(HttpStatusCode.OK, webp.StatusCode);
        Assert.Equal("image/webp", webp.Content.Headers.ContentType!.MediaType);
        var webpBytes = await webp.Content.ReadAsByteArrayAsync();
        Assert.True(webpBytes.Length > 0);

        // Reorder (PUT, same route): B before A.
        var reordered = await EndpointHttp.Json(
            await staff.PutJsonAsync($"/staff/products/{id}/images", new { imageIds = new[] { idB, idA } }),
            HttpStatusCode.OK);
        var reorderedList = reordered!.AsArray();
        Assert.Equal(idB, reorderedList[0]!["id"]!.ToString());
        Assert.Equal(idA, reorderedList[1]!["id"]!.ToString());

        // Delete A.
        var del = await staff.DeleteWithCsrfAsync($"/staff/products/{id}/images/{idA}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        // Product detail now has exactly one image.
        var detail = await EndpointHttp.GetJson(staff, $"/staff/products/{id}", HttpStatusCode.OK);
        Assert.Single(detail!["images"]!.AsArray());
        Assert.Equal(urlB, detail["coverImage"]!["url"]!.ToString());
    }

    // ---- staff: categories ------------------------------------------------------

    [Fact]
    public async Task Staff_Category_Create_Delete_AdminOnly()
    {
        var staffEmail = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: staffEmail);
        var staff = await TestUsers.LoginAsync(fx, staffEmail);

        var adminEmail = TestUsers.UniqueEmail("admin");
        await TestUsers.CreateAsync(fx, "admin", email: adminEmail);
        var admin = await TestUsers.LoginAsync(fx, adminEmail);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[] { new { language = "en", name = "Test Cat" } },
                sortOrder = 99,
                isListed = true,
            }),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        // Public list includes it.
        var publicCat = await EndpointHttp.GetJson(fx.CreateClient(), "/catalog/categories", HttpStatusCode.OK);
        Assert.Contains(publicCat!.AsArray(), n => n!["id"]!.ToString() == id);

        // Employee cannot delete (admin only).
        var forbidden = await staff.DeleteWithCsrfAsync($"/staff/categories/{id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        // Admin deletes → gone from the public list.
        var ok = await admin.DeleteWithCsrfAsync($"/staff/categories/{id}");
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        var after = await EndpointHttp.GetJson(fx.CreateClient(), "/catalog/categories", HttpStatusCode.OK);
        Assert.DoesNotContain(after!.AsArray(), n => n!["id"]!.ToString() == id);
    }

    [Fact]
    public async Task Staff_ProductDelete_AdminOnly()
    {
        var staffEmail = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: staffEmail);
        var staff = await TestUsers.LoginAsync(fx, staffEmail);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", CreateProductBody("Del Bag")),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        var forbidden = await staff.DeleteWithCsrfAsync($"/staff/products/{id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var adminEmail = TestUsers.UniqueEmail("admin");
        await TestUsers.CreateAsync(fx, "admin", email: adminEmail);
        var admin = await TestUsers.LoginAsync(fx, adminEmail);
        var ok = await admin.DeleteWithCsrfAsync($"/staff/products/{id}");
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
    }
}
