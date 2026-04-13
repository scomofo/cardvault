import { useState, useMemo } from "react";
import { useData } from "../lib/DataContext";
import { useToast } from "./Toast";
import { CONDITIONS, PLATFORMS, TYPES } from "../lib/constants";
import { fmtShort, condOf } from "../lib/utils";
import { automationAPI } from "../lib/api";

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildDealerExportCsv(rows) {
  const header = ["Title", "Price", "Shipping", "Condition", "Format"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [row.title, row.price, row.shipping, row.condition, row.format].map(escapeCsv).join(","),
    );
  }
  return lines.join("\n");
}

function downloadCsvBlob(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SORT_KEYS = [
  { v: "name", l: "Name" },
  { v: "value", l: "Value" },
  { v: "profit", l: "Profit" },
  { v: "age", l: "Age" },
  { v: "costBasis", l: "Cost" },
];

const STATUS_FILTERS = [
  { v: "all", l: "All" },
  { v: "inventory", l: "Inventory" },
  { v: "listed", l: "Listed" },
  { v: "sold", l: "Sold" },
];

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function quickPrice(card) {
  const est = card.priceEstimate || {};
  return Number(est.mid || card.market_price || card.suggested_listing_price || 0);
}

export default function DealerModeView() {
  const { catalog, setCatalog, listings, setListings } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCond, setFilterCond] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState("");

  // Filter + sort
  const filtered = useMemo(() => {
    let items = [...catalog];
    if (filterType !== "all") items = items.filter((c) => c.type === filterType);
    if (filterStatus !== "all") items = items.filter((c) => (c.status || "inventory") === filterStatus);
    if (filterCond !== "all") items = items.filter((c) => c.condition === filterCond);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.set || "").toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      let va, vb;
      if (sortKey === "name") { va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase(); }
      else if (sortKey === "value") { va = quickPrice(a); vb = quickPrice(b); }
      else if (sortKey === "profit") { va = quickPrice(a) - (Number(a.costBasis) || 0); vb = quickPrice(b) - (Number(b.costBasis) || 0); }
      else if (sortKey === "age") { va = daysSince(a.createdAt); vb = daysSince(b.createdAt); }
      else if (sortKey === "costBasis") { va = Number(a.costBasis) || 0; vb = Number(b.costBasis) || 0; }
      else { va = 0; vb = 0; }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
    return items;
  }, [catalog, filterType, filterStatus, filterCond, search, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const inv = catalog.filter((c) => (c.status || "inventory") === "inventory");
    const totalValue = inv.reduce((s, c) => s + quickPrice(c), 0);
    const totalCost = inv.reduce((s, c) => s + (Number(c.costBasis) || 0), 0);
    const aging = inv.filter((c) => daysSince(c.createdAt) > 60).length;
    return { count: inv.length, totalValue, totalCost, potentialProfit: totalValue - totalCost, aging };
  }, [catalog]);

  // Actions
  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }

  async function batchListSelected() {
    const cards = catalog.filter((c) => selected.has(c.id));
    if (cards.length === 0) { toast.error("Select cards first"); return; }
    setBusy(true);
    try {
      const itemIds = cards.map((c) => c.id);
      const result = await automationAPI.generateListings({ itemIds });
      const generated = Array.isArray(result?.listings) ? result.listings.length : itemIds.length;
      toast.success(generated + " listings generated server-side");
    } catch (error) {
      toast.error("Batch listing failed: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  function exportSelected() {
    const cards = catalog.filter((c) => selected.has(c.id));
    if (cards.length === 0) { toast.error("Select cards first"); return; }
    const rows = cards.map((c) => ({
      title: [c.year, c.name, c.set, c.number ? "#" + c.number : ""].filter(Boolean).join(" "),
      price: quickPrice(c) || 0.99,
      shipping: 4.99,
      condition: c.condition,
      format: "fixed",
    }));
    const csv = buildDealerExportCsv(rows);
    downloadCsvBlob(csv, "cardvault_dealer_" + new Date().toISOString().slice(0, 10) + ".csv");
    toast.success(cards.length + " cards exported to CSV");
  }

  function saveInlinePrice(id) {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) { toast.error("Invalid price"); return; }
    setCatalog((prev) => prev.map((c) => c.id === id ? { ...c, suggested_listing_price: price } : c));
    setEditingId(null);
    setEditPrice("");
  }

  // Styles
  const s = {
    page: { padding: 24, maxWidth: 1200, margin: "0 auto" },
    statsBar: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
    stat: { background: "#1e1e3a", borderRadius: 8, padding: "12px 20px", flex: "1 1 140px", minWidth: 140 },
    statLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 },
    statValue: { fontSize: 22, fontWeight: 700, color: "#c9a96e", marginTop: 4 },
    filterBar: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
    select: { background: "#2a2a4a", color: "#e5e7eb", border: "1px solid #3a3a5a", borderRadius: 6, padding: "6px 10px", fontSize: 13 },
    searchInput: { background: "#2a2a4a", color: "#e5e7eb", border: "1px solid #3a3a5a", borderRadius: 6, padding: "6px 12px", fontSize: 13, flex: "1 1 200px" },
    actions: { display: "flex", gap: 8, marginBottom: 16 },
    btn: { background: "#c9a96e", color: "#1a1a2e", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnOutline: { background: "transparent", color: "#c9a96e", border: "1px solid #c9a96e", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #2a2a4a", color: "#9ca3af", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" },
    td: { padding: "8px 10px", borderBottom: "1px solid #1e1e3a", color: "#e5e7eb" },
    checkbox: { accentColor: "#c9a96e" },
    aging: { color: "#ef4444", fontSize: 11, fontWeight: 600 },
    profit: { fontWeight: 600 },
    inlineInput: { background: "#2a2a4a", color: "#e5e7eb", border: "1px solid #c9a96e", borderRadius: 4, padding: "2px 6px", width: 70, fontSize: 13 },
  };

  return (
    <div style={s.page}>
      <h2 style={{ color: "#c9a96e", marginBottom: 16 }}>Dealer Mode</h2>

      {/* Stats Bar */}
      <div style={s.statsBar}>
        <div style={s.stat}>
          <div style={s.statLabel}>Inventory</div>
          <div style={s.statValue}>{stats.count}</div>
        </div>
        <div style={s.stat}>
          <div style={s.statLabel}>Total Value</div>
          <div style={s.statValue}>{fmtShort(stats.totalValue)}</div>
        </div>
        <div style={s.stat}>
          <div style={s.statLabel}>Total Cost</div>
          <div style={s.statValue}>{fmtShort(stats.totalCost)}</div>
        </div>
        <div style={s.stat}>
          <div style={s.statLabel}>Potential Profit</div>
          <div style={{ ...s.statValue, color: stats.potentialProfit >= 0 ? "#5a9e6f" : "#ef4444" }}>{fmtShort(stats.potentialProfit)}</div>
        </div>
        <div style={s.stat}>
          <div style={s.statLabel}>Aging (60d+)</div>
          <div style={{ ...s.statValue, color: stats.aging > 0 ? "#ef4444" : "#5a9e6f" }}>{stats.aging}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={s.filterBar}>
        <input style={s.searchInput} placeholder="Search name or set..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={s.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <select style={s.select} value={filterCond} onChange={(e) => setFilterCond(e.target.value)}>
          <option value="all">All Conditions</option>
          {CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
        <select style={s.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {STATUS_FILTERS.map((sf) => <option key={sf.v} value={sf.v}>{sf.l}</option>)}
        </select>
      </div>

      {/* Action Buttons */}
      <div style={s.actions}>
        <button style={s.btn} onClick={batchListSelected} disabled={selected.size === 0 || busy}>
          {busy ? "Listing..." : `List Selected (${selected.size})`}
        </button>
        <button style={s.btnOutline} onClick={exportSelected} disabled={selected.size === 0}>
          Export CSV
        </button>
        <button style={s.btnOutline} onClick={selectAll}>
          {selected.size === filtered.length ? "Deselect All" : "Select All"} ({filtered.length})
        </button>
        <span style={{ color: "#6b7280", fontSize: 12, alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} of {catalog.length} cards
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}><input type="checkbox" style={s.checkbox} checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} /></th>
              {SORT_KEYS.map((sk) => (
                <th key={sk.v} style={s.th} onClick={() => handleSort(sk.v)}>
                  {sk.l} {sortKey === sk.v ? (sortDir === 1 ? " ▲" : " ▼") : ""} 
                </th>
              ))}
              <th style={s.th}>Set</th>
              <th style={s.th}>Cond</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((card) => {
              const age = daysSince(card.createdAt);
              const value = quickPrice(card);
              const cost = Number(card.costBasis) || 0;
              const profit = value - cost;
              const cond = condOf(card.condition);
              return (
                <tr key={card.id} style={{ background: selected.has(card.id) ? "#2a2a4a" : "transparent" }}>
                  <td style={s.td}><input type="checkbox" style={s.checkbox} checked={selected.has(card.id)} onChange={() => toggleSelect(card.id)} /></td>
                  <td style={s.td}>{card.name || "-"}</td>
                  <td style={{ ...s.td, ...s.profit, color: profit >= 0 ? "#5a9e6f" : "#ef4444" }}>{fmtShort(value)}</td>
                  <td style={{ ...s.td, ...s.profit, color: profit >= 0 ? "#5a9e6f" : "#ef4444" }}>{fmtShort(profit)}</td>
                  <td style={s.td}>
                    <span style={age > 60 ? s.aging : {}}>{age}d</span>
                  </td>
                  <td style={s.td}>{fmtShort(cost)}</td>
                  <td style={s.td}>{card.set || "-"}</td>
                  <td style={s.td}><span style={{ color: cond.c }}>{cond.s}</span></td>
                  <td style={s.td}>{card.status || "inventory"}</td>
                  <td style={s.td}>
                    {editingId === card.id ? (
                      <span>
                        <input style={s.inlineInput} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveInlinePrice(card.id)} autoFocus />
                        <button style={{ ...s.btn, padding: "2px 8px", marginLeft: 4, fontSize: 11 }} onClick={() => saveInlinePrice(card.id)}>OK</button>
                      </span>
                    ) : (
                      <span style={{ cursor: "pointer" }} onClick={() => { setEditingId(card.id); setEditPrice(String(value || "")); }}>
                        {value > 0 ? fmtShort(value) : "-"} 
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>No cards match your filters.</p>}
      </div>
    </div>
  );
}

