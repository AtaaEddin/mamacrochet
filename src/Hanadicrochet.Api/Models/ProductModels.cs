using Hanadicrochet.Api.Data;

namespace Hanadicrochet.Api.Models;

/// <summary>One localized name (category lists, chips).</summary>
public sealed record LocalizedName(string Language, string Name);

/// <summary>One localized product title+description (en required, fallback: en).</summary>
public sealed record LocalizedContent(string Language, string Title, string? Description);

public sealed record ProductImageDto(
    string Id,
    string Url,
    string ThumbUrl,
    int SortOrder,
    int Width,
    int Height);

public sealed record CategoryDto(
    string Id,
    IReadOnlyList<LocalizedName> Names,
    int SortOrder,
    bool IsListed)
{
    public static CategoryDto From(Category category)
    {
        return new CategoryDto(
            category.Id,
            category.Translations
                .OrderBy(t => t.Language)
                .Select(t => new LocalizedName(t.Language, t.Name))
                .ToList(),
            category.SortOrder,
            category.IsListed);
    }
}

public sealed record ProductDto(
    string Id,
    CategoryDto? Category,
    IReadOnlyList<LocalizedContent> Localizations,
    IReadOnlyList<ProductImageDto> Images,
    ProductImageDto? CoverImage,
    decimal Price,
    string Currency,
    int StockUnits,
    bool InStock,
    bool IsListed,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    public static ProductDto From(Product product)
    {
        var images = product.Images
            .OrderBy(i => i.SortOrder)
            .Select(ImageDto)
            .ToList();
        return new ProductDto(
            product.Id,
            product.Category is null ? null : CategoryDto.From(product.Category),
            product.Translations
                .OrderBy(t => t.Language)
                .Select(t => new LocalizedContent(t.Language, t.Title, t.Description))
                .ToList(),
            images,
            images.FirstOrDefault(),
            product.Price,
            product.Currency,
            product.StockUnits,
            product.StockUnits > 0,
            product.IsListed,
            product.CreatedAt,
            product.UpdatedAt);
    }

    public static ProductImageDto ImageDto(ProductImage image)
    {
        return new ProductImageDto(
            image.Id,
            $"/files/products/{image.ProductId}/{image.Id}.webp",
            $"/files/products/{image.ProductId}/{image.Id}.thumb.webp",
            image.SortOrder,
            image.Width,
            image.Height);
    }
}

/// <summary>Paged list result (D19: $top/$skip paging, total always included).</summary>
public sealed record ProductPage(
    IReadOnlyList<ProductDto> Items,
    int Total,
    int Page,
    int PageSize);
