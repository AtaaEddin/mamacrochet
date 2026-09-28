using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Data;

/// <summary>
/// Application database context. Plan 03 entities: identity users (role
/// flags), guest→account links (D14), admin audit trail; plan 04: catalog
/// (products, categories, images); plan 09: hiring applications (+ files,
/// + status history).
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<GuestAccountLink> GuestAccountLinks => Set<GuestAccountLink>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductTranslation> ProductTranslations => Set<ProductTranslation>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<CategoryTranslation> CategoryTranslations => Set<CategoryTranslation>();
    public DbSet<HiringApplication> HiringApplications => Set<HiringApplication>();
    public DbSet<HiringApplicationFile> HiringApplicationFiles => Set<HiringApplicationFile>();
    public DbSet<HiringApplicationEvent> HiringApplicationEvents => Set<HiringApplicationEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Plan 04: catalog (products, categories, localized content, images).
        builder.Entity<Category>(category =>
        {
            category.Property(c => c.Id).HasMaxLength(32);
            category.Property(c => c.SortOrder).HasDefaultValue(0);
            category.Property(c => c.CreatedAt).IsRequired();
            category.HasIndex(c => c.SortOrder);
            category.HasIndex(c => c.DeletedAt);
        });

        builder.Entity<CategoryTranslation>(translation =>
        {
            translation.HasKey(t => new { t.CategoryId, t.Language });
            translation.Property(t => t.CategoryId).HasMaxLength(32);
            translation.Property(t => t.Language).HasMaxLength(3);
            translation.Property(t => t.Name).HasMaxLength(80).IsRequired();
            translation.HasOne(t => t.Category)
                .WithMany(c => c.Translations)
                .HasForeignKey(t => t.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Product>(product =>
        {
            product.Property(p => p.Id).HasMaxLength(32);
            product.Property(p => p.CategoryId).HasMaxLength(32);
            product.Property(p => p.Price).HasPrecision(10, 2);
            product.Property(p => p.Currency).HasMaxLength(3).IsRequired();
            product.Property(p => p.StockUnits).HasDefaultValue(0);
            product.Property(p => p.CreatedAt).IsRequired();
            product.HasIndex(p => p.CategoryId);
            product.HasIndex(p => p.DeletedAt);
            product.HasIndex(p => p.CreatedAt);
            product.HasIndex(p => p.Price);
            product.HasOne(p => p.Category)
                .WithMany()
                .HasForeignKey(p => p.CategoryId)
                // A category row only vanishes via the (rare) hard path —
                // keep the product, just uncategorized.
                .OnDelete(DeleteBehavior.SetNull);
            // Created/edited by (audit): users are only soft-deleted, but
            // SetNull keeps the catalog writable in every hard-delete case.
            product.HasOne<AppUser>()
                .WithMany()
                .HasForeignKey(p => p.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);
            product.HasOne<AppUser>()
                .WithMany()
                .HasForeignKey(p => p.UpdatedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<ProductTranslation>(translation =>
        {
            translation.HasKey(t => new { t.ProductId, t.Language });
            translation.Property(t => t.ProductId).HasMaxLength(32);
            translation.Property(t => t.Language).HasMaxLength(3);
            translation.Property(t => t.Title).HasMaxLength(120).IsRequired();
            translation.Property(t => t.Description).HasMaxLength(2000);
            translation.HasOne(t => t.Product)
                .WithMany(p => p.Translations)
                .HasForeignKey(t => t.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ProductImage>(image =>
        {
            image.Property(i => i.Id).HasMaxLength(32);
            image.Property(i => i.ProductId).HasMaxLength(32);
            // One display order per product — the order list is the UI source.
            image.HasIndex(i => new { i.ProductId, i.SortOrder }).IsUnique();
            image.HasOne(i => i.Product)
                .WithMany(p => p.Images)
                .HasForeignKey(i => i.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AppUser>(user =>
        {
            user.Property(u => u.DisplayName).HasMaxLength(80).IsRequired();
            user.Property(u => u.Phone).HasMaxLength(20);
            user.Property(u => u.Country).HasMaxLength(64);
            user.Property(u => u.Language).HasMaxLength(3).IsRequired();
            user.Property(u => u.AvatarUrl).HasMaxLength(256);

            // Soft-deleted rows are hidden from every list; the unique e-mail
            // index ignores them so a freed address can be registered again.
            // The identifier is quoted: Npgsql sends the filter verbatim and the
            // column is stored case-preserved ("DeletedAt").
            user.HasIndex(u => u.NormalizedEmail).IsUnique().HasFilter("\"DeletedAt\" IS NULL");
            user.HasIndex(u => u.DeletedAt);
            user.HasIndex(u => u.CreatedAt);
            user.HasOne(u => u.AssignedEmployee)
                .WithMany()
                .HasForeignKey(u => u.AssignedEmployeeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<GuestAccountLink>(link =>
        {
            link.HasKey(g => g.GuestId);
            // One account per guest device — first link wins (D14).
            link.HasIndex(g => g.UserId).IsUnique();
            link.HasOne(g => g.User)
                .WithMany()
                .HasForeignKey(g => g.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AdminAuditLog>(audit =>
        {
            audit.Property(a => a.Action).HasMaxLength(64).IsRequired();
            audit.Property(a => a.Note).HasMaxLength(512);
            audit.HasIndex(a => a.At);
            audit.HasIndex(a => new { a.TargetUserId, a.At });
        });

        builder.Entity<HiringApplication>(application =>
        {
            application.HasKey(a => a.Id);
            application.Property(a => a.Id).HasMaxLength(32);
            application.Property(a => a.Name).HasMaxLength(80).IsRequired();
            application.Property(a => a.Email).HasMaxLength(320).IsRequired();
            application.Property(a => a.NormalizedEmail).HasMaxLength(320).IsRequired();
            application.Property(a => a.Phone).HasMaxLength(20).IsRequired();
            application.Property(a => a.Country).HasMaxLength(64).IsRequired();
            application.Property(a => a.Nationality).HasMaxLength(64);
            application.Property(a => a.PreviousWork).HasMaxLength(4000);
            application.Property(a => a.Message).HasMaxLength(2000);
            application.Property(a => a.Status).HasMaxLength(16).IsRequired();
            application.Property(a => a.DecisionNote).HasMaxLength(1000);

            // One application per e-mail (plan 09): re-applying updates the row.
            application.HasIndex(a => a.NormalizedEmail).IsUnique();
            // Admin queue: filter by status, list newest first.
            application.HasIndex(a => new { a.Status, a.AppliedAt });

            application.HasOne(a => a.DecidedBy)
                .WithMany()
                .HasForeignKey(a => a.DecidedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<HiringApplicationFile>(file =>
        {
            file.HasKey(f => f.Id);
            file.Property(f => f.Id).HasMaxLength(32);
            file.Property(f => f.StoredName).HasMaxLength(40).IsRequired();
            file.Property(f => f.OriginalName).HasMaxLength(200).IsRequired();
            file.Property(f => f.ContentType).HasMaxLength(64).IsRequired();
            file.HasOne(f => f.Application)
                .WithMany(a => a.Files)
                .HasForeignKey(f => f.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<HiringApplicationEvent>(evt =>
        {
            evt.HasKey(e => e.Id);
            evt.Property(e => e.Id).HasMaxLength(32);
            evt.Property(e => e.Kind).HasMaxLength(16).IsRequired();
            evt.Property(e => e.Note).HasMaxLength(512);
            evt.Property(e => e.ActorName).HasMaxLength(80);
            evt.HasOne(e => e.Application)
                .WithMany(a => a.Events)
                .HasForeignKey(e => e.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
            evt.HasIndex(e => new { e.ApplicationId, e.At });
        });
    }
}
