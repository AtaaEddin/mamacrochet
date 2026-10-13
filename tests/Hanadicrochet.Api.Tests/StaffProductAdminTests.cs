using System.Net;
using System.Text.Json.Nodes;
using Hanadicrochet.Api.Services;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Batch 04D: staff product + category administration error paths, the
/// category update/delete routes, and the image-pipeline guard rails
/// (rollback, caps, bad files).
/// </summary>
[Collection("Api")]
public class StaffProductAdminTests(ApiTestFixture fx)
{
    // ---- categories ---------------------------------------------------------

    [Fact]
    public async Task Staff_Categories_List_200()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var body = await EndpointHttp.GetJson(staff, "/staff/categories", HttpStatusCode.OK);
        Assert.True(body!.AsArray().Count >= 4, "seeded starter categories missing");
    }

    [Fact]
    public async Task Staff_Category_Update_Renames_And_Filters()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[] { new { language = "en", name = "Batch D Cat" } },
                sortOrder = 11,
                isListed = true,
            }),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        var updated = await EndpointHttp.Json(
            await staff.PatchJsonAsync($"/staff/categories/{id}", new
            {
                names = new[] { new { language = "en", name = "Renamed Cat" } },
                sortOrder = 42,
                isListed = false,
            }),
            HttpStatusCode.OK);
        Assert.Equal(42, updated!["sortOrder"]!.GetValue<int>());
        Assert.False(updated["isListed"]!.GetValue<bool>());
        var names = updated["names"]!.AsArray().Select(n => n!["language"]!.ToString()).ToList();
        Assert.Equal(new[] { "en" }, names);

        var list = await EndpointHttp.GetJson(staff, "/staff/categories", HttpStatusCode.OK);
        Assert.Contains(
            list!.AsArray(),
            n => n!["id"]!.ToString() == id && !n["isListed"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Staff_Category_Update_Unknown_404()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var response = await staff.PatchJsonAsync($"/staff/categories/{new string('c', 32)}", new
        {
            names = new[] { new { language = "en", name = "Nobody" } },
            sortOrder = 1,
            isListed = true,
        });
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    [Fact]
    public async Task Staff_Category_Update_NoNames_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[] { new { language = "en", name = "To Be Updated" } },
                sortOrder = 12,
                isListed = true,
            }),
            HttpStatusCode.OK);

        var response = await staff.PatchJsonAsync($"/staff/categories/{created!["id"]!.ToString()!}", new
        {
            names = new object[0],
            sortOrder = 1,
            isListed = true,
        });
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Staff_Category_Create_Validation_Failures()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        object Body(IReadOnlyList<object> names) => new
        {
            names,
            sortOrder = 1,
            isListed = true,
        };

        var cases = new[]
        {
            Body(new object[0]),
            Body(new object[] { new { language = "tr", name = "Sadece" } }),
            Body(new object[]
            {
                new { language = "en", name = "A" },
                new { language = "en", name = "B" },
            }),
            Body(new object[] { new { language = "xx", name = "X" } }),
            Body(new object[] { new { language = "en", name = new string('n', 81) } }),
            Body(new object[]
            {
                new { language = "en", name = "" },
                new { language = "ar", name = "A" },
            }),
        };

        foreach (var body in cases)
        {
            var response = await staff.PostJsonAsync("/staff/categories", body);
            await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
        }
    }

    [Fact]
    public async Task Staff_Category_Create_OptionalNamelessTranslation_Dropped()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[]
                {
                    new { language = "en", name = "Full Name" },
                    new { language = "ar", name = "" },
                },
                sortOrder = 7,
                isListed = true,
            }),
            HttpStatusCode.OK);
        Assert.Single(created!["names"]!.AsArray());
        Assert.Equal("en", created["names"]![0]!["language"]!.ToString());
    }

    [Fact]
    public async Task Staff_Category_Delete_Unknown_404()
    {
        var email = TestUsers.UniqueEmail("admin");
        await TestUsers.CreateAsync(fx, "admin", email: email);
        var admin = await TestUsers.LoginAsync(fx, email);

        var response = await admin.DeleteWithCsrfAsync($"/staff/categories/{new string('d', 32)}");
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    // ---- product creation -------------------------------------------------------

    private static object ProductBody(string title, decimal price = 10m, string? currency = "USD", int stock = 1, string? categoryId = null) => new
    {
        localizations = new[] { new { language = "en", title, description = (string?)null } },
        categoryId,
        price,
        currency,
        stockUnits = stock,
    };

    [Fact]
    public async Task Staff_Product_Create_Content_Validation_Failures()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        object Body(IReadOnlyList<object> localizations) => new
        {
            localizations,
            categoryId = (string?)null,
            price = 10m,
            currency = "USD",
            stockUnits = 1,
        };

        var cases = new[]
        {
            Body(new object[0]),
            Body(new object[] { new { language = "ar", title = "قصة", description = (string?)null } }),
            Body(new object[]
            {
                new { language = "en", title = "", description = (string?)null },
                new { language = "ar", title = "Ar T", description = (string?)null },
            }),
            Body(new object[] { new { language = "en", title = new string('t', 121), description = (string?)null } }),
            Body(new object[] { new { language = "en", title = "Ok", description = new string('d', 2001) } }),
            Body(new object[]
            {
                new { language = "en", title = "A" },
                new { language = "en", title = "B" },
            }),
            Body(new object[] { new { language = "xx", title = "X" } }),
        };

        foreach (var body in cases)
        {
            var response = await staff.PostJsonAsync("/staff/products", body);
            await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
        }
    }

    [Fact]
    public async Task Staff_Product_Create_Price_Stock_Currency_Guards()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        foreach (var (price, stock) in new[] { (-1m, 1), (1000001m, 1), (10m, -1), (10m, 100001) })
        {
            var response = await staff.PostJsonAsync("/staff/products",
                ProductBody("Guard Bag", price: price, stock: stock));
            await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
        }

        // Boundary price is allowed; a bad currency code falls back to USD.
        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products",
                ProductBody("Ccy Bag", price: 1000000m, currency: "EURO")),
            HttpStatusCode.OK);
        Assert.Equal(1000000m, created!["price"]!.GetValue<decimal>());
        Assert.Equal("USD", created["currency"]!.ToString());
    }

    [Fact]
    public async Task Staff_Product_Create_WithCategory_Linked()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var cat = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[] { new { language = "en", name = "With Cat" } },
                sortOrder = 3,
                isListed = true,
            }),
            HttpStatusCode.OK);
        var catId = cat!["id"]!.ToString()!;

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products",
                ProductBody("In Cat", categoryId: catId)),
            HttpStatusCode.OK);
        Assert.Equal(catId, created!["category"]?["id"]!.ToString());
    }

    // ---- product update ----------------------------------------------------------

    [Fact]
    public async Task Staff_Product_Create_OptionalNamelessTranslation_Dropped()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", new
            {
                localizations = new[]
                {
                    new { language = "en", title = "Keep Me", description = (string?)null },
                    new { language = "ar", title = "", description = (string?)null },
                },
                categoryId = (string?)null,
                price = 9m,
                currency = "USD",
                stockUnits = 1,
            }),
            HttpStatusCode.OK);
        Assert.Single(created!["localizations"]!.AsArray());
        Assert.Equal("en", created["localizations"]![0]!["language"]!.ToString());
    }

    [Fact]
    public async Task Staff_Product_Update_Unknown_404()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var response = await staff.PatchJsonAsync($"/staff/products/{new string('c', 32)}", new
        {
            localizations = new[] { new { language = "en", title = "Ghost" } },
            categoryId = (string?)null,
            price = 1m,
            currency = "USD",
            stockUnits = 1,
            isListed = true,
        });
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    [Fact]
    public async Task Staff_Product_Update_MovesToCategory()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", ProductBody("No Cat Yet")),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        var cat = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/categories", new
            {
                names = new[] { new { language = "en", name = "Move Cat" } },
                sortOrder = 4,
                isListed = true,
            }),
            HttpStatusCode.OK);

        var updated = await EndpointHttp.Json(
            await staff.PatchJsonAsync($"/staff/products/{id}", new
            {
                localizations = new[] { new { language = "en", title = "No Cat Yet" } },
                categoryId = cat!["id"]!.ToString()!,
                price = 1m,
                currency = "USD",
                stockUnits = 1,
                isListed = true,
            }),
            HttpStatusCode.OK);
        Assert.Equal(cat["id"]!.ToString(), updated!["category"]?["id"]!.ToString());
    }

    [Fact]
    public async Task Staff_Product_Update_Validation_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", ProductBody("Update Me")),
            HttpStatusCode.OK);
        var id = created!["id"]!.ToString()!;

        // Content without an English title.
        var badContent = await staff.PatchJsonAsync($"/staff/products/{id}", new
        {
            localizations = new[] { new { language = "tr", title = "Sadece" } },
            categoryId = (string?)null,
            price = 1m,
            currency = "USD",
            stockUnits = 1,
            isListed = true,
        });
        await EndpointHttp.Error(badContent, HttpStatusCode.BadRequest, "invalid");

        // Unknown category.
        var badCategory = await staff.PatchJsonAsync($"/staff/products/{id}", new
        {
            localizations = new[] { new { language = "en", title = "Update Me" } },
            categoryId = new string('c', 32),
            price = 1m,
            currency = "USD",
            stockUnits = 1,
            isListed = true,
        });
        await EndpointHttp.Error(badCategory, HttpStatusCode.BadRequest, "invalid");

        // Price / stock guards.
        foreach (var (price, stock) in new[] { (-1m, 1), (10m, -1) })
        {
            var response = await staff.PatchJsonAsync($"/staff/products/{id}", new
            {
                localizations = new[] { new { language = "en", title = "Update Me" } },
                categoryId = (string?)null,
                price,
                currency = "USD",
                stockUnits = stock,
                isListed = true,
            });
            await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
        }
    }

    [Fact]
    public async Task Staff_Product_Delete_Unknown_404()
    {
        var email = TestUsers.UniqueEmail("admin");
        await TestUsers.CreateAsync(fx, "admin", email: email);
        var admin = await TestUsers.LoginAsync(fx, email);

        var response = await admin.DeleteWithCsrfAsync($"/staff/products/{new string('c', 32)}");
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    // ---- images -------------------------------------------------------------------

    [Fact]
    public async Task Staff_Images_Add_UnknownProduct_404()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);

        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var multipart = new Multipart().File("files", FileFixtures.Png, "one.png", "image/png");
        var response = await multipart.PostAsync(staff, $"/staff/products/{new string('c', 32)}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }

    private async Task<string> CreateProductAsync(HttpClient staff)
    {
        var created = await EndpointHttp.Json(
            await staff.PostJsonAsync("/staff/products", ProductBody("Images Host")),
            HttpStatusCode.OK);
        return created!["id"]!.ToString()!;
    }

    [Fact]
    public async Task Staff_Images_Add_NoFiles_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        // A parseable form with a non-file field but no files (an empty
        // multipart body would fail form binding before the handler).
        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var multipart = new Multipart().Field("note", "no files");
        var response = await multipart.PostAsync(staff, $"/staff/products/{id}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Staff_Images_Add_TooManyFiles_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        var multipart = new Multipart();
        for (var i = 0; i <= ProductImages.MaxPerRequest; i++)
        {
            multipart.File("files", FileFixtures.Png, $"p{i}.png", "image/png");
        }

        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var response = await multipart.PostAsync(staff, $"/staff/products/{id}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Staff_Images_Add_BadFile_RollsBackGoodFiles()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        var multipart = new Multipart()
            .File("files", FileFixtures.Png, "good.png", "image/png")
            .File("files", System.Text.Encoding.UTF8.GetBytes("definitely not an image"), "bad.txt", "text/plain");
        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var response = await multipart.PostAsync(staff, $"/staff/products/{id}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");

        // The good file was rolled back: no row, no orphan on disk.
        var detail = await EndpointHttp.GetJson(staff, $"/staff/products/{id}", HttpStatusCode.OK);
        Assert.Empty(detail!["images"]!.AsArray());

        var dir = Path.Combine(fx.UploadsRoot, "products", id);
        Assert.Empty(Directory.Exists(dir) ? Directory.GetFiles(dir) : []);
    }

    [Fact]
    public async Task Staff_Images_Add_FileTooLarge_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        var multipart = new Multipart()
            .File("files", new byte[ProductImages.MaxUploadBytes + 1], "big.png", "image/png");
        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var response = await multipart.PostAsync(staff, $"/staff/products/{id}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
    }

    [Fact]
    public async Task Staff_Images_Add_TruncatedImage_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        // A header-valid PNG cut off mid-chunk: the magic-byte gate and the
        // header probe pass, the full decode fails.
        var truncated = FileFixtures.Png[..44];
        var multipart = new Multipart()
            .File("files", truncated, "truncated.png", "image/png");
        var token = await TestUsers.GetCsrfTokenAsync(staff);
        var response = await multipart.PostAsync(staff, $"/staff/products/{id}/images", token);
        await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");

        var detail = await EndpointHttp.GetJson(staff, $"/staff/products/{id}", HttpStatusCode.OK);
        Assert.Empty(detail!["images"]!.AsArray());
    }

    [Fact]
    public async Task Staff_Images_Reorder_InvalidList_400()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        foreach (var name in new[] { "a.png", "b.png" })
        {
            var multipart = new Multipart().File("files", FileFixtures.Png, name, "image/png");
            var token = await TestUsers.GetCsrfTokenAsync(staff);
            await EndpointHttp.Json(
                await multipart.PostAsync(staff, $"/staff/products/{id}/images", token),
                HttpStatusCode.OK);
        }

        // Empty list and a duplicated id both violate "every image exactly once".
        foreach (var body in new object[]
        {
            new { imageIds = new string[0] },
            new { imageIds = new[] { new string('b', 32), new string('b', 32) } },
        })
        {
            var response = await staff.PutJsonAsync($"/staff/products/{id}/images", body);
            await EndpointHttp.Error(response, HttpStatusCode.BadRequest, "invalid");
        }
    }

    [Fact]
    public async Task Staff_Images_Delete_Unknown_404()
    {
        var email = TestUsers.UniqueEmail("staff");
        await TestUsers.CreateAsync(fx, "employee", email: email);
        var staff = await TestUsers.LoginAsync(fx, email);
        var id = await CreateProductAsync(staff);

        var response = await staff.DeleteWithCsrfAsync($"/staff/products/{id}/images/{new string('b', 32)}");
        await EndpointHttp.Error(response, HttpStatusCode.NotFound, "not_found");
    }
}
