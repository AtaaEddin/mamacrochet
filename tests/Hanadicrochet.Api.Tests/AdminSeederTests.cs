using System.Reflection;
using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// Admin bootstrap (plan 20261005-1348/03): idempotency, the create path
/// (explicit + generated credentials, DefaultEmail), and the
/// identity-failure surface. Self-cleaning: every admin a test creates is
/// hard-deleted in <c>finally</c>; the seeded admin is restored.
/// </summary>
public class AdminSeederTests : IClassFixture<ApiTestFixture>
{
    private readonly ApiTestFixture _fx;

    public AdminSeederTests(ApiTestFixture fx) => _fx = fx;

    private async Task<int> ActiveAdminCountAsync()
    {
        using var scope = _fx.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Users.CountAsync(u => u.IsAdmin && u.DeletedAt == null);
    }

    [Fact]
    public async Task Seed_WithExistingAdmin_IsNoOp()
    {
        var before = await ActiveAdminCountAsync();
        Assert.True(before >= 1, "fixture should have seeded an admin");

        using var scope = _fx.CreateScope();
        await AdminSeeder.SeedAsync(
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>(),
            new AdminSeedOptions { Email = string.Empty, Password = string.Empty },
            NullLogger.Instance);

        Assert.Equal(before, await ActiveAdminCountAsync());
    }

    [Fact]
    public async Task Seed_ExplicitEmailAndPassword_CreatesAdminWithFlags()
    {
        // The create path needs NO active admin (idempotency guard), so the
        // fixture admins are soft-hidden and restored no matter what.
        var email = TestUsers.UniqueEmail("seed");
        using var dbScope = _fx.CreateScope();
        var db = dbScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = dbScope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

        var hidden = await HideActiveAdminsAsync(db);
        try
        {
            await AdminSeeder.SeedAsync(
                db, users,
                new AdminSeedOptions { Email = $"  {email} ", Password = "  Seed1234!x " },
                NullLogger.Instance);

            var admin = await db.Users.SingleOrDefaultAsync(u => u.Email == email);
            Assert.NotNull(admin);
            Assert.True(admin!.IsAdmin);
            Assert.True(admin.MustChangePassword);
            Assert.True(admin.IsActive);
            Assert.Equal("Admin", admin.DisplayName);
            Assert.Equal("en", admin.Language);
            Assert.Equal(email.ToUpperInvariant(), admin.NormalizedEmail);
            Assert.True(await users.CheckPasswordAsync(admin, "Seed1234!x"));
        }
        finally
        {
            var created = await db.Users.FirstOrDefaultAsync(
                u => u.Email == email && u.DeletedAt == null);
            if (created is not null)
            {
                db.Users.Remove(created);
            }

            await RestoreAsync(db, hidden);
        }
    }

    private async Task<List<AppUser>> HideActiveAdminsAsync(AppDbContext db)
    {
        var admins = await db.Users
            .Where(u => u.IsAdmin && u.DeletedAt == null)
            .ToListAsync();
        foreach (var u in admins)
        {
            u.DeletedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return admins;
    }

    private static async Task RestoreAsync(AppDbContext db, List<AppUser> admins)
    {
        foreach (var u in admins)
        {
            u.DeletedAt = null;
        }

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Seed_BlankOptions_DefaultEmail_And_StrongGeneratedPassword()
    {
        // The create path needs NO active admin — temporarily soft-delete
        // the fixture's, and restore it (plus clean up the created admin)
        // no matter what happens.
        using var dbScope = _fx.CreateScope();
        var db = dbScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = dbScope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

        var seeded = await db.Users
            .Where(u => u.IsAdmin && u.DeletedAt == null)
            .ToListAsync();
        var hidden = new List<AppUser>();
        foreach (var u in seeded)
        {
            u.DeletedAt = DateTime.UtcNow;
            hidden.Add(u);
        }

        await db.SaveChangesAsync();
        try
        {
            await AdminSeeder.SeedAsync(
                db, users, new AdminSeedOptions(), NullLogger.Instance);

            var admin = await db.Users.SingleOrDefaultAsync(
                u => u.Email == AdminSeeder.DefaultEmail);
            Assert.NotNull(admin);
            Assert.True(admin!.IsAdmin);
            Assert.True(admin.MustChangePassword);
            Assert.True(admin.IsActive);
        }
        finally
        {
            var created = await db.Users.FirstOrDefaultAsync(
                u => u.Email == AdminSeeder.DefaultEmail && u.DeletedAt == null);
            if (created is not null)
            {
                db.Users.Remove(created);
            }

            foreach (var u in hidden)
            {
                u.DeletedAt = null;
            }

            await db.SaveChangesAsync();
        }

        // The generator itself: 20 chars, one of each class, no look-alikes.
        var generate = typeof(AdminSeeder).GetMethod(
            "GeneratePassword", BindingFlags.NonPublic | BindingFlags.Static)!;
        for (var i = 0; i < 50; i++)
        {
            var pwd = (string)generate.Invoke(null, null)!;
            Assert.Equal(20, pwd.Length);
            Assert.Contains(pwd, c => c >= 'a' && c <= 'z');
            Assert.Contains(pwd, c => c >= 'A' && c <= 'Z');
            Assert.Contains(pwd, c => c >= '0' && c <= '9');
            Assert.Contains(pwd, c => "!@#$%^&*-_+=?".Contains(c));
            foreach (var lookalike in "l1O0")
            {
                Assert.DoesNotContain(lookalike, pwd);
            }
        }
    }

    [Fact]
    public async Task Seed_TakenEmail_ThrowsActionableError()
    {
        // A plain CUSTOMER owns the address; the seeder (no active admin in
        // play? there is one — so first hide the fixture admins as above).
        using var dbScope = _fx.CreateScope();
        var db = dbScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = dbScope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

        var taken = await TestUsers.CreateAsync(_fx, role: "customer");
        var seeded = await db.Users
            .Where(u => u.IsAdmin && u.DeletedAt == null)
            .ToListAsync();
        foreach (var u in seeded)
        {
            u.DeletedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        try
        {
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                AdminSeeder.SeedAsync(
                    db, users,
                    new AdminSeedOptions { Email = taken.Email! },
                    NullLogger.Instance));
            Assert.Contains(taken.Email!, ex.Message);
            Assert.Contains("AdminSeeder", ex.Message);
        }
        finally
        {
            foreach (var u in seeded)
            {
                u.DeletedAt = null;
            }

            await db.SaveChangesAsync();
        }
    }
}
