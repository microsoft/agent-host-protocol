import DevTunnelsClient
import Foundation

/// A saved server configuration for connecting to an AHP server.
struct ServerConfiguration: Identifiable, Equatable {
    let id: UUID
    var name: String
    var scheme: String       // "ws" or "wss"
    var host: String         // e.g. "127.0.0.1:8081"
    var token: String        // optional token (passed as ?tkn= query param)

    // Dev Tunnel metadata (nil for non-tunnel servers)
    var tunnelId: String?
    var clusterId: String?

    /// Tunnel connect access token (JWT, ephemeral — not persisted to Core Data).
    /// Obtained from the management API with `tokenScopes=connect`.
    var connectAccessToken: String?

    /// Whether this server was created from a Dev Tunnel.
    var isTunnel: Bool { tunnelId != nil }

    var endpointURLString: String {
        var urlString = "\(scheme)://\(host)"
        // For tunnel servers the GitHub token is sent via the
        // X-Tunnel-Authorization header, not as a query parameter.
        if !token.isEmpty && !isTunnel {
            let separator = urlString.contains("?") ? "&" : "?"
            urlString += "\(separator)tkn=\(token)"
        }
        return urlString
    }

    init(
        id: UUID = UUID(),
        name: String,
        scheme: String = "ws",
        host: String,
        token: String = "",
        tunnelId: String? = nil,
        clusterId: String? = nil,
        connectAccessToken: String? = nil
    ) {
        self.id = id
        self.name = name
        self.scheme = scheme
        self.host = host
        self.token = token
        self.tunnelId = tunnelId
        self.clusterId = clusterId
        self.connectAccessToken = connectAccessToken
    }
}

enum DevTunnelServerEndpoint {
    static let agentHostPort: UInt16 = 31_546

    static func directURL(for tunnel: Tunnel, port: UInt16 = agentHostPort) -> URL? {
        if let endpointURL = tunnel.endpoints?
            .lazy
            .compactMap({ TunnelConnection.directURL(endpoint: $0, port: port) })
            .first {
            return endpointURL
        }
        return TunnelConnection.directURL(tunnel: tunnel, port: port)
    }

    static func serverConfiguration(
        name: String,
        tunnel: Tunnel,
        accessToken: String,
        connectToken: String,
        port: UInt16 = agentHostPort
    ) -> ServerConfiguration? {
        guard let tunnelId = tunnel.tunnelId,
              let clusterId = tunnel.clusterId,
              let url = directURL(for: tunnel, port: port),
              let endpoint = endpointParts(from: url) else {
            return nil
        }
        return ServerConfiguration(
            name: name,
            scheme: endpoint.scheme,
            host: endpoint.host,
            token: accessToken,
            tunnelId: tunnelId,
            clusterId: clusterId,
            connectAccessToken: connectToken
        )
    }

    @discardableResult
    static func updateEndpoint(
        for server: inout ServerConfiguration,
        from tunnel: Tunnel,
        port: UInt16 = agentHostPort
    ) -> Bool {
        guard let url = directURL(for: tunnel, port: port),
              let endpoint = endpointParts(from: url) else {
            return false
        }
        server.scheme = endpoint.scheme
        server.host = endpoint.host
        return true
    }

    static func displayURLString(for tunnel: Tunnel, port: UInt16 = agentHostPort) -> String? {
        directURL(for: tunnel, port: port)?.absoluteString
    }

    private static func endpointParts(from url: URL) -> (scheme: String, host: String)? {
        guard let scheme = url.scheme?.lowercased(),
              let hostName = url.host(percentEncoded: false) else {
            return nil
        }

        var host = hostName
        if let port = url.port {
            host += ":\(port)"
        }

        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            let path = components.percentEncodedPath
            if !path.isEmpty && path != "/" {
                host += path
            }
            if let query = components.percentEncodedQuery, !query.isEmpty {
                host += "?\(query)"
            }
        }

        return (scheme, host)
    }
}
