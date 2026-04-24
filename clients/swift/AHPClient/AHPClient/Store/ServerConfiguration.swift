import Foundation

/// A saved server configuration for connecting to an AHP server.
struct ServerConfiguration: Identifiable, Equatable {
    let id: UUID
    var name: String
    var scheme: String       // "ws" or "wss"
    var host: String         // e.g. "127.0.0.1:8081"
    var token: String        // optional token (passed as ?tkn= query param)

    var endpointURLString: String {
        var urlString = "\(scheme)://\(host)"
        if !token.isEmpty {
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
        token: String = ""
    ) {
        self.id = id
        self.name = name
        self.scheme = scheme
        self.host = host
        self.token = token
    }
}
