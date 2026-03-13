import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import WebSocket from "ws";

// ── Types ───────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Persistent WebSocket state ──────────────────────────────────────────────

let ws: WebSocket | null = null;
let wsUrl: string | null = null;
let rpcIdCounter = 1;

/** Pending JSON-RPC responses keyed by id. */
const pendingRequests = new Map<string | number, PendingRequest>();

/** Notification inbox – array of JSON-RPC notification objects. */
let notificationInbox: unknown[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

function handleIncomingMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // silently drop non-JSON frames
  }

  // JSON-RPC response (has an "id")
  const id = msg.id as string | number | undefined;
  if (id != null && pendingRequests.has(id)) {
    const { resolve, timer } = pendingRequests.get(id)!;
    clearTimeout(timer);
    pendingRequests.delete(id);
    resolve(msg);
    return;
  }

  // Everything else is treated as a notification / server push
  notificationInbox.push(msg);
}

function drainNotifications(): unknown[] {
  const items = notificationInbox;
  notificationInbox = [];
  return items;
}

/**
 * Open (or re-open) a WebSocket connection to the given URL.
 * Returns a promise that resolves once the socket is open.
 */
function connectWebSocket(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Tear down previous connection if any
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }

    wsUrl = url;
    const socket = new WebSocket(url);

    socket.on("open", () => {
      ws = socket;
      resolve();
    });

    socket.on("message", (data: WebSocket.RawData) => {
      handleIncomingMessage(typeof data === "string" ? data : data.toString("utf-8"));
    });

    socket.on("close", () => {
      ws = null;
    });

    socket.on("error", (err: Error) => {
      if (ws === null) {
        // Connection attempt failed
        reject(new Error(`WebSocket connection failed: ${err.message}`));
      }
      // If already connected, just log – the close handler cleans up
    });
  });
}

/**
 * Send a JSON-RPC message and optionally wait for a response.
 * If the payload has an "id" field, we wait for the matching response.
 * Notifications (no "id") are fire-and-forget.
 */
function sendPayload(jsonStr: string, timeoutMs = 30_000): Promise<unknown> {
  if (!isConnected()) {
    throw new Error("Not connected. Call 'connect' first.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Payload is not valid JSON.");
  }

  ws!.send(jsonStr);

  // If it's a notification (no id), return immediately
  if (parsed.id == null) {
    return Promise.resolve(null);
  }

  const id = parsed.id as string | number;

  // Otherwise wait for the matching response
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timed out waiting for response to id ${id}`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ahp-websocket",
  version: "0.1.0",
});

// ── Tool: connect ───────────────────────────────────────────────────────────

server.tool(
  "connect",
  "Connect (or reconnect) to an Agent Host Protocol server over WebSocket. " +
  "This must be called before send or get_notifications.",
  {
    url: z.string().url().describe(
      "WebSocket URL of the AHP server, e.g. ws://localhost:3000"
    ),
  },
  async ({ url }) => {
    try {
      await connectWebSocket(url);
      return {
        content: [{ type: "text" as const, text: `Connected to ${url}` }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Connection failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: send ──────────────────────────────────────────────────────────────

server.tool(
  "send",
  "Send a JSON-RPC message to the connected AHP server. If the message has an " +
  "'id' field, waits for and returns the matching response. Also returns any " +
  "pending notifications that arrived by the time the response is received.",
  {
    payload: z.string().describe(
      "A complete JSON-RPC 2.0 message as a JSON string"
    ),
    timeout: z.number().optional().default(30).describe(
      "Max seconds to wait for a response (default 30)"
    ),
  },
  async ({ payload, timeout }) => {
    try {
      const response = await sendPayload(payload, timeout * 1000);
      const notifications = drainNotifications();
      const result = {
        response,
        notifications: notifications.length > 0 ? notifications : undefined,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Send failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_notifications ─────────────────────────────────────────────────

server.tool(
  "get_notifications",
  "Retrieve pending notifications from the AHP server. Optionally waits for " +
  "a specified number of seconds before returning, allowing notifications to " +
  "accumulate (useful for streaming deltas).",
  {
    wait: z.number().optional().default(0).describe(
      "Seconds to wait before draining the inbox (default 0 = immediate)"
    ),
  },
  async ({ wait }) => {
    if (wait > 0) {
      await sleep(wait * 1000);
    }
    const notifications = drainNotifications();
    return {
      content: [{
        type: "text" as const,
        text: notifications.length > 0
          ? JSON.stringify(notifications, null, 2)
          : "No pending notifications.",
      }],
    };
  }
);

// ── Tool: status ────────────────────────────────────────────────────────────

server.tool(
  "status",
  "Check the current WebSocket connection status.",
  {},
  async () => {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          connected: isConnected(),
          url: wsUrl,
          pendingRequests: pendingRequests.size,
          notificationsInInbox: notificationInbox.length,
        }, null, 2),
      }],
    };
  }
);

// ── Tool: next_id ───────────────────────────────────────────────────────────

server.tool(
  "next_id",
  "Get the next available JSON-RPC request id. Useful when constructing " +
  "request messages that need a unique id.",
  {},
  async () => {
    const id = rpcIdCounter++;
    return {
      content: [{ type: "text" as const, text: String(id) }],
    };
  }
);

// ── Start ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
