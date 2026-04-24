export function navigationTargetForSearchResult(type) {
  switch (type) {
    case "card":
      return { view: "cards" };
    case "sale":
    case "order":
    case "listing":
    case "purchase":
      return { view: "sales" };
    case "watch":
      return { view: "tools", toolsTab: "watch" };
    case "trade":
      return { view: "tools", toolsTab: "trade" };
    default:
      return { view: "dashboard" };
  }
}
