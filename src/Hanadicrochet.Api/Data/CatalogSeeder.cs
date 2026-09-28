using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Data;

/// <summary>
/// Idempotent catalog seed (plan 04): the 4 starter categories + the 6 sample
/// pieces the site already shows (same names/prices as frontend SAMPLE_WORKS),
/// stock 0 (made to order), listed, no images — the owner uploads photos from
/// the staff image manager. Fixed IDs make re-runs a no-op.
/// </summary>
public static class CatalogSeeder
{
    public const string FirstProductId = "65499e32517342f08ebad737cecd249f"; // w1

    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        if (await db.Products.AnyAsync(p => p.Id == FirstProductId, ct))
        {
            return;
        }

        var now = DateTime.UtcNow;

        var bags = Category("ce8b38db34f442c78c0b4d8ee1fd7685", 1,
            ("en", "Bags"), ("ar", "حافظات"), ("tr", "Çantalar"), now);
        var amigurumi = Category("b2dd9f6ed90343e284c39415fcfa7f85", 2,
            ("en", "Amigurumi"), ("ar", "دمى"), ("tr", "Amigurumi"), now);
        var homeAndDecor = Category("a7401f8d77aa45cea2198f4812abfb5e", 3,
            ("en", "Home & Decor"), ("ar", "المنزل والديكور"), ("tr", "Ev & Dekorasyon"), now);
        var accessories = Category("834d5fc9ec8647c8bb8437e44b759e11", 4,
            ("en", "Accessories"), ("ar", "إكسسوارات"), ("tr", "Aksesuarlar"), now);

        db.Categories.AddRange(bags, amigurumi, homeAndDecor, accessories);

        // Staggered CreatedAt keeps the seeded order stable under the
        // default "createdAt desc" listing (w1 first, w6 last).
        var w1 = Product("65499e32517342f08ebad737cecd249f", bags.Id, 24m,
            now.AddMinutes(0),
            ("en", "Sunflower tote bag"),
            ("ar", "حقيبة شمّعدان"),
            ("tr", "Ayçiçeği el çantası"));
        var w2 = Product("3e0844d709c240408d33850bc8fed99e", bags.Id, 32m,
            now.AddMinutes(-1),
            ("en", "Owl messenger bag"),
            ("ar", "حقيبة البومة"),
            ("tr", "Baykuş çantası"));
        var w3 = Product("47e6000d954845a4be0a034488406101", amigurumi.Id, 18m,
            now.AddMinutes(-2),
            ("en", "Pumpkin friend"),
            ("ar", "صديق القرع"),
            ("tr", "Balkabağı dostum"));
        var w4 = Product("5c88e98a681d45b1b7d4c15c6ceae97b", accessories.Id, 8m,
            now.AddMinutes(-3),
            ("en", "Strawberry hair clip"),
            ("ar", "مشبك فراولة"),
            ("tr", "Çilekli saç tokası"));
        var w5 = Product("cfb077e2583d49bb95387bcd9507d03b", amigurumi.Id, 22m,
            now.AddMinutes(-4),
            ("en", "Little gold bird"),
            ("ar", "عصفور ذهبي صغير"),
            ("tr", "Küçük altın kuş"));
        var w6 = Product("06b1bd9729ec4a0a9a5f6e5f2b88ba5c", homeAndDecor.Id, 27m,
            now.AddMinutes(-5),
            ("en", "Tulip teacup & saucer"),
            ("ar", "فنجان بظله بزهرة التوليب"),
            ("tr", "Karanfilli fincan & tabak"));

        db.Products.AddRange(w1, w2, w3, w4, w5, w6);
        await db.SaveChangesAsync(ct);
    }

    private static Category Category(
        string id,
        int sortOrder,
        (string lang, string name) en,
        (string lang, string name) ar,
        (string lang, string name) tr,
        DateTime createdAt)
    {
        return new Category
        {
            Id = id,
            SortOrder = sortOrder,
            IsListed = true,
            CreatedAt = createdAt,
            Translations =
            {
                new CategoryTranslation { Language = en.lang, Name = en.name },
                new CategoryTranslation { Language = ar.lang, Name = ar.name },
                new CategoryTranslation { Language = tr.lang, Name = tr.name },
            },
        };
    }

    private static Product Product(
        string id,
        string categoryId,
        decimal price,
        DateTime createdAt,
        (string lang, string title) en,
        (string lang, string title) ar,
        (string lang, string title) tr)
    {
        return new Product
        {
            Id = id,
            CategoryId = categoryId,
            Price = price,
            Currency = "USD",
            StockUnits = 0,
            IsListed = true,
            CreatedAt = createdAt,
            Translations =
            {
                new ProductTranslation { Language = en.lang, Title = en.title },
                new ProductTranslation { Language = ar.lang, Title = ar.title },
                new ProductTranslation { Language = tr.lang, Title = tr.title },
            },
        };
    }
}
