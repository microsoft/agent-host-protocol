// ToolCallStateExtensions.swift — Shared helpers for ToolCallState.
//
// Extracts common patterns used by both the free-function and protocol-based
// reducers, following the principle of small focused types over duplicated logic.

import Foundation

// MARK: - Tool Call ID Accessor

extension ToolCallState {
    /// The unique identifier for this tool call, regardless of its lifecycle state.
    /// Returns an empty string for unknown future variants (forward-compat).
    public var toolCallId: String {
        switch self {
        case .streaming(let s): return s.toolCallId
        case .pendingConfirmation(let s): return s.toolCallId
        case .running(let s): return s.toolCallId
        case .pendingResultConfirmation(let s): return s.toolCallId
        case .completed(let s): return s.toolCallId
        case .cancelled(let s): return s.toolCallId
        case .unknown: return ""
        }
    }
}

// MARK: - Common Base Fields

/// Common identity fields shared across all ToolCallState variants.
public struct ToolCallBaseFields: Sendable {
    public let toolCallId: String
    public let toolName: String
    public let displayName: String
    public let contributor: ToolCallContributor?
    public let meta: [String: AnyCodable]?
}

extension ToolCallState {
    /// Extracts the common base fields from any tool call state variant.
    /// Calling this on `.unknown` is a programming error: all callers
    /// guard the known variants before accessing baseFields.
    public var baseFields: ToolCallBaseFields {
        switch self {
        case .streaming(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .pendingConfirmation(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .running(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .pendingResultConfirmation(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .completed(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .cancelled(let s):
            return ToolCallBaseFields(toolCallId: s.toolCallId, toolName: s.toolName,
                                       displayName: s.displayName, contributor: s.contributor, meta: s.meta)
        case .unknown:
            // All callers guard on a known variant before reaching here.
            preconditionFailure("baseFields called on unknown ToolCallState variant")
        }
    }
}

// MARK: - Response Part ID Accessor

extension ResponsePart {
    /// The identifier for this response part, used for targeted updates.
    /// Returns `nil` for parts that don't carry an ID (e.g. contentRef, unknown future parts).
    public var partId: String? {
        switch self {
        case .markdown(let m): return m.id
        case .reasoning(let r): return r.id
        case .toolCall(let t): return t.toolCall.toolCallId
        case .contentRef: return nil
        case .systemNotification: return nil
        case .unknown: return nil
        }
    }
}
