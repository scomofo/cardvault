import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
import { initDB, get as dbGet, run as dbRun } from "./src/server/database.js";
import { seedReferenceData } from "./src/server/seed.js";
import { registerRoutes } from "./src/server/routes/index.js";
import { authCheck, requireProtectedConfigWrite } from "./src/server/auth.js";
import { getTrustedDevHosts, isAllowedDevOrigin } from "./src/server/networkTrust.js";
import { getAnthropicApiKey, normalizeAnthropicApiKey } from "./src/server/runtimeConfig.js";

config({ path: process.env.CARDVAULT_ENV_FILE || undefined });

const app = express();
const PORT = Number(process.env.PORT || 3001);
// Loopback by default so a fresh checkout never exposes the API (and its
// settings, which include API keys) to the LAN. Set HOST=0.0.0.0 to opt in
// to phone scanning over Wi-Fi (see .env.example).
const HOST = process.env.HOST || "127.0.0.1";
const CV_SERVICE_URL = (process.env.CV_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

let anthropicKey = getAnthropicApiKey();

// Initialize database and seed reference data
initDB();
seedReferenceData();

// Load persisted API key from settings table (survives restarts)
if (!anthropicKey) {
  try {
    const row = dbGet("SELECT value FROM settings WHERE key = ?", ["anthropic_api_key"]);
    const persistedKey = normalizeAnthropicApiKey(row?.value);
    if (persistedKey) {
      anthropicKey = persistedKey;
      console.log("Loaded API key from database");
    }
  } catch {
    // settings table may not exist yet on first run
  }
}

if (!anthropicKey) {
  console.warn("No ANTHROPIC_API_KEY - AI features disabled until key is set via UI");
}

const ALLOWED_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
];
const MAX_TOKENS_CAP = 4000;
const CV_ANALYZE_TIMEOUT_MS = 30_000;
const CV_HEALTH_TIMEOUT_MS = 5_000;

function getNetworkUrls(port) {
  return [...getTrustedDevHosts()]
    .filter((host) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))
    .map((host) => `http://${host}:${port}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Allow local and private-network origins so the iPhone can hit the dev server on the MacBook.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedDevOrigin(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      return callback(null, false);
    },
  })
);

// Card photos are sent to these local analysis routes as base64 JSON payloads.
app.use("/api/ai", express.json({ limit: "25mb" }));
app.use("/api/cv/analyze", express.json({ limit: "5mb" }));
app.use(express.json({ limit: "2mb" }));

// When PROXY_TOKEN is configured (API-only deployments), require bearer auth
// for every /api route. Without a token this is a no-op. The built-in UI is
// served as static files (not under /api), and README documents leaving
// PROXY_TOKEN blank when using the built-in UI.
app.use("/api", authCheck);

// Rate limiting on AI endpoint
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests - try again in a minute" },
});

// Validate and sanitize request body before forwarding
function validateBody(req, res, next) {
  const { model, max_tokens, messages, system } = req.body;

  if (!model || !ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(", ")}` });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  req.sanitizedBody = {
    model,
    max_tokens: Math.min(parseInt(max_tokens, 10) || 800, MAX_TOKENS_CAP),
    messages,
    ...(system && { system }),
    ...(req.body.tools && { tools: req.body.tools }),
  };
  next();
}

// GET: check if key is configured (never returns the actual key)
app.get("/api/ai/status", authCheck, (_req, res) => {
  res.json({
    configured: !!anthropicKey,
    masked: anthropicKey ? anthropicKey.slice(0, 7) + "..." + anthropicKey.slice(-4) : null,
  });
});

// POST: set the API key at runtime and persist to database
app.post("/api/ai/key", requireProtectedConfigWrite, (req, res) => {
  const { key } = req.body;
  const normalizedKey = normalizeAnthropicApiKey(key);
  if (!normalizedKey || !normalizedKey.startsWith("sk-ant-")) {
    return res.status(400).json({ error: "Invalid API key format. Must start with sk-ant-" });
  }

  anthropicKey = normalizedKey;

  try {
    dbRun(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ["anthropic_api_key", anthropicKey]
    );
  } catch (error) {
    console.warn("Failed to persist API key:", error.message);
  }

  res.json({ configured: true, masked: anthropicKey.slice(0, 7) + "..." + anthropicKey.slice(-4) });
});

// AI proxy
app.post("/api/ai", aiLimiter, authCheck, validateBody, async (req, res) => {
  if (!anthropicKey) {
    return res.status(503).json({ error: "No API key configured. Add your Anthropic API key in Settings." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.sanitizedBody),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(502).json({ error: "AI proxy failed" });
  }
});

// CV service proxy for production builds without the Vite proxy.
app.post("/api/cv/analyze", async (req, res) => {
  try {
    const response = await fetchWithTimeout(`${CV_SERVICE_URL}/analyze-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    }, CV_ANALYZE_TIMEOUT_MS);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: "CV service timeout", details: "CV analysis took too long" });
    }
    res.status(502).json({ error: "CV service unavailable", details: error.message });
  }
});

app.get("/api/cv/health", async (_req, res) => {
  try {
    const response = await fetchWithTimeout(`${CV_SERVICE_URL}/health`, {}, CV_HEALTH_TIMEOUT_MS);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ status: "offline" });
  }
});

registerRoutes(app);

// Serve the built React UI when present (production / Electron `.app` mode).
const distDir = pathResolve(process.env.CARDVAULT_DIST_DIR || "./dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(pathResolve(distDir, "index.html"));
  });
}

export function startServer({ port = PORT, host = HOST } = {}) {
  return new Promise((resolveStart, rejectStart) => {
    const server = app.listen(port, host);
    // Without this, EADDRINUSE (a leftover CardVault process, another app
    // on the port) leaves the promise pending forever — the Electron shell
    // awaits it before showing a window, so the app would hang with no
    // window and no error.
    server.once("error", rejectStart);
    server.once("listening", () => {
      server.off("error", rejectStart);
      console.log(`CardVault API running on http://localhost:${port}`);
      for (const url of getNetworkUrls(port)) {
        console.log(`  Network: ${url}`);
      }
      console.log(`  CV service: ${CV_SERVICE_URL}`);
      if (!anthropicKey) console.log("  AI features: disabled (no API key - set via Settings UI)");
      resolveStart(server);
    });
  });
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${pathResolve(process.argv[1])}`).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  startServer().then((server) => {
    // Exit via process.exit so exit hooks run (e.g. NODE_V8_COVERAGE flushes
    // coverage data when integration tests terminate the server).
    const shutdown = () => {
      server.close(() => process.exit(0));
      server.closeAllConnections?.();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }).catch((error) => {
    console.error(`Failed to start CardVault API on ${HOST}:${PORT}:`, error.message);
    process.exit(1);
  });
}

export { app };
