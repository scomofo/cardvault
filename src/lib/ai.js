// All AI calls go through the local proxy to keep the API key server-side
const API_BASE = "/api/ai";

function parseMediaType(dataUrl) {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+)/);
  return m ? m[1] : "image/jpeg";
}

function safeParse(text) {
  if (!text) return { error: true, message: "Empty AI response", raw: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { error: true, message: "Failed to parse AI response as JSON", raw: text };
  }
}

async function aiCall(payload) {
  try {
    const r = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.text();
      return { error: true, message: `AI proxy error ${r.status}: ${err}`, raw: "" };
    }
    const d = await r.json();
    const text = (d.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "")
      .replace(/```json|```/g, "")
      .trim();
    return safeParse(text);
  } catch (e) {
    console.error("AI call failed:", e);
    return { error: true, message: e.message || "Network error", raw: "" };
  }
}

function validateRecognizeResult(data) {
  if (data.error) return null;
  return {
    name: String(data.name || ""),
    set: String(data.set || ""),
    year: String(data.year || ""),
    number: String(data.number || ""),
    rarity: String(data.rarity || ""),
    parallel: String(data.parallel || ""),
    type: String(data.type || "other"),
    confidence: String(data.confidence || "low"),
  };
}

function validatePriceResult(data) {
  if (data.error) return null;
  return {
    cardName: String(data.cardName || ""),
    results: Array.isArray(data.results) ? data.results.map((r) => ({
      title: String(r.title || ""),
      price: Number(r.price) || 0,
      source: String(r.source || ""),
      date: String(r.date || ""),
      url: String(r.url || ""),
    })) : [],
    priceEstimate: {
      low: Number(data.priceEstimate?.low) || 0,
      mid: Number(data.priceEstimate?.mid) || 0,
      high: Number(data.priceEstimate?.high) || 0,
    },
    priceHistory: Array.isArray(data.priceHistory) ? data.priceHistory.map((h) => ({
      month: String(h.month || ""),
      avgPrice: Number(h.avgPrice) || 0,
    })) : [],
    cardInfo: {
      set: String(data.cardInfo?.set || ""),
      year: String(data.cardInfo?.year || ""),
      number: String(data.cardInfo?.number || ""),
      rarity: String(data.cardInfo?.rarity || ""),
      type: String(data.cardInfo?.type || "sports"),
    },
  };
}

function validateGradeResult(data) {
  if (data.error) return null;
  return {
    predictedGrade: String(data.predictedGrade || ""),
    confidence: String(data.confidence || "low"),
    centering: { score: String(data.centering?.score || ""), notes: String(data.centering?.notes || "") },
    corners: { score: String(data.corners?.score || ""), notes: String(data.corners?.notes || "") },
    edges: { score: String(data.edges?.score || ""), notes: String(data.edges?.notes || "") },
    surface: { score: String(data.surface?.score || ""), notes: String(data.surface?.notes || "") },
    summary: String(data.summary || ""),
    recommendation: String(data.recommendation || ""),
  };
}

export async function aiRecognize(imageDataUrl) {
  const mt = parseMediaType(imageDataUrl);
  const b64 = imageDataUrl.split(",")[1];
  const data = await aiCall({
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
  return validateRecognizeResult(data);
}

export async function aiPrice(query) {
  const data = await aiCall({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `Search trading card "${query}" for real eBay/TCGplayer sold prices. Return ONLY JSON: {"cardName":"","results":[{"title":"","price":0,"source":"eBay Sold","date":"Mar 2026","url":"https://..."}],"priceEstimate":{"low":0,"mid":0,"high":0},"priceHistory":[{"month":"Oct 2025","avgPrice":0}],"cardInfo":{"set":"","year":"","number":"","rarity":"","type":"sports"}}`,
    }],
  });
  return validatePriceResult(data);
}

export async function aiGradePredict(imageDataUrl) {
  const mt = parseMediaType(imageDataUrl);
  const b64 = imageDataUrl.split(",")[1];
  const data = await aiCall({
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
  return validateGradeResult(data);
}
