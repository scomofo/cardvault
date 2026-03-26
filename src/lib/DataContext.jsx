import { createContext, useContext, useState, useEffect, useRef } from "react";
import { loadData, saveData, loadString, saveString } from "./storage";
import { scheduleAuctionNotification, clearAllTimers } from "./notifications";

const DataCtx = createContext(null);

export function useData() {
  return useContext(DataCtx);
}

function useDebouncedSave(value, saveFn, delay = 500) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => saveFn(), delay);
    return () => clearTimeout(t);
  }, [value]);
}

export function DataProvider({ children }) {
  const [catalog, setCatalog] = useState(() => loadData("catalog"));
  const [sales, setSales] = useState(() => loadData("sales"));
  const [trades, setTrades] = useState(() => loadData("trades"));
  const [watchlist, setWatchlist] = useState(() => loadData("watchlist"));
  const [gradings, setGradings] = useState(() => loadData("gradings"));
  const [listings, setListings] = useState(() => loadData("listings"));
  const [purchases, setPurchases] = useState(() => loadData("purchases"));
  const [userName, setUserName] = useState(() => loadString("user", ""));
  const [shipFrom, setShipFrom] = useState(() => loadString("addr", ""));

  useDebouncedSave(catalog, () => saveData("catalog", catalog));
  useDebouncedSave(sales, () => saveData("sales", sales));
  useDebouncedSave(trades, () => saveData("trades", trades));
  useDebouncedSave(watchlist, () => saveData("watchlist", watchlist));
  useDebouncedSave(gradings, () => saveData("gradings", gradings));
  useDebouncedSave(listings, () => saveData("listings", listings));
  useDebouncedSave(purchases, () => saveData("purchases", purchases));
  useDebouncedSave(userName, () => saveString("user", userName));
  useDebouncedSave(shipFrom, () => saveString("addr", shipFrom));

  // Schedule auction notifications on load and when listings change
  useEffect(() => {
    listings.filter((l) => l.status === "active" && l.format === "auction").forEach(scheduleAuctionNotification);
    return () => clearAllTimers();
  }, [listings]);

  const value = {
    catalog, setCatalog,
    sales, setSales,
    trades, setTrades,
    watchlist, setWatchlist,
    gradings, setGradings,
    listings, setListings,
    purchases, setPurchases,
    userName, setUserName,
    shipFrom, setShipFrom,
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
