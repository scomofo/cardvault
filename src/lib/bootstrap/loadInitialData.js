import { loadData, loadString, saveData, saveString } from "../storage.js";

function loadLocalSnapshot() {
  return {
    catalog: loadData("catalog"),
    sales: loadData("sales"),
    orders: loadData("orders"),
    trades: loadData("trades"),
    watchlist: loadData("watchlist"),
    gradings: loadData("gradings"),
    listings: loadData("listings"),
    purchases: loadData("purchases"),
    userName: loadString("user", ""),
    shipFrom: loadString("addr", ""),
  };
}

function hasMeaningfulLocalData(local) {
  return (
    local.catalog.length > 0 ||
    local.sales.length > 0 ||
    local.orders.length > 0 ||
    local.trades.length > 0 ||
    local.watchlist.length > 0 ||
    local.gradings.length > 0 ||
    local.listings.length > 0 ||
    local.purchases.length > 0
  );
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isServerEmpty(server) {
  return (
    toArray(server.catalog).length === 0 &&
    toArray(server.sales).length === 0 &&
    toArray(server.orders).length === 0 &&
    toArray(server.trades).length === 0 &&
    toArray(server.watchlist).length === 0 &&
    toArray(server.gradings).length === 0 &&
    toArray(server.listings).length === 0 &&
    toArray(server.purchases).length === 0
  );
}

function hasMeaningfulServerSettings(server) {
  return (
    server.settings?.userName != null && server.settings.userName !== ""
  ) || (
    server.settings?.shipFrom != null && server.settings.shipFrom !== ""
  );
}

function persistServerSnapshot(server, setState) {
  const collections = {
    catalog: toArray(server.catalog),
    sales: toArray(server.sales),
    orders: toArray(server.orders),
    trades: toArray(server.trades),
    watchlist: toArray(server.watchlist),
    gradings: toArray(server.gradings),
    listings: toArray(server.listings),
    purchases: toArray(server.purchases),
  };

  Object.entries(collections).forEach(([key, value]) => {
    setState[key](value);
    saveData(key, value);
  });

  if (server.settings?.userName != null) {
    setState.userName(server.settings.userName);
    saveString("user", server.settings.userName);
  }

  if (server.settings?.shipFrom != null) {
    setState.shipFrom(server.settings.shipFrom);
    saveString("addr", server.settings.shipFrom);
  }

  return collections;
}

export async function loadInitialData({
  checkBackend,
  apis,
  migrate,
  setState,
}) {
  const local = loadLocalSnapshot();
  const serverUp = await checkBackend();

  if (!serverUp) {
    return { useServer: false, snapshot: null };
  }

  const [
    catalog,
    sales,
    orders,
    trades,
    watchlist,
    gradings,
    listings,
    purchases,
    settings,
  ] = await Promise.all([
    apis.items.list().catch(() => null),
    apis.sales.list().catch(() => null),
    apis.orders.list().catch(() => null),
    apis.trades.list().catch(() => null),
    apis.watchlist.list().catch(() => null),
    apis.gradings.list().catch(() => null),
    apis.listings.list().catch(() => null),
    apis.purchases.list().catch(() => null),
    apis.settings.get().catch(() => null),
  ]);

  const server = {
    catalog,
    sales,
    orders,
    trades,
    watchlist,
    gradings,
    listings,
    purchases,
    settings,
  };

  if (isServerEmpty(server) && hasMeaningfulLocalData(local)) {
    await migrate({
      ...local,
      userName: server.settings?.userName ?? local.userName,
      shipFrom: server.settings?.shipFrom ?? local.shipFrom,
    });
    return {
      useServer: true,
      snapshot: {
        catalog: local.catalog,
        sales: local.sales,
        orders: local.orders,
        trades: local.trades,
        watchlist: local.watchlist,
        gradings: local.gradings,
        listings: local.listings,
        purchases: local.purchases,
      },
    };
  }

  if (!isServerEmpty(server) || hasMeaningfulServerSettings(server)) {
    return {
      useServer: true,
      snapshot: persistServerSnapshot(server, setState),
    };
  }

  return { useServer: true, snapshot: {} };
}
