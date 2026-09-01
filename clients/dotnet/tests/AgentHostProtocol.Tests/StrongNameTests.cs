#nullable enable

using System;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class StrongNameTests
{
    private const string ExpectedPublicKeyToken = "f300afd708cefcd3";

    [Fact]
    public void ShippingAssembliesHaveStableStrongNameIdentity()
    {
        string clientToken = GetPublicKeyToken(typeof(AhpClient).Assembly.GetName());
        string abstractionsToken = GetPublicKeyToken(typeof(ITransport).Assembly.GetName());

        Assert.Equal(clientToken, abstractionsToken);
#if STRONG_NAME_SIGNING
        Assert.Equal(ExpectedPublicKeyToken, clientToken);
#else
        Assert.Empty(clientToken);
#endif
    }

    private static string GetPublicKeyToken(System.Reflection.AssemblyName assemblyName)
    {
        byte[]? token = assemblyName.GetPublicKeyToken();
        return token is { Length: > 0 }
            ? Convert.ToHexString(token).ToLowerInvariant()
            : string.Empty;
    }
}
