// Focus payloads ({ type, id }) ride along with { view, toolsTab } so target
// views can open/scroll to the exact record (see App.jsx pendingFocus).
export function navigationTargetForSearchResult(type, record) {
  switch (type) {
    case "card":
      return withFocus({ view: "cards" }, "card", record?.id);
    case "sale":
      // Sales render as completed listings, so focus on the linked listing.
      return withFocus({ view: "sales" }, "sale", record?.listingId || record?.id);
    case "order":
    case "listing":
    case "purchase":
      return withFocus({ view: "sales" }, type, record?.id);
    case "watch":
      return { view: "tools", toolsTab: "watch" };
    case "trade":
      return { view: "tools", toolsTab: "trade" };
    default:
      return { view: "dashboard" };
  }
}

// Maps action-queue entries (actionQueueService.js queue names) to the view
// where that action is performed today.
export function navigationTargetForQueue(queue, entry) {
  const focusType = entry?.subjectType;
  const focusId = entry?.subjectId;
  switch (queue) {
    case "shipping_exception":
    case "marketplace_handoff_exception":
    case "ship_now":
    case "orders_awaiting_payment":
    case "stub_publish":
      return withFocus({ view: "sales" }, focusType, focusId);
    case "list_now":
    case "high_value_unlisted":
      return withFocus({ view: "sales" }, focusType, focusId, "list");
    case "reprice_now": {
      const target = withFocus({ view: "sales" }, focusType, focusId, "reprice");
      // Carry the concrete recommendation so the reprice panel can stage it.
      if (target.focus && entry?.recommendedPrice != null) {
        target.focus.price = entry.recommendedPrice;
      }
      return target;
    }
    case "grade_now":
      return withFocus({ view: "tools", toolsTab: "grade" }, focusType, focusId, "grade");
    case "dead_inventory":
    case "bundle_low_value":
      return withFocus({ view: "cards" }, focusType, focusId);
    default:
      return { view: "dashboard" };
  }
}

function withFocus(target, type, id, intent) {
  if (!type || !id) return target;
  const focus = { type, id };
  if (intent) focus.intent = intent;
  return { ...target, focus };
}
