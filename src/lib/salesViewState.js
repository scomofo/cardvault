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

export function summarizeMarketplaceCrosspostResults(results) {
  const entries = Array.isArray(results) ? results : [];
  const marketplaces = Array.from(new Set(
    entries
      .map((entry) => entry?.marketplace)
      .filter(Boolean),
  ));

  if (marketplaces.length === 0) {
    return {
      type: "info",
      message: "No additional marketplaces were added",
    };
  }

  return {
    type: "success",
    message: `Crosspost ready: ${marketplaces.join(", ")}`,
  };
}

export function buildManualSaleFulfillment({
  idFactory,
  listing,
  card,
  feeRate,
  salePrice,
  trackingNumber,
  soldAt = new Date().toISOString(),
}) {
  const id = idFactory();
  const parsedPrice = parseFloat(salePrice);
  const price = Number.isNaN(parsedPrice) ? listing.startPrice : parsedPrice;
  const fees = Math.round(price * feeRate * 100) / 100;
  const costBasis = parseFloat(card?.costBasis) || 0;
  const shipping = parseFloat(listing.shipping) || 0;
  const netProfit = Math.round((price - costBasis - fees - shipping) * 100) / 100;
  const tracking = trackingNumber?.trim();

  const sale = {
    id,
    cardId: listing.cardId,
    cardName: listing.cardName,
    set: listing.set,
    salePrice: price,
    costBasis,
    platform: listing.platform,
    fees,
    shippingCost: shipping,
    netProfit,
    date: soldAt,
    listingId: listing.id,
    ...(tracking ? { trackingNumber: tracking } : {}),
  };

  const order = {
    id: idFactory(),
    saleId: id,
    listingId: listing.id,
    itemId: listing.cardId,
    cardName: listing.cardName,
    platform: listing.platform,
    salePrice: price,
    fees,
    shippingCharge: shipping,
    paymentStatus: "paid",
    // Entering a tracking number is not physical dispatch confirmation.
    fulfillmentStatus: "pending",
    soldAt,
    ...(tracking ? { trackingNumber: tracking } : {}),
  };

  return { sale, order };
}
