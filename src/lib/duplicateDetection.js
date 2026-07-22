import { hammingDistance } from "./phash.js";

export const DUPLICATE_HAMMING_THRESHOLD = 10;

// Closest catalog card whose front-image dHash is within the threshold,
// as { card, distance }, or null when nothing matches.
export function findLikelyDuplicate(catalog, phash, threshold = DUPLICATE_HAMMING_THRESHOLD) {
  if (!phash || !Array.isArray(catalog)) return null;
  let best = null;
  for (const card of catalog) {
    if (!card?.frontImgPhash) continue;
    const distance = hammingDistance(card.frontImgPhash, phash);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { card, distance };
    }
  }
  return best;
}
