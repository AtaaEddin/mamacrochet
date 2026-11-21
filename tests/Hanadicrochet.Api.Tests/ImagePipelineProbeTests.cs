using Hanadicrochet.Api.Services;
using Xunit;

namespace Hanadicrochet.Api.Tests;

public class ImagePipelineProbeTests
{
    [Fact]
    public void Probe_EncodesWebp_WithTheRealNative()
    {
        var probe = new ImagePipelineProbe();

        Assert.True(probe.Probe());
        Assert.True(probe.Ready);
    }

    [Fact]
    public void Probe_ReturnsFalse_WhenTheNativeCannotEncode()
    {
        var probe = new ImagePipelineProbe(() => throw new InvalidOperationException("libvips not found"));

        Assert.False(probe.Probe());
        Assert.False(probe.Ready);
    }

    [Fact]
    public void Probe_ReturnsFalse_WhenTheEncoderProducesNothing()
    {
        var probe = new ImagePipelineProbe(() => false);

        Assert.False(probe.Ready);
    }

    [Fact]
    public void Ready_RetriesAfterAFailure_SoATransientProblemRecovers()
    {
        var attempts = 0;
        var probe = new ImagePipelineProbe(() => ++attempts > 1);

        Assert.False(probe.Ready);
        Assert.True(probe.Ready);
        Assert.Equal(2, attempts);
    }

    [Fact]
    public void Ready_CachesSuccess_SoHealthIsNotEncodingOnEveryPoll()
    {
        var calls = 0;
        var probe = new ImagePipelineProbe(() => { calls++; return true; });

        Assert.True(probe.Ready);
        Assert.True(probe.Ready);
        Assert.True(probe.Ready);

        Assert.Equal(1, calls);
    }
}
