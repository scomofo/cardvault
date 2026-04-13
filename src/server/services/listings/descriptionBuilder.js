/**
 * Build a marketplace listing description from item data.
 * @param {object} item
 * @returns {string}
 */
export function buildListingDescription(item) {
  const headline = `${item.player_name || item.name || "Card"}${item.card_set ? ` from ${item.card_set}` : ""}`;
  const details = [
    item.year ? `Year: ${item.year}` : null,
    item.card_number ? `Card #: ${item.card_number}` : null,
    item.parallel ? `Parallel: ${item.parallel}` : null,
    item.condition ? `Condition: ${item.condition}` : null,
  ].filter(Boolean);

  return [
    headline,
    "Shipped safely in a penny sleeve, top loader, and protective mailer.",
    "Combined shipping is available on multiple card orders.",
    "30 day returns accepted unless otherwise noted.",
    ...details,
    "Please review photos for exact card condition.",
  ].join("\n");
}
