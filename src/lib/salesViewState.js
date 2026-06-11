export async function loadServerSalesState({
  actionQueueAPI,
  ordersAPI,
  listingsAPI,
  salesAPI,
  itemsAPI,
}) {
  const [nextActionQueue, nextOrders, nextListings, nextSales, nextCatalog] =
    await Promise.all([
      actionQueueAPI.list().catch(() => []),
      ordersAPI.list().catch(() => []),
      listingsAPI.list().catch(() => []),
      salesAPI.list().catch(() => []),
      itemsAPI.list().catch(() => []),
    ]);

  return {
    actionQueue: Array.isArray(nextActionQueue) ? nextActionQueue : [],
    orders: Array.isArray(nextOrders) ? nextOrders : [],
    listings: Array.isArray(nextListings) ? nextListings : [],
    sales: Array.isArray(nextSales) ? nextSales : [],
    catalog: Array.isArray(nextCatalog) ? nextCatalog : [],
  };
}

export function summarizeMarketplaceSyncResults(results, marketplace = "marketplace") {
  const entries = Array.isArray(results) ? results : [];
  const conflicts = entries.flatMap((entry) => entry?.reconciliation?.conflicts || []);
  if (conflicts.length > 0) {
    const firstMessage = conflicts.find((conflict) => conflict?.message)?.message;
    return {
      type: "warning",
      message: `Sync needs review: ${firstMessage || "marketplace conflict detected"}`,
    };
  }

  if (entries.some((entry) => entry?.sale && entry?.order)) {
    return {
      type: "success",
      message: `Synced ${marketplace} sale and created order`,
    };
  }

  const status = entries
    .map((entry) => entry?.synced?.status)
    .find(Boolean);

  if (status) {
    return {
      type: "info",
      message: `Refreshed ${marketplace} status: ${status}`,
    };
  }

  return {
    type: "info",
    message: `No ${marketplace} marketplace channel to sync`,
  };
}
