// NativeReducer.swift — Protocol-based reducer pattern for AHP.
//
// Inspired by Swift by Sundell's reducer patterns and
// the Composable Architecture (TCA) from Point-Free.
//
// This provides an idiomatic Swift reducer abstraction using:
//   - A `Reducer` protocol with associated `State` and `Action` types
//   - `inout` mutation for ergonomic state updates
//   - Struct-based conformers for `RootReducer` and `SessionReducer`
//   - Composable design allowing reducer combination

import Foundation

// MARK: - Reducer Protocol

/// A pure function that transforms state in response to an action.
///
/// Conforming types encapsulate the logic for a specific state domain.
/// The `reduce(into:action:)` method mutates state in place using `inout`,
/// which is both ergonomic and efficient with Swift's copy-on-write semantics.
///
/// Example usage:
/// ```swift
/// let reducer = AHPSessionReducer()
/// var state = SessionState(...)
/// reducer.reduce(into: &state, action: .sessionReady(...))
/// ```
public protocol Reducer {
    associatedtype State
    associatedtype Action

    /// Applies an action to the given state, mutating it in place.
    func reduce(into state: inout State, action: Action)
}

// MARK: - AnyReducer (Type Erasure)

/// A type-erased reducer that wraps any `Reducer` conforming type.
///
/// Useful for storing reducers in collections or passing them as parameters
/// without exposing the concrete type.
public struct AnyReducer<State, Action>: Reducer {
    private let _reduce: (inout State, Action) -> Void

    public init<R: Reducer>(_ reducer: R) where R.State == State, R.Action == Action {
        self._reduce = reducer.reduce
    }

    public init(reduce: @escaping (inout State, Action) -> Void) {
        self._reduce = reduce
    }

    public func reduce(into state: inout State, action: Action) {
        _reduce(&state, action)
    }
}

// MARK: - CombinedReducer

/// Combines multiple reducers into one, applying them in sequence.
///
/// This enables composing smaller, focused reducers into a larger one.
/// Each reducer operates on the same state and action types.
public struct CombinedReducer<State, Action>: Reducer {
    private let reducers: [AnyReducer<State, Action>]

    public init(_ reducers: [AnyReducer<State, Action>]) {
        self.reducers = reducers
    }

    public func reduce(into state: inout State, action: Action) {
        for reducer in reducers {
            reducer.reduce(into: &state, action: action)
        }
    }
}

// MARK: - Root Reducer (Protocol-based)

/// Protocol-based root reducer for AHP root state.
///
/// Uses `inout` mutation for idiomatic Swift state updates instead of
/// creating copies with spread operators.
public struct AHPRootReducer: Reducer {
    public typealias State = RootState
    public typealias Action = StateAction

    public init() {}

    public func reduce(into state: inout RootState, action: StateAction) {
        switch action {
        case .rootAgentsChanged(let a):
            state.agents = a.agents

        case .rootActiveSessionsChanged(let a):
            state.activeSessions = a.activeSessions

        case .rootTerminalsChanged(let a):
            state.terminals = a.terminals

        case .rootConfigChanged(let a):
            guard var config = state.config else { return }
            config.values = a.replace == true ? a.config : config.values.merging(a.config) { _, new in new }
            state.config = config

        default:
            break
        }
    }
}


// MARK: - Chat Reducer (Protocol-based)

/// Protocol-based chat reducer for AHP chat state.
public struct AHPChatReducer: Reducer {
    public typealias State = ChatState
    public typealias Action = StateAction

    public init() {}

    public func reduce(into state: inout ChatState, action: StateAction) {
        state = chatReducer(state: state, action: action)
    }
}

// MARK: - Session Reducer (Protocol-based)

/// Protocol-based session reducer for AHP session state.
public struct AHPSessionReducer: Reducer {
    public typealias State = SessionState
    public typealias Action = StateAction

    public init() {}

    public func reduce(into state: inout SessionState, action: StateAction) {
        state = sessionReducer(state: state, action: action)
    }
}

// MARK: - Convenience Extensions

extension Reducer {
    /// Returns a new state by applying the action to a copy.
    /// Useful when you want value-semantics without mutating the original.
    public func applying(action: Action, to state: State) -> State {
        var copy = state
        reduce(into: &copy, action: action)
        return copy
    }
}

// MARK: - Timestamp Helper

private func currentTimestamp() -> Int {
    currentTimestampProvider()
}

// MARK: - Customization Helpers

func customizationId(_ c: Customization) -> String {
    switch c {
    case .plugin(let p): return p.id
    case .directory(let d): return d.id
    case .mcpServer(let m): return m.id
    }
}

func childId(_ c: ChildCustomization) -> String {
    switch c {
    case .agent(let x): return x.id
    case .skill(let x): return x.id
    case .prompt(let x): return x.id
    case .rule(let x): return x.id
    case .hook(let x): return x.id
    case .mcpServer(let x): return x.id
    }
}

func customizationChildren(_ c: Customization) -> [ChildCustomization]? {
    switch c {
    case .plugin(let p): return p.children
    case .directory(let d): return d.children
    case .mcpServer: return nil
    }
}

func setCustomizationChildren(_ c: inout Customization, _ children: [ChildCustomization]) {
    switch c {
    case .plugin(var p):
        p.children = children
        c = .plugin(p)
    case .directory(var d):
        d.children = children
        c = .directory(d)
    case .mcpServer:
        break
    }
}

func setCustomizationEnabled(_ c: inout Customization, _ enabled: Bool) {
    switch c {
    case .plugin(var p):
        p.enabled = enabled
        c = .plugin(p)
    case .directory(var d):
        d.enabled = enabled
        c = .directory(d)
    case .mcpServer(var m):
        m.enabled = enabled
        c = .mcpServer(m)
    }
}

func toggleCustomization(in list: inout [Customization], id: String, enabled: Bool) -> Bool {
    for i in list.indices {
        if customizationId(list[i]) == id {
            var entry = list[i]
            setCustomizationEnabled(&entry, enabled)
            list[i] = entry
            return true
        }
    }
    return false
}
