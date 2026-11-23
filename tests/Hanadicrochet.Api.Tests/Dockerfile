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
# Plain build/test, NO RuntimeIdentifier: the test project copies the bundled
# NetVips.Native.linux-x64 libvips.so.42 into the output itself (see the csproj),
# and building with a RID makes vstest emit a RID-specific testhost that cannot
# launch in this container. framework-dependent build; the SDK image has the runtime.
RUN dotnet build tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj --nologo
CMD ["dotnet", "test", "tests/Hanadicrochet.Api.Tests/Hanadicrochet.Api.Tests.csproj", "--no-build", "--nologo"]