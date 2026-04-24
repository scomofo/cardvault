import { useMemo, useRef, useState, useEffect } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";
import { automationAPI, marketplacesAPI } from "../lib/api";
import { genSalesCSV } from "../lib/exports";
import { IconDownload, IconUpload, IconTrash, IconBarChart, IconCheck, IconEye, IconZap, IconPlus, Spinner } from "./Icons";

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



function EbayConnectionSection() {
  const toast = useToast();
  const [status, setStatus] = useState({ configured: false, connected: false, sandbox: true });
  const [creds, setCreds] = useState({ appId: "", certId: "", devId: "", ruName: "", sandbox: true });
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const callbackUrl = `${window.location.origin}/api/ebay/callback`;

  useEffect(() => {
    fetch("/api/ebay/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const saveCreds = async () => {
    if (!creds.appId || !creds.certId || !creds.ruName) { toast.error("App ID, Cert ID, and RuName are required"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/ebay/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: creds.appId, certId: creds.certId, devId: creds.devId, ruName: creds.ruName,
          sandbox: creds.sandbox, callbackUrl,
        }),
      });
      if (r.ok) {
        setStatus((p) => ({ ...p, configured: true, sandbox: creds.sandbox }));
        setShowSetup(false);
        toast.success("eBay credentials saved");
      } else toast.error("Failed to save credentials");
    } catch { toast.error("Server not reachable"); }
    setSaving(false);
  };

  const authorize = () => { window.location.href = "/api/ebay/auth"; };

  const disconnect = async () => {
    if (!window.confirm("Disconnect eBay?")) return;
    await fetch("/api/ebay/disconnect", { method: "POST" }).catch(() => {});
    setStatus({ configured: true, connected: false, sandbox: status.sandbox });
    toast.info("eBay disconnected");
  };

  return (
    <div className="card mb-12" style={{ borderColor: status.connected ? "var(--grn-brd)" : status.configured ? "var(--acc-brd)" : undefined }}>
      <div className="flex items-center gap-8 mb-8">
        <IconBarChart size={16} style={{ color: status.connected ? "var(--grn)" : "var(--acc-solid)" }} />
        <div className="lbl" style={{ margin: 0 }}>eBay Connection</div>
        {status.connected && <span className="badge badge-grn"><IconCheck size={10} /> Connected</span>}
        {status.sandbox && <span className="badge badge-dim">Sandbox</span>}
      </div>

      {status.connected ? (
        <div>
          <div className="text-xs text-dim mb-8">eBay authorized. Listings will publish directly.</div>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={disconnect}>Disconnect</button>
          </div>
        </div>
      ) : status.configured ? (
        <div>
          <div className="text-xs text-dim mb-8">Credentials saved. Authorize to connect.</div>
          <button className="btn btn-primary btn-sm" onClick={authorize}>Authorize with eBay</button>
        </div>
      ) : (
        <div>
          <div className="text-xs text-dim mb-8">
            Connect your eBay developer account to publish listings directly.
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSetup(!showSetup)}>
            <IconPlus size={12} /> Set Up eBay
          </button>
        </div>
      )}

      {showSetup && (
        <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
          <div className="text-xxs text-dim mb-8">Register at developer.ebay.com, create an app, copy your RuName from User Tokens, and configure the accept URL there to match the callback shown below.</div>
          <div className="form-grid mt-4">
            <label className="fld">
              <span className="text-xxs text-dim">App ID (Client ID)</span>
              <input className="inp" value={creds.appId} onChange={(e) => setCreds((p) => ({ ...p, appId: e.target.value }))} placeholder="Your-App-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Cert ID (Client Secret)</span>
              <input className="inp" type="password" value={creds.certId} onChange={(e) => setCreds((p) => ({ ...p, certId: e.target.value }))} placeholder="Your-Cert-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Dev ID (optional)</span>
              <input className="inp" value={creds.devId} onChange={(e) => setCreds((p) => ({ ...p, devId: e.target.value }))} placeholder="Your-Dev-ID" />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">RuName (redirect_uri)</span>
              <input className="inp" value={creds.ruName} onChange={(e) => setCreds((p) => ({ ...p, ruName: e.target.value }))} placeholder="Your-eBay-RuName" />
            </label>
          </div>
          <div className="text-xxs text-dim mt-8">Callback URL to configure in eBay: <code>{callbackUrl}</code></div>
          <label className="flex items-center gap-8 mt-8" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={creds.sandbox} onChange={(e) => setCreds((p) => ({ ...p, sandbox: e.target.checked }))} />
            <span className="text-xs">Sandbox mode (test environment)</span>
          </label>
          <div className="flex gap-8 mt-8">
            <button className="btn btn-primary btn-sm" onClick={saveCreds} disabled={saving}>
              {saving ? <Spinner size={12} /> : <IconCheck size={12} />} Save Credentials
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSetup(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
function MarketplaceConnectionsSection() {
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newConn, setNewConn] = useState({ marketplace: "ebay", accountLabel: "", shopName: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      marketplacesAPI.list().catch(() => []),
      marketplacesAPI.connections().catch(() => []),
    ]).then(([mp, conn]) => {
      setMarketplaces(Array.isArray(mp) ? mp : []);
      setConnections(Array.isArray(conn) ? conn : []);
      setLoading(false);
    });
  }, []);

  const saveConnection = async () => {
    if (!newConn.marketplace) return;
    setSaving(true);
    try {
      const result = await marketplacesAPI.connect(newConn);
      setConnections((p) => [...p, result]);
      setShowAdd(false);
      setNewConn({ marketplace: "ebay", accountLabel: "", shopName: "" });
      toast.success("Marketplace connection saved");
    } catch (e) {
      toast.error(e.message || "Failed to connect");
    }
    setSaving(false);
  };

  return (
    <div className="card mb-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-8">
          <IconBarChart size={16} style={{ color: "var(--acc)" }} />
          <div className="lbl" style={{ margin: 0 }}>Marketplace Connections</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(!showAdd)}>
          <IconPlus size={12} /> Add
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-dim">Loading...</div>
      ) : connections.length === 0 ? (
        <div className="text-xs text-dim">No marketplace connection metadata saved yet.</div>
      ) : (
        connections.map((conn, i) => (
          <div key={conn.id || i} className="flex justify-between items-center mt-6" style={{ padding: "8px 12px", background: "var(--s3)", borderRadius: "var(--radius)" }}>
            <div>
              <span className="text-xs fw-700" style={{ textTransform: "capitalize" }}>{conn.marketplace}</span>
              {conn.accountLabel && <span className="text-xxs text-dim ml-8">{conn.accountLabel}</span>}
            </div>
            <span className={`badge ${conn.authStatus === "connected" ? "badge-grn" : "badge-dim"}`}>
              <IconCheck size={10} /> {conn.authStatus || "configured"}
            </span>
          </div>
        ))
      )}

      {showAdd && (
        <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
          <div className="text-xxs text-dim mb-8">
            This section saves account labels and shop metadata for publishing workflows. Use the dedicated eBay connection above for real OAuth credentials.
          </div>
          <div className="form-grid mt-4">
            <label className="fld">
              <span className="text-xxs text-dim">Marketplace</span>
              <select className="inp" value={newConn.marketplace} onChange={(e) => setNewConn((p) => ({ ...p, marketplace: e.target.value }))}>
                {(marketplaces.length > 0 ? marketplaces : ["ebay", "comc", "shopify"]).map((mp) => (
                  <option key={typeof mp === "string" ? mp : mp.name} value={typeof mp === "string" ? mp : mp.name}>
                    {(typeof mp === "string" ? mp : mp.name).toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Account Label</span>
              <input className="inp" placeholder="Storefront label" value={newConn.accountLabel} onChange={(e) => setNewConn((p) => ({ ...p, accountLabel: e.target.value }))} />
            </label>
            <label className="fld">
              <span className="text-xxs text-dim">Shop Name (optional)</span>
              <input className="inp" placeholder="my-store" value={newConn.shopName} onChange={(e) => setNewConn((p) => ({ ...p, shopName: e.target.value }))} />
            </label>
          </div>
          <div className="flex gap-8 mt-8">
            <button className="btn btn-primary btn-sm" onClick={saveConnection} disabled={saving}>
              {saving ? <Spinner size={12} /> : <IconCheck size={12} />} Save Connection
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const {
    catalog, setCatalog, sales, setSales, orders, setOrders, listings, setListings, purchases, setPurchases, trades, setTrades,
    watchlist, setWatchlist, gradings, setGradings,
    userName, setUserName, shipFrom, setShipFrom,
  } = useData();
  const toast = useToast();
  const restoreRef = useRef(null);

  const totalVal = useMemo(() => catalog.filter((c) => c.status !== "sold").reduce((s, c) => s + (parseFloat(c.priceEstimate?.mid) || 0), 0), [catalog]);
  const totalCost = useMemo(() => catalog.reduce((s, c) => s + (parseFloat(c.costBasis) || 0), 0), [catalog]);
  const tradeBalance = useMemo(() => trades.reduce((s, t) => s + (parseFloat(t.receivedValue) || 0) - (parseFloat(t.gaveValue) || 0), 0), [trades]);
  const [refreshingPricing, setRefreshingPricing] = useState(false);
  const [lastPricingRefresh, setLastPricingRefresh] = useState(null);

  const refreshAllPricing = async () => {
    if (refreshingPricing) return;
    setRefreshingPricing(true);
    try {
      const summary = await automationAPI.refreshAllPricing();
      setLastPricingRefresh(summary);
      if (summary.failed > 0) {
        toast.error(`Refreshed ${summary.refreshed}/${summary.total} - ${summary.failed} failed`);
      } else if (summary.total === 0) {
        toast.info("No owned cards to refresh");
      } else {
        toast.success(`Refreshed pricing for ${summary.refreshed} card${summary.refreshed === 1 ? "" : "s"}`);
      }
    } catch (error) {
      toast.error(`Pricing refresh failed: ${error.message || "unknown error"}`);
    } finally {
      setRefreshingPricing(false);
    }
  };

  const clearAll = () => {
    if (!window.confirm("Delete ALL data? This cannot be undone.")) return;
    setCatalog([]);
    setSales([]);
    setOrders([]);
    setListings([]);
    setPurchases([]);
    setTrades([]);
    setWatchlist([]);
    setGradings([]);
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
    const data = {
      _cardvaultBackup: true,
      _date: new Date().toISOString(),
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
    };
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
        if (Array.isArray(data.orders)) setOrders(data.orders);
        if (Array.isArray(data.listings)) setListings(data.listings);
        if (Array.isArray(data.purchases)) setPurchases(data.purchases);
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
      <EbayConnectionSection />

      <MarketplaceConnectionsSection />

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
        <div className="lbl">Pricing Data</div>
        <div className="text-xxs text-dim mt-6">
          Re-fetches market prices for every owned card from the configured source
          (eBay Browse by default). Runs sequentially with a short delay between
          calls to stay under rate limits. Active-listing data, not sold comps.
        </div>
        <button
          className="btn btn-primary btn-sm mt-8"
          onClick={refreshAllPricing}
          disabled={refreshingPricing}
        >
          {refreshingPricing ? <Spinner size={12} /> : <IconZap size={12} />} Refresh All Prices
        </button>
        {lastPricingRefresh && (
          <div className="text-xxs text-dim mt-6">
            Last run: {lastPricingRefresh.refreshed}/{lastPricingRefresh.total} refreshed
            {lastPricingRefresh.failed > 0 ? ` (${lastPricingRefresh.failed} failed)` : ""}
            {" - "}
            {(lastPricingRefresh.durationMs / 1000).toFixed(1)}s
          </div>
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

