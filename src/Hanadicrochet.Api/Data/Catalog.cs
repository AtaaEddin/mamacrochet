namespace Hanadicrochet.Api.Data;

/// <summary>
/// Catalog ids: 32-hex strings — URL-safe in /works/{id} links, compact in
/// indexes, and consistent with the opaque uploaded-file names.
/// </summary>
public static class Ids
{
    public static string New() => Guid.NewGuid().ToString("N");
}

/// <summary>
/// A catalog category (plan 04). Names are localized rows; ordering and
/// visibility are plain columns. Soft delete only (admin).
/// </summary>
public class Category
{
    public string Id { get; set; } = Ids.New();

    /// <summary>0..N display order in chips/lists; ties keep creation order.</summary>
    public int SortOrder { get; set; }

    public bool IsListed { get; set; } = true;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public DateTime? DeletedAt { get; set; }

    public ICollection<CategoryTranslation> Translations { get; set; } = [];
}

/// <summary>One localized category name. Composite key (CategoryId, Language).</summary>
public class CategoryTranslation
{
    public string CategoryId { get; set; } = "";
    public string Language { get; set; } = "";
    public string Name { get; set; } = "";

    public Category? Category { get; set; }
}

/// <summary>
/// A catalog product (plan 04). Price = amount + currency code (D11, display
/// USD only). StockUnits 0 = made to order (never decrements below 0).
/// Soft delete only; hidden (IsListed=false) ≠ deleted.
/// </summary>
public class Product
{
    public string Id { get; set; } = Ids.New();

    public string? CategoryId { get; set; }

    public Category? Category { get; set; }

    public decimal Price { get; set; }

    /// <summary>ISO 4217 code, stored with the amount (D11); display USD only.</summary>
    public string Currency { get; set; } = "USD";

    public int StockUnits { get; set; }

    public bool IsListed { get; set; } = true;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string? CreatedById { get; set; }

    public string? UpdatedById { get; set; }

    public ICollection<ProductTranslation> Translations { get; set; } = [];

    public ICollection<ProductImage> Images { get; set; } = [];
}

/// <summary>
/// One localized product title+description. en is required, ar/tr optional
/// (UI falls back to en). Composite key (ProductId, Language).
/// </summary>
public class ProductTranslation
{
    public string ProductId { get; set; } = "";
    public string Language { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Description { get; set; }

    public Product? Product { get; set; }
}

/// <summary>
/// A processed product image (plan 04). Files on disk:
/// {root}/products/{ProductId}/{Id}.webp and {Id}.thumb.webp (WebP,
/// max side 1600 / 480 px — see ProductImages). The stored order IS the
/// display order; the first image is the cover.
/// </summary>
public class ProductImage
{
    public string Id { get; set; } = Ids.New();
    public string ProductId { get; set; } = "";
    public int SortOrder { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public long Bytes { get; set; }
    public DateTime CreatedAt { get; set; }

    public Product? Product { get; set; }
}
