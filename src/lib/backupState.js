export function createBackupPayload({
  catalog,
  sales,
  orders,
  listings,
  purchases,
  trades,
  watchlist,
  gradings,
  userName,
  shipFrom,
  images,
  now = new Date(),
}) {
  return {
    _cardvaultBackup: true,
    _date: now.toISOString(),
    catalog,
    sales,
    orders,
    listings,
    purchases,
    trades,
    watchlist,
    gradings,
    userName,
    shipFrom,
    images,
  };
}

export function normalizeBackupState(data) {
  return {
    catalog: Array.isArray(data?.catalog) ? data.catalog : [],
    sales: Array.isArray(data?.sales) ? data.sales : [],
    orders: Array.isArray(data?.orders) ? data.orders : [],
    listings: Array.isArray(data?.listings) ? data.listings : [],
    purchases: Array.isArray(data?.purchases) ? data.purchases : [],
    trades: Array.isArray(data?.trades) ? data.trades : [],
    watchlist: Array.isArray(data?.watchlist) ? data.watchlist : [],
    gradings: Array.isArray(data?.gradings) ? data.gradings : [],
    userName: data?.userName ?? "",
    shipFrom: data?.shipFrom ?? "",
    images:
      data?.images && typeof data.images === "object" && !Array.isArray(data.images)
        ? data.images
        : {},
  };
}
