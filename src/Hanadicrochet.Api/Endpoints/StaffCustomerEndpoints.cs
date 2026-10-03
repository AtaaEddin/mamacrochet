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
/// Staff customer search (chat app screen plan, sub-plan 02): the picker
/// behind "New conversation" in the staff Visitors inbox.
/// </summary>
public static class StaffCustomerEndpoints
{
    public static void MapStaffCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        // Policies.Any (signed-in + active); the staff rule is enforced in
        // the handler — same precedent as the staff chat routes.
        var customers = app
            .MapGroup("/staff/customers")
            .RequireAuthorization(Policies.Any)
            .WithTags("Staff");

        customers.MapGet("", async (
            string? search, int? page, int? pageSize,
            ClaimsPrincipal principal, ChatService chat,
            AppDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(
                    u => u.Id == principal.FindFirstValue(ClaimTypes.NameIdentifier), ct);
            if (user is null || (!user.IsEmployee && !user.IsAdmin))
            {
                return Results.Json(new ApiError("forbidden", "Staff only."),
                    statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Ok(
                await chat.SearchCustomersAsync(search, page ?? 1, pageSize ?? 20, ct));
        })
        .WithSummary(
            "Search active customers (display name / phone / email) — the picker behind New conversation.")
        .Produces<CustomerPageDto>(StatusCodes.Status200OK)
        .WithName("staff.searchCustomers");
    }
}
