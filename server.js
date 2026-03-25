import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "dotenv";

config();

const app = express();
const PORT = 3001;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

app.use(express.json({ limit: "10mb" }));

app.post("/api/ai", async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
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
