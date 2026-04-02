export function buildExplanation(parts) {
  return parts.filter(Boolean).join(" ");
}

export function action(type, payload = {}) {
  return { type, ...payload };
}
