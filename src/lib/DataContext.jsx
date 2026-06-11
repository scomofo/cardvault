import { createContext, useContext, useEffect, useRef, useState } from "react";
import { loadData, loadString, saveData, saveString } from "./storage";
import { scheduleAuctionNotification, clearAllTimers } from "./notifications";
import {
  checkBackend,
  itemsAPI,
  salesAPI,
  ordersAPI,
  listingsAPI,
  tradesAPI,
  watchlistAPI,
  gradingsAPI,
  purchasesAPI,
  settingsAPI,
  migrateAPI,
} from "./api";
import { loadInitialData } from "./bootstrap/loadInitialData";
import { backfillFrontImgPhashes } from "./phashBackfill";
import {
  createCollectionSetter,
  createSyncEngine,
} from "./sync/syncEngine";

const DataCtx = createContext(null);

export function useData() {
  return useContext(DataCtx);
}

export function DataProvider({ children }) {
  const [useServer, setUseServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const useServerRef = useRef(false);
  useEffect(() => {
    useServerRef.current = useServer;
  }, [useServer]);

  const [catalog, _setCatalog] = useState(() => loadData("catalog"));
  const [sales, _setSales] = useState(() => loadData("sales"));
  const [orders, _setOrders] = useState(() => loadData("orders"));
  const [trades, _setTrades] = useState(() => loadData("trades"));
  const [watchlist, _setWatchlist] = useState(() => loadData("watchlist"));
  const [gradings, _setGradings] = useState(() => loadData("gradings"));
  const [listings, _setListings] = useState(() => loadData("listings"));
  const [purchases, _setPurchases] = useState(() => loadData("purchases"));
  const [userName, _setUserName] = useState(() => loadString("user", ""));
  const [shipFrom, _setShipFrom] = useState(() => loadString("addr", ""));

  const syncEngineRef = useRef(
    createSyncEngine({ onSyncStateChange: setSyncing }),
  );

  const scheduleCollectionSync = (key, api, current) =>
    syncEngineRef.current.scheduleCollectionSync(key, api, current);

  const setCatalog = createCollectionSetter({
    key: "catalog",
    persist: (next) => saveData("catalog", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, itemsAPI, next),
    setState: _setCatalog,
    useServerRef,
  });

  const setSales = createCollectionSetter({
    key: "sales",
    persist: (next) => saveData("sales", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, salesAPI, next),
    setState: _setSales,
    useServerRef,
  });

  const setOrders = createCollectionSetter({
    key: "orders",
    persist: (next) => saveData("orders", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, ordersAPI, next),
    setState: _setOrders,
    useServerRef,
  });

  const setTrades = createCollectionSetter({
    key: "trades",
    persist: (next) => saveData("trades", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, tradesAPI, next),
    setState: _setTrades,
    useServerRef,
  });

  const setWatchlist = createCollectionSetter({
    key: "watchlist",
    persist: (next) => saveData("watchlist", next),
    scheduleSync: (key, next) =>
      scheduleCollectionSync(key, watchlistAPI, next),
    setState: _setWatchlist,
    useServerRef,
  });

  const setGradings = createCollectionSetter({
    key: "gradings",
    persist: (next) => saveData("gradings", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, gradingsAPI, next),
    setState: _setGradings,
    useServerRef,
  });

  const setListings = createCollectionSetter({
    key: "listings",
    persist: (next) => saveData("listings", next),
    scheduleSync: (key, next) => scheduleCollectionSync(key, listingsAPI, next),
    setState: _setListings,
    useServerRef,
  });

  const setPurchases = createCollectionSetter({
    key: "purchases",
    persist: (next) => saveData("purchases", next),
    scheduleSync: (key, next) =>
      scheduleCollectionSync(key, purchasesAPI, next),
    setState: _setPurchases,
    useServerRef,
  });

  const setUserName = (value) => {
    _setUserName(value);
    saveString("user", value);
    if (useServerRef.current) {
      syncEngineRef.current.scheduleValueSync(
        "userName",
        (next) => settingsAPI.update({ userName: next }),
        value,
      );
    }
  };

  const setShipFrom = (value) => {
    _setShipFrom(value);
    saveString("addr", value);
    if (useServerRef.current) {
      syncEngineRef.current.scheduleValueSync(
        "shipFrom",
        (next) => settingsAPI.update({ shipFrom: next }),
        value,
      );
    }
  };

  async function migrate(localData) {
    await migrateAPI.send({
      catalog: localData.catalog,
      items: localData.catalog,
      sales: localData.sales,
      orders: localData.orders,
      trades: localData.trades,
      watchlist: localData.watchlist,
      gradings: localData.gradings,
      listings: localData.listings,
      purchases: localData.purchases,
      userName: localData.userName,
      shipFrom: localData.shipFrom,
      settings: {
        userName: localData.userName,
        shipFrom: localData.shipFrom,
      },
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const result = await loadInitialData({
          checkBackend,
          apis: {
            items: itemsAPI,
            sales: salesAPI,
            orders: ordersAPI,
            trades: tradesAPI,
            watchlist: watchlistAPI,
            gradings: gradingsAPI,
            listings: listingsAPI,
            purchases: purchasesAPI,
            settings: settingsAPI,
          },
          migrate,
          setState: {
            catalog: _setCatalog,
            sales: _setSales,
            orders: _setOrders,
            trades: _setTrades,
            watchlist: _setWatchlist,
            gradings: _setGradings,
            listings: _setListings,
            purchases: _setPurchases,
            userName: _setUserName,
            shipFrom: _setShipFrom,
          },
        });

        if (cancelled) return;

        setUseServer(result.useServer);
        useServerRef.current = result.useServer;
        if (result.snapshot) {
          syncEngineRef.current.setSnapshot(result.snapshot);
        }
      } catch (error) {
        console.warn("Failed to load from server, using local data:", error);
        setUseServer(false);
        useServerRef.current = false;
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listings
      .filter((listing) => listing.status === "active" && listing.format === "auction")
      .forEach(scheduleAuctionNotification);
    return () => clearAllTimers();
  }, [listings]);

  useEffect(() => {
    return () => {
      syncEngineRef.current.clearTimers();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    backfillFrontImgPhashes(catalog, setCatalog);
    // Run once after initial load; subsequent catalog changes don't retrigger.
  }, [loading]);

  const value = {
    catalog,
    setCatalog,
    sales,
    setSales,
    orders,
    setOrders,
    trades,
    setTrades,
    watchlist,
    setWatchlist,
    gradings,
    setGradings,
    listings,
    setListings,
    purchases,
    setPurchases,
    userName,
    setUserName,
    shipFrom,
    setShipFrom,
    useServer,
    loading,
    syncing,
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
