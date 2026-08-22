import { createServer } from "node:http";
import { parse } from "node:url";

import next from "next";
import pg from "pg";
import { WebSocketServer } from "ws";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const CHANNEL = "khaanz_pos";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function expectedSyncKey() {
  return (process.env.POS_SYNC_KEY || "").trim();
}

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url || "/", true);
  void handle(req, res, parsedUrl);
});

const wss = new WebSocketServer({ noServer: true });
const authed = new Set();

server.on("upgrade", (req, socket, head) => {
  const pathname = parse(req.url || "/", true).pathname;
  if (pathname !== "/api/pos-sync/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  const timer = setTimeout(() => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }, 8_000);

  ws.once("message", (raw) => {
    clearTimeout(timer);
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.close();
      return;
    }
    const key = expectedSyncKey();
    if (!key || typeof msg?.auth !== "string" || msg.auth !== key) {
      ws.close();
      return;
    }
    authed.add(ws);
    try {
      ws.send(JSON.stringify({ type: "hello", ok: true }));
    } catch {
      /* ignore */
    }
  });

  ws.on("pong", () => {});
  ws.on("close", () => authed.delete(ws));
  ws.on("error", () => authed.delete(ws));
});

setInterval(() => {
  for (const ws of authed) {
    if (ws.readyState !== 1) continue;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 25_000);

function broadcast(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const ws of authed) {
    if (ws.readyState !== 1) continue;
    try {
      ws.send(text);
    } catch {
      /* ignore */
    }
  }
}

async function startListen() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[pos-ws] DATABASE_URL missing; realtime notify disabled");
    return;
  }
  const client = new pg.Client({ connectionString: url });
  const connect = async () => {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    console.log(`[pos-ws] listening on ${CHANNEL}`);
  };
  client.on("notification", (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    broadcast(msg.payload);
  });
  client.on("error", (err) => {
    console.error("[pos-ws] postgres listener error:", err);
  });
  try {
    await connect();
  } catch (e) {
    console.error("[pos-ws] LISTEN failed:", e);
  }
}

await startListen();

server.listen(port, hostname, () => {
  console.log(`Khaanz ready on http://${hostname}:${port} (WebSocket /api/pos-sync/ws)`);
});
