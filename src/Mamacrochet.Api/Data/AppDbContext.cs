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
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();
    public DbSet<OrderAttachment> OrderAttachments => Set<OrderAttachment>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<ChatThread> ChatThreads => Set<ChatThread>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatAttachment> ChatAttachments => Set<ChatAttachment>();
    public DbSet<ChatThreadRead> ChatThreadReads => Set<ChatThreadRead>();

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
            // One account per guest device (GuestId key) — first link wins
            // (D14). An account may link many devices (phone + desktop).
            link.HasIndex(g => g.UserId);
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

        // Plan 05: orders & status board.
        // (plan 07 adds Payment/Delivery — see below).
        builder.Entity<Order>(order =>
        {
            order.HasKey(o => o.Id);
            order.Property(o => o.Id).HasMaxLength(32);
            order.Property(o => o.Kind).HasMaxLength(16).IsRequired();
            order.Property(o => o.Status).HasMaxLength(24).IsRequired();
            order.Property(o => o.GuestId).HasMaxLength(36);
            order.Property(o => o.ContactName).HasMaxLength(80).IsRequired();
            order.Property(o => o.ContactPhone).HasMaxLength(20).IsRequired();
            order.Property(o => o.ContactEmail).HasMaxLength(320);
            order.Property(o => o.Spec).HasMaxLength(4000);
            order.Property(o => o.EstimatedPrice).HasPrecision(10, 2);
            order.Property(o => o.FinalPrice).HasPrecision(10, 2);
            order.Property(o => o.Currency).HasMaxLength(3).IsRequired();
            order.Property(o => o.RatingComment).HasMaxLength(500);
            order.Property(o => o.CreatedAt).IsRequired();
            order.Property(o => o.UpdatedAt).IsRequired();
            order.HasIndex(o => o.Status);
            order.HasIndex(o => o.CreatedAt);
            order.HasOne(o => o.Customer)
                .WithMany()
                .HasForeignKey(o => o.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);
            order.HasOne(o => o.Product)
                .WithMany()
                .HasForeignKey(o => o.ProductId)
                .OnDelete(DeleteBehavior.SetNull);
            order.HasOne(o => o.AssignedEmployee)
                .WithMany()
                .HasForeignKey(o => o.AssignedEmployeeId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<OrderEvent>(evt =>
        {
            evt.HasKey(e => e.Id);
            evt.Property(e => e.Id).HasMaxLength(32);
            evt.Property(e => e.Kind).HasMaxLength(16).IsRequired();
            evt.Property(e => e.Status).HasMaxLength(24);
            evt.Property(e => e.Note).HasMaxLength(1000);
            // User ids are 36-char GUIDs (Identity) — no length cap.
            evt.Property(e => e.ActorName).HasMaxLength(80).IsRequired();
            evt.Property(e => e.ActorRole).HasMaxLength(16).IsRequired();
            evt.Property(e => e.At).IsRequired();
            evt.HasOne(e => e.Order)
                .WithMany(o => o.Timeline)
                .HasForeignKey(e => e.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            evt.HasIndex(e => new { e.OrderId, e.At });
        });

        builder.Entity<OrderAttachment>(file =>
        {
            file.HasKey(f => f.Id);
            file.Property(f => f.Id).HasMaxLength(32);
            file.Property(f => f.Kind).HasMaxLength(16).IsRequired();
            file.Property(f => f.StoredName).HasMaxLength(40).IsRequired();
            file.Property(f => f.OriginalName).HasMaxLength(200).IsRequired();
            file.Property(f => f.ContentType).HasMaxLength(64).IsRequired();
            file.Property(f => f.CreatedAt).IsRequired();
            file.HasOne(f => f.UploadedBy)
                .WithMany()
                .HasForeignKey(f => f.UploadedById)
                .OnDelete(DeleteBehavior.SetNull);
            file.HasOne(f => f.Order)
                .WithMany(o => o.Attachments)
                .HasForeignKey(f => f.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Plan 07: payment (receipt-gated) + delivery records — one each
        // per order (the lifecycle has a single payment and a single
        // delivery; re-recording is an admin data fix, not a UI path).
        builder.Entity<Payment>(payment =>
        {
            payment.HasKey(p => p.Id);
            payment.Property(p => p.Id).HasMaxLength(32);
            payment.Property(p => p.OrderId).HasMaxLength(32).IsRequired();
            payment.Property(p => p.Amount).HasPrecision(10, 2).IsRequired();
            payment.Property(p => p.Currency).HasMaxLength(3).IsRequired();
            payment.Property(p => p.Method).HasMaxLength(100).IsRequired();
            payment.Property(p => p.Note).HasMaxLength(500);
            payment.Property(p => p.RecordedAt).IsRequired();
            // User ids are 36-char GUIDs (Identity) — no length cap.
            payment.HasIndex(p => p.OrderId).IsUnique();
            payment.HasOne(p => p.Order)
                .WithOne(o => o.Payment)
                .HasForeignKey<Payment>(p => p.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            payment.HasOne(p => p.ReceiptFile)
                .WithMany()
                .HasForeignKey(p => p.ReceiptFileId)
                .OnDelete(DeleteBehavior.Restrict);
            payment.HasOne(p => p.RecordedBy)
                .WithMany()
                .HasForeignKey(p => p.RecordedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<Delivery>(delivery =>
        {
            delivery.HasKey(d => d.Id);
            delivery.Property(d => d.Id).HasMaxLength(32);
            delivery.Property(d => d.OrderId).HasMaxLength(32).IsRequired();
            delivery.Property(d => d.Method).HasMaxLength(100).IsRequired();
            delivery.Property(d => d.Description).HasMaxLength(500);
            delivery.Property(d => d.ActualAt).IsRequired();
            delivery.Property(d => d.RecordedAt).IsRequired();
            delivery.HasIndex(d => d.OrderId).IsUnique();
            delivery.HasOne(d => d.Order)
                .WithOne(o => o.Delivery)
                .HasForeignKey<Delivery>(d => d.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            delivery.HasOne(d => d.ProofFile)
                .WithMany()
                .HasForeignKey(d => d.ProofFileId)
                .OnDelete(DeleteBehavior.Restrict);
            delivery.HasOne(d => d.RecordedBy)
                .WithMany()
                .HasForeignKey(d => d.RecordedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Plan 06: chat (visitor threads, order threads, messages, files,
        // read markers).
        builder.Entity<ChatThread>(thread =>
        {
            thread.HasKey(t => t.Id);
            thread.Property(t => t.Id).HasMaxLength(32);
            thread.Property(t => t.Kind).HasMaxLength(16).IsRequired();
            thread.Property(t => t.OrderId).HasMaxLength(32);
            // User ids are GUIDs (36) — not the 32-char short ids used by
            // the domain aggregates above.
            thread.Property(t => t.CustomerId).HasMaxLength(36);
            thread.Property(t => t.GuestId).HasMaxLength(36);
            thread.Property(t => t.AssignedEmployeeId).HasMaxLength(36);
            thread.Property(t => t.Subject).HasMaxLength(200);
            thread.Property(t => t.ClosedReason).HasMaxLength(500);
            thread.Property(t => t.CreatedAt).IsRequired();
            thread.Property(t => t.UpdatedAt).IsRequired();
            thread.HasIndex(t => new { t.Kind, t.IsClosed, t.LastMessageAt });
            thread.HasIndex(t => t.CustomerId);
            thread.HasIndex(t => t.AssignedEmployeeId);
            thread.HasIndex(t => t.OrderId);
            // D16: one ACTIVE visitor thread per device (closed history is
            // allowed). Filtered unique — backstop for the bootstrap race.
            thread.HasIndex(t => new { t.GuestId, t.Kind })
                .HasFilter("\"Kind\" = 'visitor' AND NOT \"IsClosed\"")
                .IsUnique();
            thread.HasOne(t => t.Order)
                .WithMany()
                .HasForeignKey(t => t.OrderId)
                .OnDelete(DeleteBehavior.SetNull);
            thread.HasOne(t => t.Customer)
                .WithMany()
                .HasForeignKey(t => t.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);
            thread.HasOne(t => t.AssignedEmployee)
                .WithMany()
                .HasForeignKey(t => t.AssignedEmployeeId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<ChatMessage>(msg =>
        {
            msg.HasKey(m => m.Id);
            msg.Property(m => m.Id).HasMaxLength(32);
            msg.Property(m => m.ThreadId).HasMaxLength(32).IsRequired();
            msg.Property(m => m.SenderId).HasMaxLength(36);
            msg.Property(m => m.SenderGuestId).HasMaxLength(36);
            msg.Property(m => m.SenderName).HasMaxLength(80).IsRequired();
            msg.Property(m => m.SenderRole).HasMaxLength(16).IsRequired();
            msg.Property(m => m.Body).HasMaxLength(4000).IsRequired();
            msg.Property(m => m.ProductId).HasMaxLength(32);
            msg.Property(m => m.ProductName).HasMaxLength(200);
            msg.Property(m => m.At).IsRequired();
            msg.HasOne(m => m.Thread)
                .WithMany(t => t.Messages)
                .HasForeignKey(m => m.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);
            msg.HasOne(m => m.Sender)
                .WithMany()
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.SetNull);
            msg.HasIndex(m => new { m.ThreadId, m.At });
        });

        builder.Entity<ChatAttachment>(file =>
        {
            file.HasKey(f => f.Id);
            file.Property(f => f.Id).HasMaxLength(32);
            file.Property(f => f.ThreadId).HasMaxLength(32).IsRequired();
            file.Property(f => f.MessageId).HasMaxLength(32);
            file.Property(f => f.StoredName).HasMaxLength(40).IsRequired();
            file.Property(f => f.OriginalName).HasMaxLength(200).IsRequired();
            file.Property(f => f.ContentType).HasMaxLength(64).IsRequired();
            file.Property(f => f.CreatedAt).IsRequired();
            file.HasOne(f => f.Thread)
                .WithMany()
                .HasForeignKey(f => f.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);
            file.HasOne(f => f.Message)
                .WithMany(m => m.Attachments)
                .HasForeignKey(f => f.MessageId)
                .OnDelete(DeleteBehavior.Cascade);
            file.HasIndex(f => new { f.ThreadId, f.MessageId });
        });

        builder.Entity<ChatThreadRead>(read =>
        {
            read.HasKey(r => new { r.ThreadId, r.UserId });
            read.Property(r => r.ThreadId).HasMaxLength(32).IsRequired();
            read.Property(r => r.UserId).HasMaxLength(36).IsRequired();
            read.Property(r => r.LastReadAt).IsRequired();
        });
    }
}
