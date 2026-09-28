using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Endpoints;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Hanadicrochet.Api.Services;

public sealed record ProductOperation(ApiError? Error, Product? Product);

public sealed record CategoryOperation(ApiError? Error, Category? Category);

public sealed record ProductImagesResult(ApiError? Error, IReadOnlyList<ProductImage>? Images);

/// <summary>
/// Domain rules for the staff catalog (plan 04): product + category CRUD,
/// soft delete (admin), and the image pipeline (upload/resize/thumbnail,
/// reorder, delete). Localized content: en required, ar/tr optional.
/// Returns ApiError results; endpoints map them to typed responses.
/// </summary>
public sealed class ProductAdministrationService(
    AppDbContext db,
    IOptions<UploadsOptions> uploads)
{
    private const int MaxTitleLength = 120;
    private const int MaxDescriptionLength = 2000;
    private const int MaxCategoryNameLength = 80;
    private const int MaxStockUnits = 100_000;
    private const decimal MaxPrice = 1_000_000m;

    // ---- products -------------------------------------------------------

    public async Task<ProductOperation> CreateAsync(CreateProductRequest request, string? actorId, CancellationToken ct = default)
    {
        var (error, content) = NormalizeContent(request.Localizations);
        if (error is not null)
        {
            return new ProductOperation(error, null);
        }

        Category? category = null;
        if (!string.IsNullOrWhiteSpace(request.CategoryId))
        {
            category = await db.Categories
                .AsNoTracking()
                .Include(c => c.Translations)
                .FirstOrDefaultAsync(c => c.Id == request.CategoryId && c.DeletedAt == null, ct);
            if (category is null)
            {
                return new ProductOperation(new ApiError("invalid", "Unknown category."), null);
            }
        }

        var price = ValidatePrice(request.Price, request.Currency);
        if (price.Error is not null)
        {
            return new ProductOperation(price.Error, null);
        }

        if (request.StockUnits is < 0 or > MaxStockUnits)
        {
            return new ProductOperation(new ApiError("invalid", $"Stock units must be 0..{MaxStockUnits}."), null);
        }

        var product = new Product
        {
            CategoryId = category?.Id,
            Price = price.Value,
            Currency = price.Currency,
            StockUnits = request.StockUnits,
            IsListed = true,
            CreatedAt = DateTime.UtcNow,
            CreatedById = actorId,
            UpdatedById = actorId,
        };
        foreach (var l in content!)
        {
            product.Translations.Add(new ProductTranslation
            {
                Language = l.Language,
                Title = l.Title!,
                Description = l.Description,
            });
        }

        db.Products.Add(product);
        await db.SaveChangesAsync(ct);

        // Populate the navigation for the response DTO (the tracked entity
        // only carries CategoryId after insert).
        product.Category = category;
        return new ProductOperation(null, product);
    }

    public async Task<ProductOperation> UpdateAsync(
        string id,
        UpdateProductRequest request,
        string? actorId,
        CancellationToken ct = default)
    {
        var product = await FindProductAsync(id, ct);
        if (product is null)
        {
            return new ProductOperation(ApiError.NotFound("product_not_found"), null);
        }

        var (error, content) = NormalizeContent(request.Localizations);
        if (error is not null)
        {
            return new ProductOperation(error, null);
        }

        string? categoryId = null;
        if (!string.IsNullOrWhiteSpace(request.CategoryId))
        {
            var exists = await db.Categories
                .AsNoTracking()
                .AnyAsync(c => c.Id == request.CategoryId && c.DeletedAt == null, ct);
            if (!exists)
            {
                return new ProductOperation(new ApiError("invalid", "Unknown category."), null);
            }

            categoryId = request.CategoryId;
        }

        var price = ValidatePrice(request.Price, request.Currency);
        if (price.Error is not null)
        {
            return new ProductOperation(price.Error, null);
        }

        if (request.StockUnits is < 0 or > MaxStockUnits)
        {
            return new ProductOperation(new ApiError("invalid", $"Stock units must be 0..{MaxStockUnits}."), null);
        }

        product.CategoryId = categoryId;
        product.Price = price.Value;
        product.Currency = price.Currency;
        product.StockUnits = request.StockUnits;
        product.IsListed = request.IsListed;
        product.UpdatedAt = DateTime.UtcNow;
        product.UpdatedById = actorId;

        // Replace the whole localized set (staff removed a translation → it goes).
        product.Translations.Clear();
        foreach (var l in content!)
        {
            product.Translations.Add(new ProductTranslation
            {
                Language = l.Language,
                Title = l.Title!,
                Description = l.Description,
            });
        }

        await db.SaveChangesAsync(ct);
        return new ProductOperation(null, product);
    }

    public async Task<ProductOperation> SoftDeleteAsync(string id, CancellationToken ct = default)
    {
        var product = await FindProductAsync(id, ct);
        if (product is null)
        {
            return new ProductOperation(ApiError.NotFound("product_not_found"), null);
        }

        product.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return new ProductOperation(null, product);
    }

    // ---- images ---------------------------------------------------------

    public async Task<ProductImagesResult> AddImagesAsync(
        string productId,
        IEnumerable<IFormFile> files,
        CancellationToken ct = default)
    {
        var product = await db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == productId && p.DeletedAt == null, ct);
        if (product is null)
        {
            return new ProductImagesResult(ApiError.NotFound("product_not_found"), null);
        }

        var list = files?.ToList() ?? [];
        if (list.Count == 0)
        {
            return new ProductImagesResult(new ApiError("invalid", "No files uploaded."), null);
        }

        if (list.Count > ProductImages.MaxPerRequest)
        {
            return new ProductImagesResult(
                new ApiError("invalid", $"At most {ProductImages.MaxPerRequest} files per upload."), null);
        }

        var dir = Path.Combine(uploads.Value.Root, "products", productId);
        Directory.CreateDirectory(dir);

        var nextOrder = await db.ProductImages
            .Where(i => i.ProductId == productId)
            .MaxAsync(i => (int?)i.SortOrder, ct) ?? -1;

        var created = new List<ProductImage>();
        foreach (var file in list)
        {
            var processed = await ProcessOneAsync(file, ct);
            if (processed is null)
            {
                // Roll back any files already written in this request.
                foreach (var orphan in created)
                {
                    DeleteImageFiles(dir, orphan.Id);
                }

                return new ProductImagesResult(
                    new ApiError("invalid", $"Unsupported or unreadable image: {file.FileName}"), null);
            }

            var image = new ProductImage
            {
                ProductId = productId,
                SortOrder = ++nextOrder,
                Width = processed.Width,
                Height = processed.Height,
                Bytes = processed.Main.Length,
                CreatedAt = DateTime.UtcNow,
            };

            await File.WriteAllBytesAsync(Path.Combine(dir, ProductImages.Processed.MainName(image.Id)), processed.Main, ct);
            await File.WriteAllBytesAsync(Path.Combine(dir, ProductImages.Processed.ThumbName(image.Id)), processed.Thumb, ct);

            created.Add(image);
        }

        db.ProductImages.AddRange(created);
        await db.SaveChangesAsync(ct);
        return new ProductImagesResult(null, created);
    }

    public async Task<ProductImagesResult> ReorderAsync(
        string productId,
        IReadOnlyList<string> imageIds,
        CancellationToken ct = default)
    {
        var existing = await db.ProductImages
            .Where(i => i.ProductId == productId)
            .ToListAsync(ct);

        var existingIds = existing.Select(e => e.Id).ToHashSet(StringComparer.Ordinal);
        var given = (imageIds ?? []).ToHashSet(StringComparer.Ordinal);
        if (given.Count != (imageIds?.Count ?? 0) || !given.SetEquals(existingIds))
        {
            return new ProductImagesResult(
                new ApiError("invalid", "imageIds must list every image of the product exactly once."), null);
        }

        // The unique (ProductId, SortOrder) index makes a direct swap a topological
        // cycle in one SaveChanges: shift every image off its key first, then apply
        // the target order.
        var count = existing.Count;
        foreach (var (image, index) in existing.OrderBy(e => e.SortOrder).Select((e, i) => (e, i)))
        {
            image.SortOrder = index + count;
        }

        await db.SaveChangesAsync(ct);

        foreach (var (id, index) in (imageIds ?? []).Select((id, i) => (id, i)))
        {
            existing.First(e => e.Id == id).SortOrder = index;
        }

        await db.SaveChangesAsync(ct);
        return new ProductImagesResult(null, existing.OrderBy(e => e.SortOrder).ToList());
    }

    public async Task<ProductImagesResult> DeleteImageAsync(
        string productId,
        string imageId,
        CancellationToken ct = default)
    {
        var image = await db.ProductImages
            .FirstOrDefaultAsync(i => i.Id == imageId && i.ProductId == productId, ct);
        if (image is null)
        {
            return new ProductImagesResult(ApiError.NotFound("image_not_found"), null);
        }

        db.ProductImages.Remove(image);
        await db.SaveChangesAsync(ct);

        DeleteImageFiles(Path.Combine(uploads.Value.Root, "products", productId), image.Id);
        return new ProductImagesResult(null, null);
    }

    // ---- categories -----------------------------------------------------

    public async Task<CategoryOperation> CreateCategoryAsync(CreateCategoryRequest request, CancellationToken ct = default)
    {
        var (error, names) = NormalizeCategoryNames(request.Names);
        if (error is not null)
        {
            return new CategoryOperation(error, null);
        }

        var category = new Category
        {
            SortOrder = request.SortOrder,
            IsListed = request.IsListed,
            CreatedAt = DateTime.UtcNow,
        };
        foreach (var n in names!)
        {
            category.Translations.Add(new CategoryTranslation
            {
                Language = n.Language,
                Name = n.Name,
            });
        }

        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return new CategoryOperation(null, category);
    }

    public async Task<CategoryOperation> UpdateCategoryAsync(
        string id,
        UpdateCategoryRequest request,
        CancellationToken ct = default)
    {
        // Include Translations so the old rows are tracked: Clear()+re-add must
        // delete-then-insert the same composite PK, which EF only orders safely
        // when the removed entities are actually tracked.
        var category = await db.Categories
            .Include(c => c.Translations)
            .FirstOrDefaultAsync(c => c.Id == id && c.DeletedAt == null, ct);
        if (category is null)
        {
            return new CategoryOperation(ApiError.NotFound("category_not_found"), null);
        }

        var (error, names) = NormalizeCategoryNames(request.Names);
        if (error is not null)
        {
            return new CategoryOperation(error, null);
        }

        category.SortOrder = request.SortOrder;
        category.IsListed = request.IsListed;
        category.UpdatedAt = DateTime.UtcNow;

        category.Translations.Clear();
        foreach (var n in names!)
        {
            category.Translations.Add(new CategoryTranslation
            {
                Language = n.Language,
                Name = n.Name,
            });
        }

        await db.SaveChangesAsync(ct);
        return new CategoryOperation(null, category);
    }

    public async Task<CategoryOperation> SoftDeleteCategoryAsync(string id, CancellationToken ct = default)
    {
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.DeletedAt == null, ct);
        if (category is null)
        {
            return new CategoryOperation(ApiError.NotFound("category_not_found"), null);
        }

        category.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return new CategoryOperation(null, category);
    }

    // ---- helpers --------------------------------------------------------

    private async Task<Product?> FindProductAsync(string id, CancellationToken ct)
    {
        return await db.Products
            .Include(p => p.Translations)
            .Include(p => p.Images)
            .Include(p => p.Category)
            .ThenInclude(c => c!.Translations)
            .FirstOrDefaultAsync(p => p.Id == id && p.DeletedAt == null, ct);
    }

    private static async Task<ProductImages.Processed?> ProcessOneAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length > ProductImages.MaxUploadBytes || file.Length <= 0)
        {
            return null;
        }

        try
        {
            using var memory = new MemoryStream();
            await file.CopyToAsync(memory, ct);
            memory.Position = 0;
            return await ProductImages.ProcessAsync(memory, ct);
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static void DeleteImageFiles(string dir, string imageId)
    {
        foreach (var name in new[] { ProductImages.Processed.MainName(imageId), ProductImages.Processed.ThumbName(imageId) })
        {
            try
            {
                File.Delete(Path.Combine(dir, name));
            }
            catch (IOException)
            {
                // Best effort — the row is already gone; an orphan file is harmless.
            }
            catch (UnauthorizedAccessException)
            {
                // Same: never fail the request over a file-system quirk.
            }
        }
    }

    private static (ApiError? Error, IReadOnlyList<LocalizedContentInput>? Content) NormalizeContent(
        IReadOnlyList<LocalizedContentInput>? input)
    {
        if (input is null || input.Count == 0)
        {
            return (new ApiError("invalid", "At least one localized title is required."), null);
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<LocalizedContentInput>();
        foreach (var entry in input)
        {
            var lang = (entry.Language ?? "").Trim();
            if (!Languages.IsValid(lang))
            {
                return (new ApiError("invalid", $"Invalid language '{entry.Language}'."), null);
            }

            if (!seen.Add(lang))
            {
                return (new ApiError("invalid", $"Duplicate language '{lang}'."), null);
            }

            var title = (entry.Title ?? "").Trim();
            var description = string.IsNullOrWhiteSpace(entry.Description) ? null : entry.Description!.Trim();
            if (title.Length > MaxTitleLength)
            {
                return (new ApiError("invalid", $"Title too long (max {MaxTitleLength} characters)."), null);
            }

            if (description is not null && description.Length > MaxDescriptionLength)
            {
                return (new ApiError("invalid", $"Description too long (max {MaxDescriptionLength} characters)."), null);
            }

            if (title.Length == 0)
            {
                if (lang == "en")
                {
                    return (new ApiError("invalid", "An English title is required."), null);
                }

                continue; // optional translation with no title → not stored
            }

            result.Add(new LocalizedContentInput(lang, title, description));
        }

        if (result.All(l => l.Language != "en"))
        {
            return (new ApiError("invalid", "An English title is required."), null);
        }

        return (null, result);
    }

    private static (ApiError? Error, IReadOnlyList<LocalizedNameInput>? Names) NormalizeCategoryNames(
        IReadOnlyList<LocalizedNameInput>? input)
    {
        if (input is null || input.Count == 0)
        {
            return (new ApiError("invalid", "At least one localized name is required."), null);
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<LocalizedNameInput>();
        foreach (var entry in input)
        {
            var lang = (entry.Language ?? "").Trim();
            if (!Languages.IsValid(lang))
            {
                return (new ApiError("invalid", $"Invalid language '{entry.Language}'."), null);
            }

            if (!seen.Add(lang))
            {
                return (new ApiError("invalid", $"Duplicate language '{lang}'."), null);
            }

            var name = (entry.Name ?? "").Trim();
            if (name.Length == 0)
            {
                if (lang == "en")
                {
                    return (new ApiError("invalid", "An English name is required."), null);
                }

                continue;
            }

            if (name.Length > MaxCategoryNameLength)
            {
                return (new ApiError("invalid", $"Name too long (max {MaxCategoryNameLength} characters)."), null);
            }

            result.Add(new LocalizedNameInput(lang, name));
        }

        if (result.All(n => n.Language != "en"))
        {
            return (new ApiError("invalid", "An English name is required."), null);
        }

        return (null, result);
    }

    private static (ApiError? Error, decimal Value, string Currency) ValidatePrice(decimal price, string? currency)
    {
        var currencyCode = string.IsNullOrWhiteSpace(currency)
            ? "USD"
            : currency.Trim().ToUpperInvariant();

        if (currencyCode.Length != 3 || currencyCode.Any(c => !char.IsLetter(c)))
        {
            currencyCode = "USD"; // fallback for a bad code: store USD, display USD-only (D11)
        }

        if (price < 0 || price > MaxPrice)
        {
            return (new ApiError("invalid", "Price must be between 0 and 1,000,000."), 0m, currencyCode);
        }

        return (null, price, currencyCode);
    }
}
