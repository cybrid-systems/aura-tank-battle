// Tiny bridge: static files plus a line-JSON Aura arena process.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const basePort = Number(process.env.AURA_TANK_PORT || 8090);
const aura = process.env.AURA_BIN || "aura";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const child = spawn(aura, ["run", "game/server.aura"], {
  cwd: root,
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
let pending = [];
let dead = false;

function failAll(reason) {
  dead = true;
  for (const p of pending) p.reject(new Error(reason));
  pending = [];
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  out += chunk;
  let i;
  while ((i = out.indexOf("\n")) >= 0) {
    const line = out.slice(0, i).trim();
    out = out.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("aura:", line);
      continue;
    }
    const p = pending.shift();
    if (p) p.resolve(msg);
    else console.error("aura unsolicited:", line);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) console.error(text);
});

child.on("error", (err) => failAll("aura failed to start: " + err.message));
child.on("exit", (code, signal) => failAll(`aura exited (${code ?? signal})`));

function call(req, timeoutMs = 30000) {
  if (dead) return Promise.reject(new Error("arena process is not running"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = pending.filter((p) => p !== entry);
      reject(new Error("arena timeout"));
    }, timeoutMs);
    const entry = {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    };
    pending.push(entry);
    child.stdin.write(JSON.stringify(req) + "\n");
  });
}

function send(res, status, body, type = "application/json") {
  const data = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, { "content-type": type, "cache-control": "no-cache" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function api(req, res, pathname) {
  let body = {};
  try {
    const text = await readBody(req);
    body = text ? JSON.parse(text) : {};
  } catch {
    send(res, 400, { error: "bad-json" });
    return;
  }
  try {
    if (pathname === "/api/tick") {
      send(res, 200, await call({ cmd: "tick", input: body.input || {} }));
      return;
    }
    if (pathname === "/api/new") {
      send(res, 200, await call({ cmd: "new", seed: body.seed ?? 42, levels: body.levels ?? 2 }));
      return;
    }
    if (pathname === "/api/evolve") {
      send(res, 200, await call({ cmd: "evolve", seed: body.seed ?? 42 }, 120000));
      return;
    }
    if (pathname === "/api/wish") {
      send(res, 200, await call({ cmd: "wish", theme: body.theme || "candy", seed: body.seed ?? 1 }, 120000));
      return;
    }
    if (pathname === "/api/keep") {
      send(res, 200, await call({ cmd: "keep", slot: body.slot ?? 0 }, 60000));
      return;
    }
    send(res, 404, { error: "not-found" });
  } catch (err) {
    send(res, 503, { error: String(err.message || err) });
  }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(web, rel);
  if (!file.startsWith(web + path.sep)) {
    send(res, 403, "forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      send(res, 404, "not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, buf, mime[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (req.method === "POST" && pathname.startsWith("/api/")) {
    await api(req, res, pathname);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res, pathname);
    return;
  }
  send(res, 405, "method not allowed", "text/plain; charset=utf-8");
});

let port = basePort;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && port - basePort < 20) {
    port += 1;
    server.listen(port, "127.0.0.1");
  } else {
    console.error(err);
    child.kill();
    process.exit(1);
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Aura Tank Battle → http://127.0.0.1:${port}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill();
    server.close(() => process.exit(0));
  });
}
