// Listing annotations cannot reopen a completed sale.
export function toggleCardListing(card, platform) {
  if (card.status === "sold") return card;
  const listedOn = Array.isArray(card.listedOn) ? card.listedOn : [];
  const next = listedOn.includes(platform)
    ? listedOn.filter((value) => value !== platform)
    : [...listedOn, platform];
  return { ...card, listedOn: next, status: next.length ? "listed" : "inventory" };
}
