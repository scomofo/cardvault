// All AI calls go through the local proxy to keep the API key server-side
const API_BASE = "/api/ai";

async function aiCall(payload) {
  try {
    const r = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`AI proxy error ${r.status}: ${err}`);
    }
    const d = await r.json();
    const text = (d.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "")
      .replace(/```json|```/g, "")
      .trim();
    return text;
  } catch (e) {
    console.error("AI call failed:", e);
    return null;
  }
}

export async function aiRecognize(imageDataUrl) {
  const mt = imageDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const b64 = imageDataUrl.split(",")[1];
  const text = await aiCall({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
        { type: "text", text: 'Identify this trading card. Return ONLY JSON: {"name":"","set":"","year":"","number":"","rarity":"","parallel":"","type":"sports|pokemon|mtg|yugioh|one_piece|lorcana|other","confidence":"high|medium|low"}' },
      ],
    }],
  });
  try { return JSON.parse(text); } catch { return null; }
}

export async function aiPrice(query) {
  const text = await aiCall({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `Search trading card "${query}" for real eBay/TCGplayer sold prices. Return ONLY JSON: {"cardName":"","results":[{"title":"","price":0,"source":"eBay Sold","date":"Mar 2026","url":"https://..."}],"priceEstimate":{"low":0,"mid":0,"high":0},"priceHistory":[{"month":"Oct 2025","avgPrice":0}],"cardInfo":{"set":"","year":"","number":"","rarity":"","type":"sports"}}`,
    }],
  });
  try { return JSON.parse(text); } catch { return null; }
}

export async function aiGradePredict(imageDataUrl) {
  const mt = imageDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const b64 = imageDataUrl.split(",")[1];
  const text = await aiCall({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
        { type: "text", text: 'Expert card grader: analyze this card photo. Evaluate centering, corners, edges, surface. Return ONLY JSON: {"predictedGrade":"9","confidence":"medium","centering":{"score":"9","notes":""},"corners":{"score":"9","notes":""},"edges":{"score":"9.5","notes":""},"surface":{"score":"9","notes":""},"summary":"","recommendation":""}' },
      ],
    }],
  });
  try { return JSON.parse(text); } catch { return null; }
}
