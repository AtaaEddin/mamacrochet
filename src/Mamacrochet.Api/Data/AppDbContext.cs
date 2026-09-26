using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Data;

/// <summary>Application database context. Empty model for now — entities land with
/// plans 03–07 (identity, products, orders, chat, payments).</summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
}
