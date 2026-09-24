/**
 * Chat Channel Commands — `createChat`, `moveChat`, and `disposeChat`.
 *
 * @module channels-chat/commands
 */

import type { URI } from '../common/state.js';
import type { BaseParams } from '../common/commands.js';
import type { Message, SideChatSelection } from './state.js';

// ─── createChat ──────────────────────────────────────────────────────────────

/**
 * How a new chat uses its source chat and turn.
 * @nonexhaustive
 */
export const enum ChatSourceKind {
  /** Copy source history through the referenced turn into the new chat. */
  Fork = 'fork',
  /** Supply source context without copying it into the new chat's visible history. */
  SideChat = 'sideChat',
}

/**
 * Copies source history through a completed turn into the new chat.
 */
export interface ForkChatSource {
  /** Discriminant */
  kind: ChatSourceKind.Fork;
  /** URI of the existing source chat. */
  chat: URI;
  /**
   * Completed turn identifier in the source chat.
   *
   * Content through this turn is copied into the new chat's visible `turns`.
   */
  turnId: string;
}

/**
 * Supplies source context to a new side chat without copying it into the side
 * chat's visible history.
 */
export interface SideChatSource {
  /** Discriminant */
  kind: ChatSourceKind.SideChat;
  /** URI of the existing source chat. */
  chat: URI;
  /**
   * Stable source-turn identifier in the source chat.
   *
   * Hosts resolve this id against the source chat's current `activeTurn` or its
   * retained `turns` when accepting `createChat`. If it names the current
   * active turn, the host snapshots the source chat's retained history plus
   * that turn's current user message and any partial assistant response already
   * available. Once that turn later becomes historical, it is still referenced
   * by this same identifier.
   */
  turnId: string;
  /**
   * Optional immutable selected-text snapshot to carry into the created side
   * chat's origin.
   *
   * When present, the host MUST snapshot and preserve this exact selection when
   * it accepts `createChat`; later source-turn deltas do not alter it.
   */
  selection?: SideChatSelection;
}

/**
 * Identifies a source chat for a new chat.
 */
export type ChatSource =
  | ForkChatSource
  | SideChatSource;

/**
 * Creates a new chat within a session.
 *
 * @category Commands
 * @method createChat
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface CreateChatParams extends BaseParams {
  /** Session URI containing the new chat. */
  channel: URI;
  /** Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`). */
  chat: URI;
  /** Optional initial message for the new chat. */
  initialMessage?: Message;
  /**
   * Optional source chat and source turn.
   *
   * The source chat MUST belong to this session. Clients MUST only request
   * `kind: "fork"` when the selected agent advertises
   * `capabilities.multipleChats.fork`, and `kind: "sideChat"` when the
   * selected agent advertises `capabilities.multipleChats.sideChat`. Both
   * source forms carry a stable top-level `turnId`. Forks target completed
   * turns. Side chats also carry a stable `turnId`, which the host resolves
   * against the source chat's current active turn or retained history. If it
   * resolves to the active turn, the host snapshots the currently available
   * partial response when accepting `createChat`. When
   * `source.kind === "sideChat"` and `source.selection` is present, the host
   * also snapshots and preserves that exact selected text in the created chat's
   * origin; any `responsePartId` there is provenance only, not a live range.
   */
  source?: ChatSource;
  /**
   * Initial working-directory subset for this chat. Every entry MUST be
   * present in the owning session's `workingDirectories`; the server MUST
   * reject any entry that is not. When absent, the chat inherits the full
   * session set. Forked chats (those whose `source.kind` is `"fork"`) inherit
   * the source chat's `workingDirectories`; this field is ignored for forks.
   *
   * A client MUST NOT supply this field unless the agent advertises
   * {@link AgentCapabilities.multipleWorkingDirectories}.
   */
  workingDirectories?: URI[];
}

// ─── moveChat ────────────────────────────────────────────────────────────────

/**
 * Destination kind for an atomic chat move.
 *
 * @category Commands
 * @nonexhaustive
 */
export const enum ChatMoveDestinationKind {
  /** Move the source chat under another chat. */
  Chat = 'chat',
  /** Promote the source chat into a newly allocated top-level session. */
  NewSession = 'newSession',
}

/** Moves a chat under another chat. */
export interface ChatMoveToChatDestination {
  /** Discriminant */
  kind: ChatMoveDestinationKind.Chat;
  /** Destination parent chat URI. */
  chat: URI;
}

/** Promotes a chat into a newly allocated top-level session. */
export interface ChatMoveToNewSessionDestination {
  /** Discriminant */
  kind: ChatMoveDestinationKind.NewSession;
}

/** Identifies the destination of an atomic chat move. */
export type ChatMoveDestination =
  | ChatMoveToChatDestination
  | ChatMoveToNewSessionDestination;

/**
 * Atomically changes a non-default chat's parent and, when necessary, owning
 * session.
 *
 * The source is the chat named by `channel`. A `chat` destination reparents it
 * under the destination chat and moves its descendant subtree into that chat's
 * session when the sessions differ. A `newSession` destination allocates a new
 * compatible session, promotes the source to its top level, and makes it that
 * session's default chat.
 *
 * The host MUST validate the complete operation before committing it. It MUST
 * reject a source subtree containing an owning session's default chat, any
 * active turn in the moved subtree, a destination equal to or below the
 * source, an unsupported capability, a destination on another host, or
 * incompatible source and destination provider/agent runtimes. Rejection MUST
 * leave every chat, session catalog, and root summary unchanged. Unknown
 * resources use `NotFound`, active turns use `TurnInProgress`, and validation,
 * capability, compatibility, cycle, and idempotency-key mismatches use
 * `InvalidParams`.
 *
 * On success the host commits the hierarchy, ownership, and every moved-chat
 * URI replacement as one transaction before publishing synchronization
 * messages. Every moved descendant's `parentChat` MUST name the authoritative
 * post-move URI of its moved parent. `ChatOrigin` remains unchanged, including
 * historical chat URIs that no longer resolve after replacement.
 * It then updates affected session catalogs with `session/chatRemoved`,
 * `session/chatAdded`, and `session/chatUpdated`, dispatches
 * `chat/parentChanged` on preserved chat channels, and emits `chat/moved` on
 * previous moved chat channels when subscribers must follow authoritative
 * result resources.
 *
 * @category Commands
 * @method moveChat
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface MoveChatParams extends BaseParams {
  /** Source chat URI. */
  channel: URI;
  /** Atomic move destination. */
  destination: ChatMoveDestination;
  /**
   * Durable client-generated idempotency key.
   *
   * Retrying the same logical request with the same `requestId`, source, and
   * destination MUST return the original {@link MoveChatResult}, including
   * after reconnect or an uncertain response. Reusing the key with a different
   * source or destination MUST be rejected with `InvalidParams`.
   */
  requestId: string;
}

/**
 * Authoritative URI mapping for one chat in a moved subtree.
 *
 * @category Commands
 */
export interface MovedChatResource {
  /** Chat URI before the move. */
  previousChat: URI;
  /** Authoritative chat URI after the move. */
  chat: URI;
}

/**
 * Authoritative resources before and after an atomic chat move.
 *
 * `previousChat` and `chat` identify the requested root and equal the first
 * entry of `movedChats`. They are retained as a convenience for callers that
 * only need to follow the requested chat. `movedChats` is the exhaustive
 * authoritative mapping for the complete moved subtree.
 *
 * @category Commands
 */
export interface MoveChatResult {
  /** Owning session URI before the move. */
  previousSession: URI;
  /** Source chat URI before the move. */
  previousChat: URI;
  /** Authoritative owning session URI after the move. */
  session: URI;
  /** Authoritative requested root chat URI after the move. */
  chat: URI;
  /**
   * Exhaustive URI mapping for every chat in the moved subtree, including
   * entries whose URI was preserved.
   *
   * The first entry MUST map `previousChat` to `chat`. Remaining entries are
   * ordered in deterministic depth-first pre-order: every parent precedes its
   * descendants, and siblings retain their order from the source session's
   * `chats` catalog. Clients MUST apply the complete mapping atomically and
   * MUST NOT infer replacements for chats absent from this list.
   */
  movedChats: MovedChatResource[];
}

// ─── disposeChat ─────────────────────────────────────────────────────────────

/**
 * Disposes a chat and cleans up server-side resources.
 *
 * @category Commands
 * @method disposeChat
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface DisposeChatParams extends BaseParams {}
