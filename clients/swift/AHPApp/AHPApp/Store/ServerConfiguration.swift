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
