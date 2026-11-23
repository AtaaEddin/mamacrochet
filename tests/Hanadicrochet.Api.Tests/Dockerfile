# hanadicrochet API test runner (plan 20261004-1823/01) — DEPLOY-PIPELINE ONLY.
#
# Build context is the REPO ROOT (see deploy/docker-compose.test.yml):
#   ./deploy/pipeline.sh
# The suite runs against the ephemeral `test-postgres` service; the fixture
# finds it via TEST_DB_HOST (set in the compose file) and creates/drops its
# own database. Nothing here persists.

FROM mcr.microsoft.com/dotnet/sdk:10.0
WORKDIR /src
COPY . .
# Build with a RuntimeIdentifier so the RID-specific native asset from
# NetVips.Native.linux-x64 (runtimes/linux-x64/native/libvips.so.42) is copied
# into the output; without a RID, dotnet build omits runtimes/<rid>/native
# files and FileFixtures fails to load libvips. SelfContained=false keeps the
# build framework-dependent (the SDK image already ships the .NET runtime),
# and AppendRuntimeIdentifierToOutputPath=false keeps the output in the plain
# bin/Debug/net10.0 path.
#
# The suite is then RUN with `dotnet test --no-build` and NO RuntimeIdentifier:
# passing /p:RuntimeIdentifier to `dotnet test` makes vstest try to launch an
# architecture-specific testhost and die with "Could not find 'dotnet' host for
# the 'X64' architecture". Building with the RID (above) already puts libvips
# where the test host can load it.
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj \
    -p:RuntimeIdentifier=linux-x64 -p:SelfContained=false \
    -p:AppendRuntimeIdentifierToOutputPath=false
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", "--no-build", "--nologo"]
