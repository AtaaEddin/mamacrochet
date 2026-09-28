using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Public catalog (plan 04): read-only lists + product detail + categories.
/// No authentication. The dynamic part speaks the OData-style query subset
/// ($filter/$orderby/$top/$skip, D19) through the public allowlist.
/// </summary>
public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var catalog = app.MapGroup("/catalog").WithTags("Catalog");

        catalog.MapGet("/products", async (
            AppDbContext db,
            HttpContext context,
            CancellationToken ct) =>
        {
            var (error, page) = await ProductListing.ListAsync(
                db,
                ProductQueryBinders.Public(),
                context.Request.Query,
                publicOnly: true,
                defaultTop: 24,
                maxTop: 96,
                ct);

            return error is null
                ? Results.Ok(page!)
                : Results.BadRequest(error);
        })
        .Produces<ProductPage>(200)
        .Produces<ApiError>(400);

        catalog.MapGet("/products/{id}", async (
            string id,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var product = await db.Products
                .AsNoTracking()
                .Include(p => p.Translations)
                .Include(p => p.Images)
                .Include(p => p.Category)
                .ThenInclude(c => c!.Translations)
                .FirstOrDefaultAsync(p => p.Id == id && p.DeletedAt == null && p.IsListed, ct);

            return product is null
                ? Results.NotFound(ApiError.NotFound("product_not_found"))
                : Results.Ok(ProductDto.From(product));
        })
        .Produces<ProductDto>(200)
        .Produces<ApiError>(404);

        catalog.MapGet("/categories", async (
            AppDbContext db,
            CancellationToken ct) =>
        {
            var categories = await db.Categories
                .AsNoTracking()
                .Include(c => c.Translations)
                .Where(c => c.DeletedAt == null && c.IsListed)
                .OrderBy(c => c.SortOrder)
                .ToListAsync(ct);

            return Results.Ok(categories.Select(CategoryDto.From).ToList());
        })
        .Produces<IReadOnlyList<CategoryDto>>(200);
    }
}
