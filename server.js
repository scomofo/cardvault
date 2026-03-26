import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";

config();

const app = express();
const PORT = 3001;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PROXY_TOKEN = process.env.PROXY_TOKEN;

if (!ANTHROPIC_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

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
  };
  next();
}

app.post("/api/ai", aiLimiter, authCheck, validateBody, async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
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

app.listen(PORT, () => {
  console.log(`CardVault API proxy running on http://localhost:${PORT}`);
});
