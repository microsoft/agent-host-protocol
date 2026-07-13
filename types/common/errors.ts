/**
 * Error Codes — Source of truth for all AHP error code definitions.
 *
 * @module common/errors
 * @description AHP uses JSON-RPC 2.0 error codes. In addition to the standard
 * JSON-RPC codes, AHP defines application-specific error codes in the `-32000`
 * to `-32099` range.
 */

import type { ProtectedResourceMetadata } from './state.js';
import type { ResourceRequestParams } from './commands.js';

// ─── Standard JSON-RPC Codes ─────────────────────────────────────────────────

/**
 * Standard JSON-RPC 2.0 error codes.
 *
 * @category Standard JSON-RPC Codes
 */
export const JsonRpcErrorCodes = {
  /** Invalid JSON */
  ParseError: -32700,
  /** Not a valid JSON-RPC request */
  InvalidRequest: -32600,
  /** Unknown method name */
  MethodNotFound: -32601,
  /** Invalid method parameters */
  InvalidParams: -32602,
  /** Unspecified server error */
  InternalError: -32603,
} as const;

// ─── AHP Application Codes ──────────────────────────────────────────────────

/**
 * AHP application-specific error codes.
 *
 * @category AHP Application Codes
 * @version 1
 */
export const AhpErrorCodes = {
  /** The referenced session URI does not exist */
  SessionNotFound: -32001,
  /** The requested agent provider is not registered */
  ProviderNotFound: -32002,
  /** A session with the given URI already exists */
  SessionAlreadyExists: -32003,
  /** The operation requires no active turn, but one is in progress */
  TurnInProgress: -32004,
  /**
   * The server cannot speak any of the protocol versions offered by the
   * client in `InitializeParams.protocolVersions`. The `data` field of the
   * JSON-RPC error MAY be an `UnsupportedProtocolVersionErrorData` advertising
   * the protocol versions the server is willing to speak.
   */
  UnsupportedProtocolVersion: -32005,
  /** The requested content URI does not exist */
  ContentNotFound: -32006,
  /**
   * A command failed because the client has not authenticated for a required
   * protected resource. The `data` field of the JSON-RPC error MUST be an
   * `AuthRequiredErrorData` describing the resources that require
   * authentication.
   *
   * @see {@link /specification/authentication | Authentication}
   */
  AuthRequired: -32007,
  /** The requested file, folder, or URI does not exist */
  NotFound: -32008,
  /**
   * The client is not permitted to access the requested resource.
   *
   * Servers SHOULD return this when a client attempts to read or browse
   * a path outside the allowed set (e.g. outside the session's working
   * directory or workspace roots).
   *
   * The `data` field of the JSON-RPC error MAY be a
   * `PermissionDeniedErrorData` advertising a `resourceRequest` that, if
   * granted, would unlock the operation.
   */
  PermissionDenied: -32009,
  /**
   * The target resource already exists and the operation does not allow
   * overwriting (e.g. `resourceWrite` with `createOnly: true`).
   */
  AlreadyExists: -32010,
  /**
   * An optimistic-concurrency precondition failed.
   *
   * Returned when a request carries a precondition token that no longer
   * matches the receiver's current state — for example, `resourceWrite`
   * with an `ifMatch` etag that has been superseded by a concurrent
   * write. Callers SHOULD re-read the resource (e.g. via
   * `resourceResolve`) and decide whether to retry the operation with the
   * fresh token or surface the conflict to the user.
   */
  Conflict: -32011,
  /**
   * A canvas provider request (`canvasOpen`, `canvasInvokeOperation`, or
   * `canvasClose`) failed. The `data` field of the JSON-RPC error MUST be a
   * {@link CanvasProviderErrorData} carrying the provider-defined
   * `{ code, message }` — for example a `canvas_action_no_handler` code when
   * the provider declared the canvas but has no handler for the requested
   * operation, or `canvas_provider_unavailable` when the provider is
   * disconnected.
   */
  CanvasProviderError: -32012,
} as const;

/** Union type of all AHP application error codes. */
export type AhpErrorCode = (typeof AhpErrorCodes)[keyof typeof AhpErrorCodes];

/** Union type of all JSON-RPC error codes. */
export type JsonRpcErrorCode = (typeof JsonRpcErrorCodes)[keyof typeof JsonRpcErrorCodes];

// ─── Error Detail Types ──────────────────────────────────────────────────────

/**
 * Details carried in the `data` field of an `AuthRequired` (-32007) error.
 *
 * Wraps the protected resource list in `{ resources: [...] }` rather than
 * returning a bare array, so additional fields can be added in future
 * versions without breaking the wire shape.
 *
 * @category Error Details
 * @version 1
 */
export interface AuthRequiredErrorData {
  /** Protected resources that require authentication. */
  resources: ProtectedResourceMetadata[];
}

/**
 * Details carried in the `data` field of a `PermissionDenied` (-32009) error.
 *
 * The receiver MAY advertise a `resourceRequest` payload describing the
 * access that, if granted, would unlock the operation. The caller MAY then
 * issue `resourceRequest` with that payload to negotiate access.
 *
 * @category Error Details
 * @version 1
 */
export interface PermissionDeniedErrorData {
  /**
   * The resource access that, if granted via `resourceRequest`, would unlock
   * the operation. Omitted when no specific access grant would resolve the
   * denial (for example, when the resource is fundamentally inaccessible).
   */
  request?: ResourceRequestParams;
}

/**
 * Details carried in the `data` field of an `UnsupportedProtocolVersion`
 * (-32005) error.
 *
 * @category Error Details
 * @version 1
 */
export interface UnsupportedProtocolVersionErrorData {
  /**
   * Protocol versions the server is willing to speak.
   *
   * Each entry is either a [SemVer](https://semver.org) `MAJOR.MINOR.PATCH`
   * string (e.g. `"0.1.0"`) or a [SemVer range](https://semver.org/#spec-item-11)
   * constraint (e.g. `">=0.1.0 <0.3.0"` or `"^0.2.0"`).
   */
  supportedVersions: string[];
}

/**
 * Details carried in the `data` field of a `CanvasProviderError` (-32012)
 * error.
 *
 * The `code` is a provider-defined string (opaque to AHP) identifying the
 * failure — observed values include `canvas_action_no_handler` and
 * `canvas_provider_unavailable`. `message` is a human-readable description.
 *
 * @category Error Details
 * @version 1
 */
export interface CanvasProviderErrorData {
  /** Provider-defined error code identifying the failure. */
  code: string;
  /** Human-readable error message. */
  message: string;
}

/**
 * Maps each AHP error code that carries structured `data` to the type of
 * that data.
 *
 * Error codes not present in this map either have no `data` payload or
 * carry an unspecified payload that callers SHOULD treat as `unknown`.
 *
 * @category Error Details
 * @version 1
 */
export interface AhpErrorDetailsMap {
  [AhpErrorCodes.AuthRequired]: AuthRequiredErrorData;
  [AhpErrorCodes.PermissionDenied]: PermissionDeniedErrorData;
  [AhpErrorCodes.UnsupportedProtocolVersion]: UnsupportedProtocolVersionErrorData;
  [AhpErrorCodes.CanvasProviderError]: CanvasProviderErrorData;
}

/** AHP error codes that carry a structured `data` payload. */
export type AhpErrorCodeWithData = keyof AhpErrorDetailsMap;

/**
 * A typed JSON-RPC error object whose `data` is narrowed by `code`.
 *
 * Distributes over the `AhpErrorCode` union so narrowing on `code` reveals
 * the precise `data` type. For codes listed in {@link AhpErrorDetailsMap}
 * `data` is required; for all other codes `data` is an optional `unknown`.
 *
 * ```ts
 * function handle(err: AhpError) {
 *   if (err.code === AhpErrorCodes.PermissionDenied) {
 *     err.data.request; // typed as ResourceRequestParams | undefined
 *   }
 * }
 * ```
 *
 * @category Error Details
 * @version 1
 */
export type AhpError<C extends AhpErrorCode = AhpErrorCode> =
  C extends AhpErrorCode
    ? C extends keyof AhpErrorDetailsMap
      ? {
        /** The error code. */
        readonly code: C;
        /** Human-readable error message. */
        readonly message: string;
        /** Structured detail payload mandated by `AhpErrorDetailsMap`. */
        readonly data: AhpErrorDetailsMap[C];
      }
      : {
        /** The error code. */
        readonly code: C;
        /** Human-readable error message. */
        readonly message: string;
        /** Optional, unspecified detail payload. */
        readonly data?: unknown;
      }
    : never;
