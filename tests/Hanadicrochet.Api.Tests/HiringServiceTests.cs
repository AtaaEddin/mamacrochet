using Hanadicrochet.Api.Data;
using Hanadicrochet.Api.Models;
using Hanadicrochet.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Hanadicrochet.Api.Tests;

/// <summary>
/// HiringService unit tests that need a failing identity result: the endpoint
/// path is pre-guarded by the duplicate-e-mail check, so the defensive
/// IdentityResult mapping is exercised here with a stub store instead.
/// </summary>
[Collection("Api")]
public class HiringServiceTests(ApiTestFixture fx)
{
    /// <summary>When user creation fails in identity (duplicate username), AcceptAsync
    /// maps the IdentityResult into an error instead of creating a user.</summary>
    [Fact]
    public async Task AcceptAsync_IdentityFailure_MapsError()
    {
        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var email = TestUsers.UniqueEmail("identity");
        var application = new HiringApplication
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = "Identity Probe",
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            Phone = "+31 6 10000021",
            Country = "NL",
            Languages = ["English"],
            AppliedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.HiringApplications.Add(application);
        await db.SaveChangesAsync();

        var describer = new IdentityErrorDescriber();
        var userManager = new UserManager<AppUser>(
            new DuplicateNameStore(),
            Options.Create(new IdentityOptions()),
            new PasswordHasher<AppUser>(Options.Create(new PasswordHasherOptions())),
            Array.Empty<IUserValidator<AppUser>>(),
            Array.Empty<IPasswordValidator<AppUser>>(),
            new UpperInvariantLookupNormalizer(),
            describer,
            scope.ServiceProvider,
            NullLogger<UserManager<AppUser>>.Instance);
        var service = new HiringService(
            userManager, db, Options.Create(new UploadsOptions { Root = fx.UploadsRoot }));

        var result = await service.AcceptAsync(application.Id,
            new AcceptHiringRequest(email, "Identity Probe", "+31 6 10000021", "NL", "en"),
            "actor-id", "Actor");

        Assert.NotNull(result.Error);
        Assert.Null(result.Application);
        var createdUser = await db.Users.AnyAsync(u => u.Email == email);
        Assert.False(createdUser);
    }

    /// <summary>A zero-byte file part is skipped by the endpoint binder, so the
    /// service-level guard is exercised here: an empty upload is invalid.</summary>
    [Fact]
    public async Task SubmitAsync_EmptyFile_Invalid()
    {
        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var service = new HiringService(
            userManager, db, Options.Create(new UploadsOptions { Root = fx.UploadsRoot }));

        var result = await service.SubmitAsync(
            "Empty File Probe", TestUsers.UniqueEmail("emptysvc"), "+31 6 10000022", "NL",
            null, ["English"], null, null, null,
            [new UploadFile("cv.pdf", Array.Empty<byte>())]);

        Assert.NotNull(result.Error);
        Assert.Equal("invalid", result.Error.Code);
    }

    /// <summary>
    /// Minimal IUserStore that always reports an existing user for any name lookup,
    /// forcing UserManager.CreateAsync into the duplicate-username branch.
    /// </summary>
    private sealed class DuplicateNameStore : IUserStore<AppUser>, IUserPasswordStore<AppUser>
    {
        public Task<string> GetUserIdAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(user.Id);

        public Task<string?> GetUserNameAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(user.UserName);

        public Task SetUserNameAsync(AppUser user, string? userName, System.Threading.CancellationToken ct)
        {
            user.UserName = userName;
            return Task.CompletedTask;
        }

        public Task<string?> GetNormalizedUserNameAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(user.NormalizedUserName);

        public Task SetNormalizedUserNameAsync(AppUser user, string? normalizedName, System.Threading.CancellationToken ct)
        {
            user.NormalizedUserName = normalizedName;
            return Task.CompletedTask;
        }

        public Task<IdentityResult> CreateAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(IdentityResult.Failed(
                [new IdentityError { Code = "duplicate_username", Description = "Store reports an existing user." }]));

        public Task<IdentityResult> UpdateAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(IdentityResult.Success);

        public Task<IdentityResult> DeleteAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(IdentityResult.Success);

        public Task<AppUser?> FindByIdAsync(string userId, System.Threading.CancellationToken ct)
            => Task.FromResult<AppUser?>(null);

        public Task<AppUser?> FindByNameAsync(string normalizedUserName, System.Threading.CancellationToken ct)
            => Task.FromResult<AppUser?>(new AppUser { Id = "existing-user" });

        public Task SetPasswordHashAsync(AppUser user, string? passwordHash, System.Threading.CancellationToken ct)
        {
            user.PasswordHash = passwordHash;
            return Task.CompletedTask;
        }

        public Task<string?> GetPasswordHashAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult<string?>(user.PasswordHash);

        public Task<bool> HasPasswordAsync(AppUser user, System.Threading.CancellationToken ct)
            => Task.FromResult(user.PasswordHash is not null);

        public void Dispose() { }
    }
}
