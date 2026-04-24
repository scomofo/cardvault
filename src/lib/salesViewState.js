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
