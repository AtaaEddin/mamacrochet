using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Mamacrochet.Api.Data;

/// <summary>
/// Application database context. Plan 03 entities: identity users (role
/// flags), guest→account links (D14), admin audit trail.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<GuestAccountLink> GuestAccountLinks => Set<GuestAccountLink>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

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
    }
}
