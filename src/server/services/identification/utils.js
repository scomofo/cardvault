/**
 * Normalize text for comparison.
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into lowercase tokens.
 * @param {string} value
 * @returns {string[]}
 */
export function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

/**
 * Calculate similarity ratio between two strings (0-1).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) matches += 1;
  }
  return matches / Math.max(left.size, right.size);
}
