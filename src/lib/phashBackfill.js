import { computeDHash } from "./phash";
import { loadImage } from "./storage";

/**
 * Walk the catalog once and compute a front-image dHash for every entry
 * that has a front image but no hash yet. Rate-limited via sequential
 * awaits so IndexedDB doesn't get saturated on large collections.
 *
 * Idempotent: entries that already carry `frontImgPhash` are skipped.
 * Silent on failure — backfill is best-effort maintenance, never required.
 *
 * @param {Array<object>} catalog
 * @param {(updater: (prev: Array<object>) => Array<object>) => void} setCatalog
 */
export async function backfillFrontImgPhashes(catalog, setCatalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) return;

  const targets = catalog.filter((entry) => entry?.frontImgId && !entry.frontImgPhash);
  if (targets.length === 0) return;

  for (const entry of targets) {
    try {
      const dataUrl = await loadImage(entry.frontImgId);
      if (!dataUrl) continue;
      const hash = await computeDHash(dataUrl);
      if (!hash) continue;
      setCatalog((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, frontImgPhash: hash } : item)),
      );
    } catch {
      // ignore — backfill is best-effort
    }
  }
}
