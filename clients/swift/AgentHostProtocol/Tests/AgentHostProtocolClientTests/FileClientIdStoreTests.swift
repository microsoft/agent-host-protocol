// FileClientIdStoreTests — round-trip, restart simulation, and per-host
// isolation tests for the filesystem-backed `ClientIdStore`.

import XCTest
@testable import AgentHostProtocolClient

final class FileClientIdStoreTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() async throws {
        try await super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ahp-file-client-id-store-tests")
            .appendingPathComponent(UUID().uuidString)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: tempDir)
        try await super.tearDown()
    }

    func testLoadReturnsNilForUnknownHost() async throws {
        let store = FileClientIdStore(directory: tempDir)
        let value = await store.load("never-stored")
        XCTAssertNil(value)
    }

    func testStoreAndLoadRoundTrips() async throws {
        let store = FileClientIdStore(directory: tempDir)
        await store.store("alpha", clientId: "abc-123")
        let value = await store.load("alpha")
        XCTAssertEqual(value, "abc-123")
    }

    func testSurvivesAcrossInstances() async throws {
        let writer = FileClientIdStore(directory: tempDir)
        await writer.store("h1", clientId: "preserved-id")

        // Simulate a "restart" by constructing a fresh store rooted at
        // the same directory.
        let reader = FileClientIdStore(directory: tempDir)
        let value = await reader.load("h1")
        XCTAssertEqual(value, "preserved-id")
    }

    func testStoresAreKeyedPerHost() async throws {
        let store = FileClientIdStore(directory: tempDir)
        await store.store("a", clientId: "id-a")
        await store.store("b", clientId: "id-b")

        let a = await store.load("a")
        let b = await store.load("b")
        XCTAssertEqual(a, "id-a")
        XCTAssertEqual(b, "id-b")
    }

    func testStoreOverwrites() async throws {
        let store = FileClientIdStore(directory: tempDir)
        await store.store("h", clientId: "first")
        await store.store("h", clientId: "second")

        let value = await store.load("h")
        XCTAssertEqual(value, "second")
    }

    func testHostIdWithUrlUnsafeCharactersIsPersisted() async throws {
        let store = FileClientIdStore(directory: tempDir)
        let trickyId: HostId = "copilot://tunnel/foo bar?baz=1"
        await store.store(trickyId, clientId: "tricky-id")
        let value = await store.load(trickyId)
        XCTAssertEqual(value, "tricky-id")
    }

    func testConcurrentStoresDoNotCorrupt() async throws {
        let store = FileClientIdStore(directory: tempDir)
        await withTaskGroup(of: Void.self) { group in
            for i in 0..<32 {
                group.addTask {
                    await store.store(HostId("h-\(i)"), clientId: "id-\(i)")
                }
            }
        }

        for i in 0..<32 {
            let value = await store.load(HostId("h-\(i)"))
            XCTAssertEqual(value, "id-\(i)", "lost write for host h-\(i)")
        }
    }

    func testFileIsRestrictedToOwnerWhenPossible() async throws {
        let store = FileClientIdStore(directory: tempDir)
        await store.store("h", clientId: "value")

        let url = tempDir.appendingPathComponent("h.clientid")
        // Assert unconditionally. This used to be wrapped in `if let attrs = try?`
        // with no `else`, so a failure to read the attributes passed the test
        // silently rather than failing it.
        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        let perms = try XCTUnwrap(attrs[.posixPermissions] as? NSNumber)
        XCTAssertEqual(perms.intValue & 0o777, 0o600,
                       "expected owner-only permissions on the persisted file")
        // This runs after `store()` returns, so on its own it cannot tell a file
        // created 0600 from one created loose and chmod'd afterwards. The two tests
        // below cover that difference directly.
    }

    /// The window itself. `Data.write(to:options:.atomic)` writes a temp file in the
    /// destination directory at the umask default and only chmods after the rename, so
    /// the client id is briefly readable by any local user. This watches the directory
    /// while a store runs and fails if ANY file in it is ever observed carrying group or
    /// other permission bits.
    ///
    /// Measured against the pre-fix implementation this observes the leak in 19 of 20
    /// runs; against the current one, 0 of 20. The asymmetry is deliberate — the
    /// assertion is "nothing was ever loose", which the current implementation satisfies
    /// by construction, so the test cannot fail spuriously. Only a real regression fails
    /// it, and the repeat count makes missing one vanishingly unlikely.
    func testClientIdIsNeverObservableAtLoosePermissionsDuringStore() async throws {
        for attempt in 0..<5 {
            let dir = tempDir.appendingPathComponent("attempt-\(attempt)")
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // 0755, and pre-existing: `ensureDirectory()` only applies 0700 on the branch
            // where it CREATES the directory, so this is the reachable configuration.
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: dir.path)

            let observer = LoosePermissionObserver()
            let stop = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                let fm = FileManager.default
                while stop.wait(timeout: .now()) == .timedOut {
                    guard let entries = try? fm.contentsOfDirectory(atPath: dir.path) else { continue }
                    for entry in entries {
                        let path = dir.appendingPathComponent(entry).path
                        guard let attrs = try? fm.attributesOfItem(atPath: path),
                              let perms = attrs[.posixPermissions] as? NSNumber,
                              perms.intValue & 0o077 != 0
                        else { continue }
                        observer.record("\(entry) was 0\(String(perms.intValue & 0o777, radix: 8))")
                    }
                }
            }

            // A payload large enough that the write is not instantaneous. 1 MB detects the
            // pre-fix leak in 20 of 20 trials; the value is about widening the window, not
            // about any realistic client-id length.
            let store = FileClientIdStore(directory: dir)
            await store.store("h", clientId: String(repeating: "s", count: 1_000_000))

            stop.signal()
            try await Task.sleep(nanoseconds: 20_000_000)

            XCTAssertNil(observer.first,
                         "client id was observable at loose permissions during store(): \(observer.first ?? "")")
        }
    }

    /// `open(2)`'s mode argument is masked by the process umask, so opening with 0600
    /// under a umask carrying 0o200 yields a read-only 0400 file. The explicit `fchmod`
    /// is what pins it to exactly 0600. Without that call this test fails with 0400.
    func testPersistedModeIsExactlyOwnerOnlyRegardlessOfUmask() async throws {
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: tempDir.path)

        // umask is process-wide; restore it immediately so no sibling test sees it.
        let saved = umask(0o277)
        let store = FileClientIdStore(directory: tempDir)
        await store.store("h", clientId: "value")
        umask(saved)

        let url = tempDir.appendingPathComponent("h.clientid")
        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        let perms = try XCTUnwrap(attrs[.posixPermissions] as? NSNumber)
        XCTAssertEqual(perms.intValue & 0o777, 0o600,
                       "expected exactly 0600 under a restrictive umask, got 0\(String(perms.intValue & 0o777, radix: 8))")
        let value = await store.load("h")
        XCTAssertEqual(value, "value", "a file the owner cannot read back is not a fix")
    }

    /// `rename(2)` carries the temp file's mode onto the destination, so a file
    /// left at loose permissions by an older build is repaired by the next store
    /// rather than kept.
    func testStoreRepairsPreExistingLoosePermissions() async throws {
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let url = tempDir.appendingPathComponent("h.clientid")
        XCTAssertTrue(FileManager.default.createFile(
            atPath: url.path,
            contents: Data("stale".utf8),
            attributes: [.posixPermissions: 0o644]))

        let store = FileClientIdStore(directory: tempDir)
        await store.store("h", clientId: "fresh")

        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        let perms = try XCTUnwrap(attrs[.posixPermissions] as? NSNumber)
        XCTAssertEqual(perms.intValue & 0o777, 0o600,
                       "a pre-existing 0644 client-id file should be repaired to 0600")
        let value = await store.load("h")
        XCTAssertEqual(value, "fresh")
    }

    /// A failed or interrupted store must not leave its temp file behind.
    func testNoTempFilesLeftBehind() async throws {
        let store = FileClientIdStore(directory: tempDir)
        for i in 0..<8 {
            await store.store(HostId("h-\(i)"), clientId: "id-\(i)")
        }
        let entries = try FileManager.default.contentsOfDirectory(atPath: tempDir.path)
        let temps = entries.filter { $0.hasSuffix(".tmp") }
        XCTAssertTrue(temps.isEmpty, "left temp files behind: \(temps)")
    }
}

/// Records the first loose-permission observation. A class with a lock rather than an
/// actor so the polling closure can write to it without an await.
private final class LoosePermissionObserver: @unchecked Sendable {
    private let lock = NSLock()
    private var _first: String?

    var first: String? {
        lock.lock(); defer { lock.unlock() }
        return _first
    }

    func record(_ description: String) {
        lock.lock(); defer { lock.unlock() }
        if _first == nil { _first = description }
    }
}
