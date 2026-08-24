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
        // NOTE: this runs after `store()` returns, so it cannot distinguish a
        // file created 0600 from one created at the umask default and chmod'd
        // afterwards. The window this guards is a sub-millisecond race between
        // two syscalls and is not observable deterministically from in-process
        // polling; it is closed by construction in `store()` (open(2) with an
        // explicit mode) rather than by this assertion.
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
