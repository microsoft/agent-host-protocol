// ClientIdStore — pluggable persistence for stable per-host `clientId`s.

import Foundation

/// Persistence hook for stable `clientId`s per host.
///
/// On `MultiHostClient.add(_:)`, the multi-host client looks up `hostId`
/// in this store. If the store returns a value, that id is reused — letting
/// the server treat successive launches as the same client (which the AHP
/// `reconnect` flow needs to replay missed actions). If the store returns
/// `nil`, the multi-host client generates a fresh UUID and stores it.
///
/// The default `InMemoryClientIdStore` is **session-stable only** — it does
/// not survive process restarts. Production multi-host apps should plug a
/// keychain/file-backed implementation in so reconnects keep working across
/// launches.
public protocol ClientIdStore: AnyObject, Sendable {
    /// Look up the previously stored `clientId` for `hostId`, if any.
    func load(_ hostId: HostId) async -> String?

    /// Persist `clientId` for `hostId`. Implementations should overwrite any
    /// previous value.
    func store(_ hostId: HostId, clientId: String) async
}

/// In-process `ClientIdStore` backed by an actor-protected dictionary.
///
/// Keeps assigned ids in memory. Survives reconnects within the same process
/// but **not** restarts. Fine for tests, ephemeral CLIs, and as a starting
/// point — production apps should provide a persistent implementation
/// (filesystem, keychain, secure enclave, …).
public final class InMemoryClientIdStore: ClientIdStore {
    private let storage: Storage

    public init() {
        self.storage = Storage()
    }

    public func load(_ hostId: HostId) async -> String? {
        await storage.load(hostId)
    }

    public func store(_ hostId: HostId, clientId: String) async {
        await storage.store(hostId, clientId: clientId)
    }

    private actor Storage {
        private var entries: [HostId: String] = [:]

        func load(_ hostId: HostId) -> String? { entries[hostId] }

        func store(_ hostId: HostId, clientId: String) {
            entries[hostId] = clientId
        }
    }
}

/// Filesystem-backed `ClientIdStore` that survives process restarts.
///
/// Stores one file per host id under a configurable directory. Writes go
/// through a temp file opened with owner-read/write permissions and are then
/// renamed into place, so the persisted ids are atomic on the same volume and
/// are never present on disk at world-readable permissions. Per-store mutations are serialised through an internal
/// actor so concurrent `load`/`store` calls from different hosts don't race
/// on the directory's contents.
///
/// **iOS Keychain note:** for the highest-security profile on Apple
/// platforms, wrap a Keychain-backed implementation of `ClientIdStore`
/// in your app (the SDK doesn't ship one to keep this product
/// dependency-free across SwiftPM-supported platforms). `FileClientIdStore`
/// is a reasonable default for desktops, command-line tools, and
/// development builds; it provides persistence without coupling
/// `AgentHostProtocolClient` to `Security.framework`.
///
/// The directory is created on first write if it doesn't already exist.
/// Filenames are derived from each host id via a percent-encoding helper
/// so arbitrary `HostId` strings (including `:`, `/`, etc.) map to safe
/// filesystem paths.
public final class FileClientIdStore: ClientIdStore {
    private let storage: Storage

    /// Build a store rooted at `directory`. The directory will be created
    /// when needed; the caller is responsible for picking a location that
    /// the process can write to (e.g. `Application Support` on Apple
    /// platforms, `XDG_DATA_HOME` / `~/.local/share` on Linux).
    public init(directory: URL) {
        self.storage = Storage(directory: directory)
    }

    public func load(_ hostId: HostId) async -> String? {
        await storage.load(hostId)
    }

    public func store(_ hostId: HostId, clientId: String) async {
        await storage.store(hostId, clientId: clientId)
    }

    private actor Storage {
        private let directory: URL
        private let fm = FileManager.default

        init(directory: URL) {
            self.directory = directory
        }

        func load(_ hostId: HostId) -> String? {
            let url = fileURL(for: hostId)
            guard let data = try? Data(contentsOf: url),
                  let text = String(data: data, encoding: .utf8)
            else {
                return nil
            }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        func store(_ hostId: HostId, clientId: String) {
            ensureDirectory()
            let url = fileURL(for: hostId)
            guard let data = clientId.data(using: .utf8) else { return }

            // Create the temp file with owner-only permissions BEFORE any bytes
            // land in it, then rename(2) it into place.
            //
            // The previous shape — `data.write(to:options:.atomic)` followed by a
            // `setAttributes(.posixPermissions)` — put the id on disk at the
            // umask default (0644 under a typical umask) and only tightened it
            // afterwards, so the first store for a host id was briefly world
            // readable at a predictable path. The 0700 on `directory` does not
            // cover that: `ensureDirectory()` only applies it on the branch where
            // it CREATES the directory, so a pre-existing Application Support or
            // XDG path keeps its own mode.
            //
            // `open(2)` with an explicit mode has no such window, and rename(2) is
            // atomic and carries the 0600 across — including over a destination
            // that was already left at looser permissions by an older build.
            let tempURL = directory.appendingPathComponent(".\(UUID().uuidString).tmp")
            let fd = tempURL.withUnsafeFileSystemRepresentation { path -> Int32 in
                guard let path else { return -1 }
                return open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0o600)
            }
            guard fd >= 0 else {
                #if DEBUG
                print("[FileClientIdStore] failed to create temp file for \(hostId)")
                #endif
                return
            }

            var written = 0
            data.withUnsafeBytes { buffer in
                guard let base = buffer.baseAddress else { return }
                while written < buffer.count {
                    let n = write(fd, base + written, buffer.count - written)
                    if n <= 0 { break }
                    written += n
                }
            }
            close(fd)

            guard written == data.count else {
                try? fm.removeItem(at: tempURL)
                #if DEBUG
                print("[FileClientIdStore] short write persisting id for \(hostId)")
                #endif
                return
            }

            let renamed = tempURL.withUnsafeFileSystemRepresentation { src -> Bool in
                url.withUnsafeFileSystemRepresentation { dst -> Bool in
                    guard let src, let dst else { return false }
                    return rename(src, dst) == 0
                }
            }
            if !renamed {
                try? fm.removeItem(at: tempURL)
                #if DEBUG
                print("[FileClientIdStore] failed to persist id for \(hostId)")
                #endif
            }
        }

        private func ensureDirectory() {
            if !fm.fileExists(atPath: directory.path) {
                try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
                // Best-effort restrict the directory too.
                try? fm.setAttributes(
                    [.posixPermissions: 0o700],
                    ofItemAtPath: directory.path
                )
            }
        }

        private func fileURL(for hostId: HostId) -> URL {
            let safe = Self.encode(hostId)
            return directory.appendingPathComponent("\(safe).clientid")
        }

        /// Percent-encode characters that aren't safe in filesystem
        /// paths, including the URL path separator and any control
        /// characters. The reverse direction isn't needed because we
        /// only read files we wrote, by the same key.
        static func encode(_ hostId: HostId) -> String {
            var allowed = CharacterSet.alphanumerics
            allowed.insert(charactersIn: "-._~")
            return hostId.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? hostId.value
        }
    }
}
