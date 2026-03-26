import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";
import { initDB } from "./src/server/database.js";
import { seedReferenceData } from "./src/server/seed.js";
import { registerRoutes } from "./src/server/routes.js";

config();

const app = express();
const PORT = 3001;
let anthropicKey = process.env.ANTHROPIC_API_KEY || "";
const PROXY_TOKEN = process.env.PROXY_TOKEN;

if (!anthropicKey) {
  console.warn("No ANTHROPIC_API_KEY in .env — AI features disabled until key is set via UI");
}

// Initialize database and seed reference data
initDB();
seedReferenceData();

const ALLOWED_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
];
const MAX_TOKENS_CAP = 4000;

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// CORS — only allow the Vite dev server
app.use(cors({ origin: "http://localhost:3000" }));

// Body parser with reduced limit
app.use(express.json({ limit: "2mb" }));

// Rate limiting on AI endpoint
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — try again in a minute" },
});

// Optional bearer token auth
function authCheck(req, res, next) {
  if (!PROXY_TOKEN) return next();
  const header = req.headers.authorization;
  if (header !== `Bearer ${PROXY_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

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
    max_tokens: Math.min(parseInt(max_tokens) || 800, MAX_TOKENS_CAP),
    messages,
    ...(system && { system }),
    ...(req.body.tools && { tools: req.body.tools }),
  };
  next();
}

// --- API Key management ---
// GET: check if key is configured (never returns the actual key)
app.get("/api/ai/status", authCheck, (req, res) => {
  res.json({
    configured: !!anthropicKey,
    masked: anthropicKey ? anthropicKey.slice(0, 7) + "..." + anthropicKey.slice(-4) : null,
  });
});

// POST: set the API key at runtime
app.post("/api/ai/key", authCheck, (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== "string" || !key.startsWith("sk-ant-")) {
    return res.status(400).json({ error: "Invalid API key format. Must start with sk-ant-" });
  }
  anthropicKey = key.trim();
  res.json({ configured: true, masked: anthropicKey.slice(0, 7) + "..." + anthropicKey.slice(-4) });
});

// --- AI proxy ---
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
  } catch (e) {
    console.error("Proxy error:", e);
    res.status(502).json({ error: "AI proxy failed" });
  }
});

// --- CV Service proxy (for production builds without Vite proxy) ---
app.post("/api/cv/analyze", express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const response = await fetch("http://localhost:8000/analyze-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: "CV service unavailable", details: e.message });
  }
});

app.get("/api/cv/health", async (_req, res) => {
  try {
    const response = await fetch("http://localhost:8000/health");
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ status: "offline" });
  }
});

// Register database REST API routes
registerRoutes(app);

app.listen(PORT, () => {
  console.log(`CardVault API running on http://localhost:${PORT}`);
  if (!anthropicKey) console.log("  AI features: disabled (no API key — set via Settings UI)");
});
