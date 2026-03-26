import { useMemo, useRef, useState, useEffect } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";
import { genSalesCSV } from "../lib/exports";
import { IconDownload, IconUpload, IconTrash, IconBarChart, IconCheck, IconEye, IconZap } from "./Icons";

function ApiKeySection() {
  const toast = useToast();
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState({ configured: false, masked: null });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ai/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setStatus(data);
        setKeyInput("");
        toast.success("API key saved");
      } else {
        toast.error(data.error || "Failed to save key");
      }
    } catch {
      toast.error("Server not reachable");
    }
    setSaving(false);
  };

  return (
    <div className="card mb-12" style={{ borderColor: status.configured ? "var(--grn-brd)" : "var(--acc-brd)" }}>
      <div className="flex items-center gap-8 mb-8">
        <IconZap size={16} style={{ color: status.configured ? "var(--grn)" : "var(--acc-solid)" }} />
        <div className="lbl" style={{ margin: 0 }}>Anthropic API Key</div>
        {status.configured && <span className="badge badge-grn"><IconCheck size={10} /> Connected</span>}
      </div>

      {status.configured && (
        <div className="flex items-center gap-8 mb-8">
          <code className="text-xs text-dim" style={{ background: "var(--s3)", padding: "4px 10px", borderRadius: 6 }}>
            {status.masked}
          </code>
        </div>
      )}

      <div className="text-xxs text-dim mb-8">
        Required for AI card recognition, pricing, and grade prediction.
        Your key is stored server-side only and never sent to the browser.
      </div>

      <div className="flex gap-8">
        <div className="flex-1" style={{ position: "relative" }}>
          <input
            className="inp"
            type={showKey ? "text" : "password"}
            placeholder={status.configured ? "Enter new key to replace..." : "sk-ant-..."}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
            autoComplete="off"
          />
          <button
            className="btn-icon"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--dim)" }}
            onClick={() => setShowKey(!showKey)}
          >
            <IconEye size={14} />
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={saveKey} disabled={saving || !keyInput.trim()}>
          {saving ? "..." : "Save"}
        </button>
      </div>
    </div>
  );
}

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
    if (!window.confirm("Delete ALL data? This cannot be undone.")) return;
    setCatalog([]); setSales([]); setTrades([]); setWatchlist([]); setGradings([]);
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("cv8_")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    try {
      const req = indexedDB.open("cardvault", 1);
      req.onsuccess = () => { const db = req.result; if (db.objectStoreNames.contains("images")) { const tx = db.transaction("images", "readwrite"); tx.objectStore("images").clear(); } db.close(); };
    } catch { /* ignore */ }
    toast.info("All data cleared");
  };

  const backupData = () => {
    const data = { _cardvaultBackup: true, _date: new Date().toISOString(), catalog, sales, trades, watchlist, gradings, userName, shipFrom };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cardvault-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const restoreData = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
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
    reader.readAsText(file); e.target.value = "";
  };

  const exportSalesCSV = () => {
    if (sales.length === 0) { toast.error("No sales to export"); return; }
    const csv = genSalesCSV(sales);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cardvault-sales-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Sales CSV downloaded");
  };

  return (
    <div className="fade">
      <h1 className="page-title">Settings</h1>

      <ApiKeySection />

      <div className="card mb-12">
        <div className="lbl">User Profile</div>
        <input className="inp mt-6" placeholder="Your name" value={userName} onChange={(e) => setUserName(e.target.value)} />
        <div className="text-xxs text-dim mt-4">Used for insurance reports and exports</div>
      </div>

      <div className="card mb-12">
        <div className="lbl">Return Address (for shipping)</div>
        <textarea className="inp mt-6" style={{ minHeight: 60, resize: "vertical", fontSize: 13 }}
          placeholder={"Your name\nStreet address\nCity, Province  Postal Code\nCanada"} value={shipFrom} onChange={(e) => setShipFrom(e.target.value)} />
      </div>

      <div className="card-hero mb-12">
        <div className="flex items-center gap-8 mb-10">
          <IconBarChart size={18} style={{ color: "var(--acc)" }} />
          <div className="lbl" style={{ margin: 0 }}>Collection Stats</div>
        </div>
        <div className="stat-grid">
          <div className="stat-item">
            <div className="text-xxs text-dim">Cards</div>
            <div className="fw-800" style={{ fontSize: 18 }}>{catalog.length}</div>
          </div>
          <div className="stat-item">
            <div className="text-xxs text-dim">Portfolio</div>
            <div className="gold fw-800" style={{ fontSize: 18 }}>{fmtShort(totalVal)}</div>
          </div>
          <div className="stat-item">
            <div className="text-xxs text-dim">Revenue</div>
            <div className="text-grn fw-800" style={{ fontSize: 18 }}>{fmtShort(sales.reduce((s, x) => s + x.salePrice, 0))}</div>
          </div>
          <div className="stat-item">
            <div className="text-xxs text-dim">Net Profit</div>
            <div className="fw-800" style={{ fontSize: 18, color: sales.reduce((s, x) => s + x.netProfit, 0) >= 0 ? "var(--grn)" : "var(--red)" }}>
              {fmtShort(sales.reduce((s, x) => s + x.netProfit, 0))}
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="text-xs text-dim" style={{ lineHeight: 1.8 }}>
          Sold: {catalog.filter((c) => c.status === "sold").length} &middot; Listed: {catalog.filter((c) => c.status === "listed").length} &middot; Cost Basis: {fmtShort(totalCost)}<br />
          Trades: {trades.length} ({fmtShort(tradeBalance)} balance) &middot; Grading: {gradings.filter((g) => g.status !== "returned").length} out
        </div>
      </div>

      <div className="card mb-12">
        <div className="lbl">Sales History</div>
        {sales.length === 0 ? (
          <div className="text-xs text-dim mt-6">No sales recorded</div>
        ) : (
          <>
            <div style={{ maxHeight: 200, overflowY: "auto" }} className="mt-6">
              {sales.map((s, i) => (
                <div key={i} className="flex items-center text-xxs" style={{ padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                  <span className="flex-1 truncate">{s.cardName}</span>
                  <span className="text-grn fw-700" style={{ width: 70, textAlign: "right" }}>{fmtShort(s.salePrice)}</span>
                  <span style={{ width: 70, textAlign: "right", color: s.netProfit >= 0 ? "var(--grn)" : "var(--red)" }}>{s.netProfit >= 0 ? "+" : ""}{fmtShort(s.netProfit)}</span>
                  <span className="text-dim" style={{ width: 60, textAlign: "right" }}>{s.platform}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-sm mt-8" onClick={exportSalesCSV}><IconDownload size={12} /> Export CSV</button>
          </>
        )}
      </div>

      <div className="card mb-12">
        <div className="lbl">Backup & Restore</div>
        <div className="flex gap-8 mt-8">
          <button className="btn btn-primary btn-sm" onClick={backupData}><IconDownload size={12} /> Backup</button>
          <button className="btn btn-outline btn-sm" onClick={() => restoreRef.current?.click()}><IconUpload size={12} /> Restore</button>
          <input ref={restoreRef} type="file" accept=".json" style={{ display: "none" }} onChange={restoreData} />
        </div>
        <div className="text-xxs text-dim mt-6">Backup exports all app data as JSON. Restore replaces current data.</div>
      </div>

      <div className="card" style={{ borderColor: "var(--red-brd)" }}>
        <div className="lbl" style={{ color: "var(--red)" }}>Danger Zone</div>
        <button className="btn btn-danger btn-sm mt-6" onClick={clearAll}><IconTrash size={12} /> Clear All Data</button>
      </div>
    </div>
  );
}
