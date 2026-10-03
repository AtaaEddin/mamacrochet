using System.Security.Claims;
using Hanadicrochet.Api.Authorization;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Hanadicrochet.Api.Endpoints;

/// <summary>
/// Staff catalog management (plan 04): product + category CRUD and the
/// image pipeline. Employees manage everything except hard deletion —
/// DELETE of a product or category is Admin only (soft delete).
/// </summary>
public static class StaffProductEndpoints
{
    public static void MapStaffProductEndpoints(this IEndpointRouteBuilder app)
    {
        var products = app
            .MapGroup("/staff/products")
            .RequireAuthorization(Policies.Employee)
            .WithTags("Staff");

        products.MapGet("", async (
            AppDbContext db,
            HttpContext context,
            CancellationToken ct) =>
        {
            var (error, page) = await ProductListing.ListAsync(
                db,
                ProductQueryBinders.Staff(),
                context.Request.Query,
                publicOnly: false,
                defaultTop: 24,
                maxTop: 96,
                ct);

            return error is null
                ? Results.Ok(page!)
                : Results.BadRequest(error);
        })
        .Produces<ProductPage>(200)
        .Produces<ApiError>(400)
        .WithName("staff.products.list");

        products.MapGet("/{id}", async (
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
                .FirstOrDefaultAsync(p => p.Id == id && p.DeletedAt == null, ct);

            return product is null
                ? Results.NotFound(ApiError.NotFound("product_not_found"))
                : Results.Ok(ProductDto.From(product));
        })
        .Produces<ProductDto>(200)
        .Produces<ApiError>(404)
        .WithName("staff.product.get");

        products.MapPost("", async (
            CreateProductRequest request,
            ProductAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var result = await service.CreateAsync(request, ActorId(principal));
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(ProductDto.From(result.Product!));
        })
        .Produces<ProductDto>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.products.create");

        products.MapPatch("/{id}", async (
            string id,
            UpdateProductRequest request,
            ProductAdministrationService service,
            ClaimsPrincipal principal) =>
        {
            var result = await service.UpdateAsync(id, request, ActorId(principal));
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(ProductDto.From(result.Product!));
        })
        .Produces<ProductDto>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.products.update");

        // Hard surface of the soft delete — admin only.
        products.MapDelete("/{id}", async (
            string id,
            ProductAdministrationService service) =>
        {
            var result = await service.SoftDeleteAsync(id);
            return result.Error is null
                ? Results.NoContent()
                : Results.NotFound(result.Error);
        })
        .RequireAuthorization(Policies.Admin)
        .Produces(204)
        .Produces<ApiError>(404)
        .WithName("staff.products.delete");

        products.MapPost("/{id}/images", async (
            string id,
            [FromForm] IFormFileCollection? files,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.AddImagesAsync(id, files is null ? [] : files, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(result.Images!.Select(ProductDto.ImageDto).ToList());
        })
        .Produces<IReadOnlyList<ProductImageDto>>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.productImages.add");

        products.MapPut("/{id}/images", async (
            string id,
            ImageOrderRequest request,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.ReorderAsync(id, request.ImageIds ?? [], ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(result.Images!.Select(ProductDto.ImageDto).ToList());
        })
        .Produces<IReadOnlyList<ProductImageDto>>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.productImages.reorder");

        products.MapDelete("/{id}/images/{imageId}", async (
            string id,
            string imageId,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.DeleteImageAsync(id, imageId, ct);
            return result.Error is null
                ? Results.NoContent()
                : result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
        })
        .Produces(204)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.productImages.delete");

        MapCategories(app);
    }

    private static void MapCategories(IEndpointRouteBuilder app)
    {
        var categories = app
            .MapGroup("/staff/categories")
            .RequireAuthorization(Policies.Employee)
            .WithTags("Staff");

        categories.MapGet("", async (
            AppDbContext db,
            CancellationToken ct) =>
        {
            var list = await db.Categories
                .AsNoTracking()
                .Include(c => c.Translations)
                .Where(c => c.DeletedAt == null)
                .OrderBy(c => c.SortOrder)
                .ToListAsync(ct);

            return Results.Ok(list.Select(CategoryDto.From).ToList());
        })
        .Produces<IReadOnlyList<CategoryDto>>(200)
        .WithName("staff.categories.list");

        categories.MapPost("", async (
            CreateCategoryRequest request,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.CreateCategoryAsync(request, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(CategoryDto.From(result.Category!));
        })
        .Produces<CategoryDto>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.categories.create");

        categories.MapPatch("/{id}", async (
            string id,
            UpdateCategoryRequest request,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.UpdateCategoryAsync(id, request, ct);
            if (result.Error is not null)
            {
                return result.Error.Code == "not_found"
                    ? Results.NotFound(result.Error)
                    : Results.BadRequest(result.Error);
            }

            return Results.Ok(CategoryDto.From(result.Category!));
        })
        .Produces<CategoryDto>(200)
        .Produces<ApiError>(400)
        .Produces<ApiError>(404)
        .WithName("staff.categories.update");

        // Admin only, like product deletion.
        categories.MapDelete("/{id}", async (
            string id,
            ProductAdministrationService service,
            CancellationToken ct) =>
        {
            var result = await service.SoftDeleteCategoryAsync(id, ct);
            return result.Error is null
                ? Results.NoContent()
                : Results.NotFound(result.Error);
        })
        .RequireAuthorization(Policies.Admin)
        .Produces(204)
        .Produces<ApiError>(404)
        .WithName("staff.categories.delete");
    }

    private static string? ActorId(ClaimsPrincipal principal) =>
        principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
