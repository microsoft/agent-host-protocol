import XCTest
import AgentHostProtocol

final class AccountsTests: XCTestCase {
    private let agent = AccountConsumer.agent(AgentAccountConsumer(
        kind: .agent, provider: "copilot", resource: "https://api.example.com"
    ))

    func testAccountsSnapshotHasItsOwnStateVariant() throws {
        let snapshot = try roundTrip(Snapshot.self, """
            {"resource":"ahp-accounts://","state":{"accounts":[],"attempts":[]},"fromSeq":7}
            """)
        guard case .accounts(let state) = snapshot.state else {
            return XCTFail("Expected accounts state, not root state")
        }
        XCTAssertTrue(state.accounts.isEmpty)
        XCTAssertTrue(state.attempts.isEmpty)

        let root = try roundTrip(Snapshot.self, """
            {"resource":"ahp-root://","state":{"agents":[]},"fromSeq":7}
            """)
        guard case .root = root.state else {
            return XCTFail("Legacy root snapshot must remain root state")
        }
    }

    func testConsumersAndAttemptsRoundTrip() throws {
        let consumers = [
            #"{"kind":"agent","provider":"copilot","resource":"https://api.example.com"}"#,
            #"{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}"#,
            #"{"kind":"futureConsumer","selection":{"id":"future"}}"#,
        ]
        for raw in consumers {
            _ = try roundTrip(AccountConsumer.self, raw)
        }

        let outcomes = [
            #""status":"pending""#,
            #""status":"completed","accountId":"account-1""#,
            #""status":"failed","error":{"errorType":"Expired","message":"Attempt expired"}"#,
            #""status":"futureStatus","outcome":{"preserve":true}"#,
        ]
        for outcome in outcomes {
            _ = try roundTrip(AuthAttemptState.self, """
                {"id":"attempt-1","consumer":\(consumers[0]),"resource":"https://api.example.com",\(outcome)}
                """)
        }
    }

    func testBrokeredCommandsPreserveBindingsAndTokenMetadata() throws {
        for binding in [
            #"{"kind":"attempt","attemptId":"attempt-1"}"#,
            #"{"kind":"account","accountId":"account-1"}"#,
        ] {
            let params = try roundTrip(AuthenticateParams.self, """
                {"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque",
                 "expiresIn":300,"scopes":["read"],"binding":\(binding),"_meta":{"trace":"request-1"}}
                """)
            XCTAssertNotNil(params.binding)
            let request = AHPCommands.authenticate(id: 1, params: params)
            XCTAssertEqual(request.method, "authenticate")
            let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! NSDictionary
            XCTAssertEqual(
                (encoded["params"] as? NSDictionary)?["binding"] as? NSDictionary,
                try JSONSerialization.jsonObject(with: Data(binding.utf8)) as? NSDictionary
            )
        }

        XCTAssertThrowsError(try JSONDecoder().decode(AuthenticateParams.self, from: Data("""
            {"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque",
             "binding":{"kind":"futureBinding","accountId":"account-1"}}
            """.utf8)))
        let legacy = try roundTrip(AuthenticateParams.self, """
            {"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque"}
            """)
        XCTAssertNil(legacy.binding)
        _ = try roundTrip(AuthenticateResult.self, #"{"accountId":"account-1"}"#)
    }

    func testAuthBeginAndCapabilityAreExplicit() throws {
        let params = AuthBeginParams(
            channel: "ahp-accounts://",
            target: AuthBeginTarget(consumer: agent),
            flows: [AuthFlowSupport(kind: .clientBrokered)],
            accountId: "account-1"
        )
        let request = AHPCommands.authBegin(id: 2, params: params)
        XCTAssertEqual(request.method, "authBegin")
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! NSDictionary
        let wireParams = try XCTUnwrap(encoded["params"] as? NSDictionary)
        XCTAssertEqual(wireParams["channel"] as? String, "ahp-accounts://")
        XCTAssertEqual(wireParams["accountId"] as? String, "account-1")
        XCTAssertEqual(
            ((wireParams["target"] as? NSDictionary)?["consumer"] as? NSDictionary)?["provider"] as? String,
            "copilot"
        )
        _ = try roundTrip(AuthBeginResult.self, #"{"flow":"clientBrokered","attemptId":"attempt-1"}"#)
        let unknown = try roundTrip(AuthBeginResult.self, #"{"flow":"futureFlow","attemptId":"attempt-1"}"#)
        XCTAssertNotEqual(unknown.flow, .clientBrokered)

        let supported = try roundTrip(InitializeResult.self, """
            {"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
             "authentication":{"flows":[{"kind":"clientBrokered"}]}}
            """)
        XCTAssertEqual(supported.authentication?.flows.first?.kind, .clientBrokered)
        let future = try roundTrip(InitializeResult.self, """
            {"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
             "authentication":{"flows":[{"kind":"futureHostFlow"}]}}
            """)
        XCTAssertFalse(future.authentication?.flows.contains { $0.kind == .clientBrokered } == true)
        let legacy = try roundTrip(InitializeResult.self, """
            {"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[]}
            """)
        XCTAssertNil(legacy.authentication)
    }

    func testAccountsReducerUpsertsAndRemovesByIdWithoutChangingOtherAccounts() throws {
        let first = HostAccount(id: "a1", label: "First", removable: true, consumers: [agent])
        let second = HostAccount(id: "a2", label: "Second", removable: false, consumers: [])
        let initial = AccountsState(accounts: [first, second], attempts: [])
        let updated = HostAccount(id: "a1", label: "Updated", removable: true, consumers: [])
        let action = StateAction.accountSet(AccountSetAction(type: .accountSet, account: updated))
        let next = AHPAccountsReducer().applying(action: action, to: initial)
        XCTAssertEqual(next.accounts.map(\.id), ["a1", "a2"])
        XCTAssertEqual(next.accounts.map(\.label), ["Updated", "Second"])
        XCTAssertTrue(next.accounts[0].consumers.isEmpty)
        XCTAssertEqual(initial.accounts[0].label, "First")
        XCTAssertEqual(
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(next)) as? NSDictionary,
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(accountsReducer(state: initial, action: action))) as? NSDictionary
        )

        let removed = accountsReducer(
            state: next, action: .accountRemoved(AccountRemovedAction(type: .accountRemoved, id: "a1"))
        )
        XCTAssertEqual(removed.accounts.map(\.id), ["a2"])
        XCTAssertFalse(removed.accounts[0].removable)
        let absent = accountsReducer(
            state: removed, action: .accountRemoved(AccountRemovedAction(type: .accountRemoved, id: "missing"))
        )
        XCTAssertEqual(absent.accounts.map(\.id), ["a2"])
        let appended = accountsReducer(
            state: removed, action: .accountSet(AccountSetAction(type: .accountSet, account: first))
        )
        XCTAssertEqual(appended.accounts.map(\.id), ["a2", "a1"])
    }

    func testAttemptUpdatesPreserveAccountStateAndUnknownOutcomes() throws {
        let account = HostAccount(id: "a1", label: "Account", removable: true, consumers: [agent])
        let pending = AuthAttemptState.pending(AuthAttemptPendingState(
            id: "attempt-1", consumer: agent, resource: "https://api.example.com", status: .pending
        ))
        var state = accountsReducer(
            state: AccountsState(accounts: [account], attempts: []),
            action: .authAttemptSet(AuthAttemptSetAction(type: .authAttemptSet, attempt: pending))
        )
        let completed = AuthAttemptState.completed(AuthAttemptCompletedState(
            id: "attempt-1", consumer: agent, resource: "https://api.example.com",
            status: .completed, accountId: "a1"
        ))
        state = accountsReducer(
            state: state, action: .authAttemptSet(AuthAttemptSetAction(type: .authAttemptSet, attempt: completed))
        )
        XCTAssertEqual(state.attempts.count, 1)
        guard case .completed(let result) = state.attempts[0] else {
            return XCTFail("Expected completed admission")
        }
        XCTAssertEqual(result.accountId, "a1")

        let future = try JSONDecoder().decode(AuthAttemptState.self, from: Data("""
            {"id":"attempt-1","consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.com"},
             "resource":"https://api.example.com","status":"futureStatus","preserve":true}
            """.utf8))
        state = accountsReducer(
            state: state, action: .authAttemptSet(AuthAttemptSetAction(type: .authAttemptSet, attempt: future))
        )
        XCTAssertEqual(state.attempts.count, 1)
        guard case .unknown = state.attempts[0] else {
            return XCTFail("Unknown attempt status must not become a known outcome")
        }
        state = accountsReducer(
            state: state, action: .authAttemptRemoved(AuthAttemptRemovedAction(type: .authAttemptRemoved, id: "attempt-1"))
        )
        XCTAssertTrue(state.attempts.isEmpty)
        XCTAssertEqual(state.accounts.map(\.id), ["a1"])
        XCTAssertEqual(state.accounts[0].consumers.count, 1)
    }

    @discardableResult
    private func roundTrip<T: Codable>(_ type: T.Type, _ raw: String, file: StaticString = #filePath, line: UInt = #line) throws -> T {
        let data = Data(raw.utf8)
        let value = try JSONDecoder().decode(type, from: data)
        XCTAssertEqual(
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? NSDictionary,
            try JSONSerialization.jsonObject(with: data) as? NSDictionary,
            file: file, line: line
        )
        return value
    }
}
