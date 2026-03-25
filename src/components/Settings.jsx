import { useMemo } from "react";
import { useToast } from "./Toast";
import { fmtShort } from "../lib/utils";

export default function Settings({
  catalog, setCatalog, sales, setSales, trades, setTrades,
  watchlist, setWatchlist, gradings, setGradings,
  userName, setUserName, shipFrom, setShipFrom,
}) {
  const toast = useToast();

  const totalVal = useMemo(() => catalog.filter((c) => c.status !== "sold").reduce((s, c) => s + (parseFloat(c.priceEstimate?.mid) || 0), 0), [catalog]);
  const totalCost = useMemo(() => catalog.reduce((s, c) => s + (parseFloat(c.costBasis) || 0), 0), [catalog]);
  const tradeBalance = useMemo(() => trades.reduce((s, t) => s + (parseFloat(t.receivedValue) || 0) - (parseFloat(t.gaveValue) || 0), 0), [trades]);

  const clearAll = () => {
    if (window.confirm("Delete ALL data? This cannot be undone.")) {
      setCatalog([]);
      setSales([]);
      setTrades([]);
      setWatchlist([]);
      setGradings([]);
      localStorage.clear();
      toast.info("All data cleared");
    }
  };

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Settings</h2>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">User Profile</div>
        <input className="inp" style={{ marginTop: 4 }} placeholder="Your name" value={userName} onChange={(e) => setUserName(e.target.value)} />
        <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 4 }}>Used for insurance reports and exports</div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">Return Address (for shipping)</div>
        <textarea className="inp" style={{ marginTop: 4, minHeight: 50, resize: "vertical", fontSize: 11 }} placeholder={"Your name\nStreet address\nCity, Province  Postal Code\nCanada"} value={shipFrom} onChange={(e) => setShipFrom(e.target.value)} />
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">Stats</div>
        <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6, marginTop: 4 }}>
          Cards: {catalog.length} &middot; Sold: {catalog.filter((c) => c.status === "sold").length} &middot; Listed: {catalog.filter((c) => c.status === "listed").length}<br />
          Portfolio: {fmtShort(totalVal)} CAD &middot; Cost: {fmtShort(totalCost)} CAD<br />
          Sales: {sales.length} &middot; Revenue: {fmtShort(sales.reduce((s, x) => s + x.salePrice, 0))} &middot; Net: {fmtShort(sales.reduce((s, x) => s + x.netProfit, 0))}<br />
          Trades: {trades.length} &middot; Balance: {fmtShort(tradeBalance)}<br />
          Grading: {gradings.filter((g) => g.status === "sent").length} out &middot; {gradings.filter((g) => g.status === "returned").length} returned
        </div>
      </div>

      <div className="card">
        <div className="lbl">Danger Zone</div>
        <button className="btn-g" style={{ color: "var(--red)", marginTop: 4 }} onClick={clearAll}>Clear All Data</button>
      </div>
    </div>
  );
}
