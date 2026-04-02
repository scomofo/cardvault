export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

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
