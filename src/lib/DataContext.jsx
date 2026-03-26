import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { loadData, saveData, loadString, saveString } from "./storage";
import { scheduleAuctionNotification, clearAllTimers } from "./notifications";
import {
  checkBackend,
  itemsAPI,
  salesAPI,
  listingsAPI,
  tradesAPI,
  watchlistAPI,
  gradingsAPI,
  purchasesAPI,
  settingsAPI,
  migrateAPI,
} from "./api";

const DataCtx = createContext(null);

export function useData() {
  return useContext(DataCtx);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Diff two arrays by `id` using updatedAt timestamps when available,
 * falling back to shallow key comparison for changed detection.
 */
function diffById(prev, next) {
  const prevMap = new Map(prev.map((item) => [item.id, item]));
  const nextMap = new Map(next.map((item) => [item.id, item]));

  const added = next.filter((item) => !prevMap.has(item.id));
  const removed = prev.filter((item) => !nextMap.has(item.id));
  const changed = next.filter((item) => {
    const old = prevMap.get(item.id);
    if (!old) return false;
    // Fast path: check updatedAt timestamp if available
    if (item.updatedAt && old.updatedAt && item.updatedAt !== old.updatedAt) return true;
    if (item.updatedAt && old.updatedAt && item.updatedAt === old.updatedAt) return false;
    // Fallback: compare key count + values (cheaper than full JSON.stringify)
    const keys = Object.keys(item);
    if (keys.length !== Object.keys(old).length) return true;
    return keys.some((k) => {
      const a = item[k], b = old[k];
      if (a === b) return false;
      if (typeof a === "object" && typeof b === "object") return JSON.stringify(a) !== JSON.stringify(b);
      return true;
    });
  });

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DataProvider({ children }) {
  // --- Connection & loading state ---
  const [useServer, setUseServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Ref mirrors useServer so callbacks inside setState closures see the
  // latest value without needing it as a dependency.
  const useServerRef = useRef(false);
  useEffect(() => {
    useServerRef.current = useServer;
  }, [useServer]);

  // --- Data state (initialised from localStorage so app renders instantly) ---
  const [catalog, _setCatalog] = useState(() => loadData("catalog"));
  const [sales, _setSales] = useState(() => loadData("sales"));
  const [trades, _setTrades] = useState(() => loadData("trades"));
  const [watchlist, _setWatchlist] = useState(() => loadData("watchlist"));
  const [gradings, _setGradings] = useState(() => loadData("gradings"));
  const [listings, _setListings] = useState(() => loadData("listings"));
  const [purchases, _setPurchases] = useState(() => loadData("purchases"));
  const [userName, _setUserName] = useState(() => loadString("user", ""));
  const [shipFrom, _setShipFrom] = useState(() => loadString("addr", ""));

  // --- Sync system: ref-based to prevent race conditions ---
  // Track the last state that was successfully synced to the server.
  // On each debounced sync, diff against this ref (not the prev from setState).
  const syncTimers = useRef({});
  const lastSynced = useRef({});
  const syncInFlight = useRef({});

  /** Fire-and-forget sync: diffs current state against last-synced snapshot. */
  const syncCollection = useCallback((key, apiObj, current) => {
    // Prevent overlapping syncs for the same collection
    if (syncInFlight.current[key]) return;

    const prev = lastSynced.current[key] || [];
    const { added, removed, changed } = diffById(prev, current);
    const ops = [];
    added.forEach((item) => ops.push(apiObj.create(item)));
    changed.forEach((item) => ops.push(apiObj.update(item.id, item)));
    removed.forEach((item) => ops.push(apiObj.delete(item.id)));

    if (ops.length === 0) {
      lastSynced.current[key] = current;
      return;
    }

    syncInFlight.current[key] = true;
    setSyncing(true);
    Promise.all(ops)
      .then(() => {
        // Only update lastSynced on success
        lastSynced.current[key] = current;
      })
      .catch((err) => console.warn(`Sync error (${key}):`, err))
      .finally(() => {
        syncInFlight.current[key] = false;
        setSyncing(false);
      });
  }, []);

  /** Schedule a debounced sync for a given key / api pair. */
  const scheduleSyncCollection = useCallback(
    (key, apiObj, current) => {
      clearTimeout(syncTimers.current[key]);
      syncTimers.current[key] = setTimeout(
        () => syncCollection(key, apiObj, current),
        500,
      );
    },
    [syncCollection],
  );

  // --- Wrapped setters (localStorage + optional server sync) ---

  const setCatalog = useCallback(
    (updater) => {
      _setCatalog((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("catalog", next);
        if (useServerRef.current)
          scheduleSyncCollection("catalog", itemsAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setSales = useCallback(
    (updater) => {
      _setSales((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("sales", next);
        if (useServerRef.current)
          scheduleSyncCollection("sales", salesAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setTrades = useCallback(
    (updater) => {
      _setTrades((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("trades", next);
        if (useServerRef.current)
          scheduleSyncCollection("trades", tradesAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setWatchlist = useCallback(
    (updater) => {
      _setWatchlist((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("watchlist", next);
        if (useServerRef.current)
          scheduleSyncCollection("watchlist", watchlistAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setGradings = useCallback(
    (updater) => {
      _setGradings((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("gradings", next);
        if (useServerRef.current)
          scheduleSyncCollection("gradings", gradingsAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setListings = useCallback(
    (updater) => {
      _setListings((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("listings", next);
        if (useServerRef.current)
          scheduleSyncCollection("listings", listingsAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setPurchases = useCallback(
    (updater) => {
      _setPurchases((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveData("purchases", next);
        if (useServerRef.current)
          scheduleSyncCollection("purchases", purchasesAPI, next);
        return next;
      });
    },
    [scheduleSyncCollection],
  );

  const setUserName = useCallback(
    (value) => {
      _setUserName(value);
      saveString("user", value);
      if (useServerRef.current) {
        clearTimeout(syncTimers.current["userName"]);
        syncTimers.current["userName"] = setTimeout(() => {
          settingsAPI
            .update({ userName: value })
            .catch((err) => console.warn("Sync userName error:", err));
        }, 500);
      }
    },
    [],
  );

  const setShipFrom = useCallback(
    (value) => {
      _setShipFrom(value);
      saveString("addr", value);
      if (useServerRef.current) {
        clearTimeout(syncTimers.current["shipFrom"]);
        syncTimers.current["shipFrom"] = setTimeout(() => {
          settingsAPI
            .update({ shipFrom: value })
            .catch((err) => console.warn("Sync shipFrom error:", err));
        }, 500);
      }
    },
    [],
  );

  // --- Migration: push localStorage data to server ---

  const migrate = useCallback(async () => {
    const data = {
      catalog: loadData("catalog"),
      sales: loadData("sales"),
      trades: loadData("trades"),
      watchlist: loadData("watchlist"),
      gradings: loadData("gradings"),
      listings: loadData("listings"),
      purchases: loadData("purchases"),
      userName: loadString("user", ""),
      shipFrom: loadString("addr", ""),
    };
    await migrateAPI.send(data);
  }, []);

  // --- Initial load: check backend, fetch server data or fall back ---

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const serverUp = await checkBackend();

      if (cancelled) return;

      if (!serverUp) {
        // Offline mode – keep localStorage data already in state.
        setUseServer(false);
        setLoading(false);
        return;
      }

      setUseServer(true);
      useServerRef.current = true;

      try {
        // Fetch all collections from the server in parallel.
        const [
          serverCatalog,
          serverSales,
          serverTrades,
          serverWatchlist,
          serverGradings,
          serverListings,
          serverPurchases,
          serverSettings,
        ] = await Promise.all([
          itemsAPI.list().catch(() => null),
          salesAPI.list().catch(() => null),
          tradesAPI.list().catch(() => null),
          watchlistAPI.list().catch(() => null),
          gradingsAPI.list().catch(() => null),
          listingsAPI.list().catch(() => null),
          purchasesAPI.list().catch(() => null),
          settingsAPI.get().catch(() => null),
        ]);

        if (cancelled) return;

        // Determine if the server is empty but localStorage has data
        // (first-time migration scenario).
        const serverEmpty =
          (!serverCatalog || serverCatalog.length === 0) &&
          (!serverSales || serverSales.length === 0) &&
          (!serverTrades || serverTrades.length === 0) &&
          (!serverWatchlist || serverWatchlist.length === 0) &&
          (!serverGradings || serverGradings.length === 0) &&
          (!serverListings || serverListings.length === 0) &&
          (!serverPurchases || serverPurchases.length === 0);

        const localCatalog = loadData("catalog");
        const localHasData =
          localCatalog.length > 0 ||
          loadData("sales").length > 0 ||
          loadData("trades").length > 0;

        if (serverEmpty && localHasData) {
          // Migrate localStorage data to the server.
          try {
            await migrate();
            // After migration, local data is now on the server — snapshot as synced
            lastSynced.current = {
              catalog: loadData("catalog"),
              sales: loadData("sales"),
              trades: loadData("trades"),
              watchlist: loadData("watchlist"),
              gradings: loadData("gradings"),
              listings: loadData("listings"),
              purchases: loadData("purchases"),
            };
          } catch (err) {
            console.warn("Migration failed, continuing with local data:", err);
          }
        } else if (!serverEmpty) {
          // Server has data – use it as the source of truth.
          const toArray = (v) => (Array.isArray(v) ? v : []);

          _setCatalog(toArray(serverCatalog));
          saveData("catalog", toArray(serverCatalog));

          _setSales(toArray(serverSales));
          saveData("sales", toArray(serverSales));

          _setTrades(toArray(serverTrades));
          saveData("trades", toArray(serverTrades));

          _setWatchlist(toArray(serverWatchlist));
          saveData("watchlist", toArray(serverWatchlist));

          _setGradings(toArray(serverGradings));
          saveData("gradings", toArray(serverGradings));

          _setListings(toArray(serverListings));
          saveData("listings", toArray(serverListings));

          _setPurchases(toArray(serverPurchases));
          saveData("purchases", toArray(serverPurchases));

          // Initialize lastSynced refs so first sync doesn't re-push everything
          lastSynced.current = {
            catalog: toArray(serverCatalog),
            sales: toArray(serverSales),
            trades: toArray(serverTrades),
            watchlist: toArray(serverWatchlist),
            gradings: toArray(serverGradings),
            listings: toArray(serverListings),
            purchases: toArray(serverPurchases),
          };

          if (serverSettings) {
            if (serverSettings.userName != null) {
              _setUserName(serverSettings.userName);
              saveString("user", serverSettings.userName);
            }
            if (serverSettings.shipFrom != null) {
              _setShipFrom(serverSettings.shipFrom);
              saveString("addr", serverSettings.shipFrom);
            }
          }
        }
        // else: both empty – nothing to do.
      } catch (err) {
        console.warn("Failed to load from server, using local data:", err);
        setUseServer(false);
        useServerRef.current = false;
      }

      if (!cancelled) setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Auction notifications (unchanged) ---
  useEffect(() => {
    listings
      .filter((l) => l.status === "active" && l.format === "auction")
      .forEach(scheduleAuctionNotification);
    return () => clearAllTimers();
  }, [listings]);

  // --- Cleanup sync timers on unmount ---
  useEffect(() => {
    return () => {
      Object.values(syncTimers.current).forEach(clearTimeout);
    };
  }, []);

  // --- Context value ---
  const value = {
    catalog,
    setCatalog,
    sales,
    setSales,
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
