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
/// UserAdministrationService unit tests for the defensive identity-failure
/// mappings: the endpoint paths pre-validate e-mails, so a failing password
/// policy (stub validator) is the only deterministic way to reach the
/// IdentityResult branches.
/// </summary>
[Collection("Api")]
public class UserAdministrationServiceTests(ApiTestFixture fx)
{
    /// <summary>When identity rejects the password, CreateAsync maps the
    /// IdentityResult into an error and no user is created.</summary>
    [Fact]
    public async Task CreateAsync_IdentityFailure_MapsError()
    {
        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var service = new UserAdministrationService(BuildFailingUserManager(scope), db);

        var email = TestUsers.UniqueEmail("adminsvc");
        var result = await service.CreateAsync(
            new CreateUserRequest(email, "Identity Probe", null, null, "en", ["customer"]),
            "actor-id");

        Assert.NotNull(result.Error);
        Assert.Equal("policy_failed", result.Error.Code);
        Assert.Null(result.User);
        Assert.Null(result.TemporaryPassword);
        Assert.False(await db.Users.AnyAsync(u => u.Email == email));
    }

    /// <summary>A password reset for a real user: the target lookup passes,
    /// AddPasswordAsync fails, and the mapped error comes back. The
    /// MustChangePassword flag must not be persisted (it is only set after
    /// a successful add — the store's own eager save runs before it).</summary>
    [Fact]
    public async Task ResetPasswordAsync_AddFailure_MapsError()
    {
        using var scope = fx.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var service = new UserAdministrationService(BuildFailingUserManager(scope), db);

        var created = await TestUsers.CreateAsync(fx, "customer",
            email: TestUsers.UniqueEmail("resetfail"));

        var result = await service.ResetPasswordAsync(created.Id, "actor-id");

        Assert.NotNull(result.Error);
        Assert.Equal("policy_failed", result.Error.Code);
        Assert.Null(result.TemporaryPassword);

        // Verified through a fresh scope: the service's own context still
        // tracks the in-memory flag.
        using var verify = fx.Services.CreateScope();
        var verifyDb = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        var fresh = await verifyDb.Users.AsNoTracking()
            .FirstAsync(u => u.Id == created.Id);
        Assert.False(fresh.MustChangePassword);
    }

    /// <summary>A UserManager over the real store plus a validator that
    /// rejects every password.</summary>
    private UserManager<AppUser> BuildFailingUserManager(IServiceScope scope)
    {
        var store = scope.ServiceProvider.GetRequiredService<IUserStore<AppUser>>();
        return new UserManager<AppUser>(
            store,
            Options.Create(new IdentityOptions()),
            new PasswordHasher<AppUser>(Options.Create(new PasswordHasherOptions())),
            Array.Empty<IUserValidator<AppUser>>(),
            [new RejectingPasswordValidator()],
            new UpperInvariantLookupNormalizer(),
            new IdentityErrorDescriber(),
            scope.ServiceProvider,
            NullLogger<UserManager<AppUser>>.Instance);
    }

    /// <summary>Rejects every password, forcing CreateAsync/AddPasswordAsync
    /// into the failure branch deterministically.</summary>
    private sealed class RejectingPasswordValidator : IPasswordValidator<AppUser>
    {
        public Task<IdentityResult> ValidatePasswordAsync(AppUser user, string password)
            => Task.FromResult(IdentityResult.Failed(
                [new IdentityError
                {
                    Code = "policy_failed",
                    Description = "Test policy rejects the password.",
                }]));

        public Task<IdentityResult> ValidateAsync(
            UserManager<AppUser> userManager, AppUser user, string? password)
        {
            if (password is null)
            {
                return Task.FromResult(IdentityResult.Failed(
                    [new IdentityError
                    {
                        Code = "policy_failed",
                        Description = "No password given.",
                    }]));
            }

            return ValidatePasswordAsync(user, password);
        }
    }
}
