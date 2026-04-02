import { normalizeText } from "./utils.js";

export function parseClues(ocrText, item = {}) {
  const text = normalizeText(ocrText);
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const cardNumberMatch = text.match(/#?\b([a-z]?\d{1,4}[a-z]?)\b/);

  return {
    rawText: ocrText,
    normalizedText: text,
    player: normalizeText(item.player_name || item.name || ""),
    manufacturer: normalizeText(item.manufacturer || ""),
    set: normalizeText(item.card_set || item.set || ""),
    year: item.year || yearMatch?.[0] || null,
    cardNumber: item.card_number || item.number || cardNumberMatch?.[1] || null,
    team: normalizeText(item.team || ""),
    parallel: normalizeText(item.parallel || ""),
    rookieCue: /rookie|rc\b/.test(text) || Boolean(item.rarity && /rookie/i.test(item.rarity)),
    autographCue: /auto|autograph/.test(text),
  };
}
