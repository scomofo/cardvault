import { mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

const SPOTLIGHT_DIR = path.join(app.getPath("documents"), "CardVault", "cards");

function sanitize(name) {
  return String(name || "card")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "card";
}

function buildFilename(card) {
  const parts = [card.player, card.year, card.cardSet, card.cardNumber]
    .filter(Boolean)
    .join(" ");
  const stem = sanitize(parts || `card-${card.id}`);
  const id = String(card.id || "").slice(0, 24);
  return `${stem}-${id}.cardvault`;
}

export function ensureSpotlightDir() {
  mkdirSync(SPOTLIGHT_DIR, { recursive: true });
  return SPOTLIGHT_DIR;
}

export function syncSpotlightIndex(cards) {
  ensureSpotlightDir();

  const desired = new Map();
  for (const card of cards || []) {
    if (!card?.id) continue;
    const filename = buildFilename(card);
    const payload = {
      id: card.id,
      player: card.player || "",
      year: card.year || "",
      set: card.cardSet || "",
      number: card.cardNumber || "",
      status: card.status || "",
      open: `cardvault://card/${card.id}`,
    };
    desired.set(filename, JSON.stringify(payload, null, 2));
  }

  let written = 0;
  let removed = 0;

  for (const [filename, body] of desired) {
    writeFileSync(path.join(SPOTLIGHT_DIR, filename), body, "utf8");
    written += 1;
  }

  for (const existing of readdirSync(SPOTLIGHT_DIR)) {
    if (!existing.endsWith(".cardvault")) continue;
    if (!desired.has(existing)) {
      try { unlinkSync(path.join(SPOTLIGHT_DIR, existing)); removed += 1; } catch {}
    }
  }

  return { written, removed, dir: SPOTLIGHT_DIR };
}

export function readCardvaultFile(filePath) {
  try {
    const body = readFileSync(filePath, "utf8");
    const data = JSON.parse(body);
    return data?.open || (data?.id ? `cardvault://card/${data.id}` : null);
  } catch {
    return null;
  }
}
