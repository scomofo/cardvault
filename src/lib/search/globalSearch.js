function normalize(str) {
  return String(str ?? "").toLowerCase().trim();
}

export function matchScore(item, query) {
  const q = normalize(query);
  if (!q) return 0;

  const terms = q.split(/\s+/);
  const number = normalize(item.number ?? item.cardNumber);
  const fields = [
    normalize(item.name),
    normalize(item.playerName),
    normalize(item.team),
    normalize(item.sport),
    normalize(item.manufacturer),
    normalize(item.set || item.cardSet || item.card_set),
    number,
    number && `#${number}`,
    normalize(item.rarity),
    normalize(item.parallel),
    normalize(item.binder),
    normalize(item.platform),
    normalize(item.seller),
    normalize(item.partner),
    normalize(item.year),
    normalize(item.notes),
    normalize(item.gave),
    normalize(item.received),
  ].filter(Boolean);

  const haystack = fields.join(" ");
  let score = 0;

  for (const term of terms) {
    if (!haystack.includes(term)) return 0;
    if (fields.some((field) => field.startsWith(term))) score += 3;
    else score += 1;
  }

  if (normalize(item.name) === q) score += 10;
  if (normalize(item.name)?.startsWith(q)) score += 5;

  return score;
}

export function shouldOpenGlobalSearch(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    return true;
  }

  if (event.key !== "/") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  const target = event.target;
  if (!target) return true;
  const tagName = target.tagName?.toLowerCase();
  if (target.isContentEditable) return false;
  return tagName !== "input" && tagName !== "textarea" && tagName !== "select";
}
