import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";
import { networkInterfaces } from "node:os";
import { initDB, get as dbGet, run as dbRun } from "./src/server/database.js";
import { seedReferenceData } from "./src/server/seed.js";
import { registerRoutes } from "./src/server/routes/index.js";
import { authCheck, requireProtectedConfigWrite } from "./src/server/auth.js";

config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const CV_SERVICE_URL = (process.env.CV_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

let anthropicKey = process.env.ANTHROPIC_API_KEY || "";

// Initialize database and seed reference data
initDB();
seedReferenceData();

// Load persisted API key from settings table (survives restarts)
if (!anthropicKey) {
  try {
    const row = dbGet("SELECT value FROM settings WHERE key = ?", ["anthropic_api_key"]);
    if (row?.value) {
      anthropicKey = row.value;
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

function isPrivateIpv4(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);

  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isAllowedDevOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (!["http:", "https:"].includes(protocol)) return false;

    const normalizedHost = hostname.toLowerCase();
    return (
      normalizedHost === "localhost" ||
      normalizedHost === "127.0.0.1" ||
      normalizedHost === "::1" ||
      normalizedHost.endsWith(".local") ||
      isPrivateIpv4(normalizedHost)
    );
  } catch {
    return false;
  }
}

function getNetworkUrls(port) {
  const urls = [];

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }

  return urls;
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

// Body parser with reduced limit
app.use(express.json({ limit: "2mb" }));

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
  if (!key || typeof key !== "string" || !key.startsWith("sk-ant-")) {
    return res.status(400).json({ error: "Invalid API key format. Must start with sk-ant-" });
  }

  anthropicKey = key.trim();

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
app.post("/api/cv/analyze", express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const response = await fetch(`${CV_SERVICE_URL}/analyze-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(502).json({ error: "CV service unavailable", details: error.message });
  }
});

app.get("/api/cv/health", async (_req, res) => {
  try {
    const response = await fetch(`${CV_SERVICE_URL}/health`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ status: "offline" });
  }
});

registerRoutes(app);

app.listen(PORT, HOST, () => {
  console.log(`CardVault API running on http://localhost:${PORT}`);
  for (const url of getNetworkUrls(PORT)) {
    console.log(`  Network: ${url}`);
  }
  console.log(`  CV service: ${CV_SERVICE_URL}`);
  if (!anthropicKey) console.log("  AI features: disabled (no API key - set via Settings UI)");
});
