/**
 * Build a human-readable explanation from parts.
 * @param {string[]} parts
 * @returns {string}
 */
export function buildExplanation(parts) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Create a suggested action object.
 * @param {string} type
 * @param {object} [payload]
 * @returns {{ type: string, payload: object }}
 */
export function action(type, payload = {}) {
  return { type, ...payload };
}
