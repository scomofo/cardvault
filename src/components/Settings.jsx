import { useMemo, useRef } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";
import { genSalesCSV } from "../lib/exports";

export default function Settings() {
  const {
    catalog, setCatalog, sales, setSales, trades, setTrades,
    watchlist, setWatchlist, gradings, setGradings,
    userName, setUserName, shipFrom, setShipFrom,
  } = useData();
  const toast = useToast();
  const restoreRef = useRef(null);

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
      // Only clear cv8_ prefixed keys
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("cv8_")) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      // Clear IndexedDB images
      try {
        const req = indexedDB.open("cardvault", 1);
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains("images")) {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").clear();
          }
          db.close();
        };
      } catch (e) { /* ignore */ }
      toast.info("All data cleared");
    }
  };

  const backupData = () => {
    const data = {
      _cardvaultBackup: true,
      _date: new Date().toISOString(),
      catalog, sales, trades, watchlist, gradings, userName, shipFrom,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const restoreData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data._cardvaultBackup) { toast.error("Not a valid CardVault backup file"); return; }
        if (!window.confirm("Restore backup? This will replace all current data.")) return;
        if (Array.isArray(data.catalog)) setCatalog(data.catalog);
        if (Array.isArray(data.sales)) setSales(data.sales);
        if (Array.isArray(data.trades)) setTrades(data.trades);
        if (Array.isArray(data.watchlist)) setWatchlist(data.watchlist);
        if (Array.isArray(data.gradings)) setGradings(data.gradings);
        if (data.userName !== undefined) setUserName(data.userName);
        if (data.shipFrom !== undefined) setShipFrom(data.shipFrom);
        toast.success("Backup restored");
      } catch { toast.error("Failed to parse backup file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportSalesCSV = () => {
    if (sales.length === 0) { toast.error("No sales to export"); return; }
    const csv = genSalesCSV(sales);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardvault-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Sales CSV downloaded");
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

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">Sales History</div>
        {sales.length === 0 ? (
          <p style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>No sales recorded</p>
        ) : (
          <>
            <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 4 }}>
              {sales.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)", padding: "3px 0", borderBottom: "1px solid var(--brd)" }}>
                  <span style={{ flex: 1 }}>{s.cardName}</span>
                  <span style={{ width: 70, textAlign: "right", color: "var(--grn)", fontWeight: 700 }}>{fmtShort(s.salePrice)}</span>
                  <span style={{ width: 70, textAlign: "right", color: s.netProfit >= 0 ? "var(--grn)" : "var(--red)" }}>{s.netProfit >= 0 ? "+" : ""}{fmtShort(s.netProfit)}</span>
                  <span style={{ width: 60, textAlign: "right" }}>{s.platform}</span>
                </div>
              ))}
            </div>
            <button className="btn-a" style={{ marginTop: 6, fontSize: 10 }} onClick={exportSalesCSV}>Export Sales CSV</button>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">Backup &amp; Restore</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn-a" onClick={backupData}>Backup Data</button>
          <button className="btn-a" onClick={() => restoreRef.current?.click()}>Restore Data</button>
          <input ref={restoreRef} type="file" accept=".json" style={{ display: "none" }} onChange={restoreData} />
        </div>
        <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 4 }}>Backup exports all app data as JSON. Restore replaces current data.</div>
      </div>

      <div className="card">
        <div className="lbl">Danger Zone</div>
        <button className="btn-g" style={{ color: "var(--red)", marginTop: 4 }} onClick={clearAll}>Clear All Data</button>
      </div>
    </div>
  );
}
