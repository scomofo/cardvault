import { useState, useMemo } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { uid, fmtShort } from "../lib/utils";

export default function TradeTracker() {
  const { trades, setTrades } = useData();
  const toast = useToast();
  const blank = { partner: "", gave: "", received: "", gaveValue: "", receivedValue: "", date: "", notes: "" };
  const [input, setInput] = useState(blank);
  const [editId, setEditId] = useState(null);

  const balance = useMemo(
    () => trades.reduce((s, t) => s + (parseFloat(t.receivedValue) || 0) - (parseFloat(t.gaveValue) || 0), 0),
    [trades]
  );

  const logTrade = () => {
    if (!input.partner) { toast.error("Enter trading partner"); return; }
    if (editId) {
      setTrades((p) => p.map((t) => (t.id === editId ? { ...t, ...input } : t)));
      toast.success("Trade updated");
      setEditId(null);
    } else {
      setTrades((p) => [{ id: uid(), ...input, createdAt: new Date().toISOString() }, ...p]);
      toast.success("Trade logged");
    }
    setInput(blank);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setInput({ partner: t.partner, gave: t.gave, received: t.received, gaveValue: t.gaveValue, receivedValue: t.receivedValue, date: t.date, notes: t.notes || "" });
  };

  const cancelEdit = () => { setEditId(null); setInput(blank); };

  const deleteTrade = (id) => {
    if (window.confirm("Delete this trade?")) {
      setTrades((p) => p.filter((t) => t.id !== id));
      if (editId === id) cancelEdit();
      toast.info("Trade deleted");
    }
  };

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Trade Tracker</h2>
      <div style={{ fontSize: 11, color: balance >= 0 ? "var(--grn)" : "var(--red)", fontWeight: 700, marginBottom: 10 }}>
        Balance: {balance >= 0 ? "+" : ""}{fmtShort(balance)} CAD
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">{editId ? "Edit Trade" : "Log Trade"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
          <input className="inp" placeholder="Trading partner" value={input.partner} onChange={(e) => setInput((p) => ({ ...p, partner: e.target.value }))} />
          <input className="inp" type="date" value={input.date} onChange={(e) => setInput((p) => ({ ...p, date: e.target.value }))} />
          <input className="inp" placeholder="Cards you gave" value={input.gave} onChange={(e) => setInput((p) => ({ ...p, gave: e.target.value }))} />
          <input className="inp" placeholder="Value gave $" type="number" step="0.01" value={input.gaveValue} onChange={(e) => setInput((p) => ({ ...p, gaveValue: e.target.value }))} />
          <input className="inp" placeholder="Cards you received" value={input.received} onChange={(e) => setInput((p) => ({ ...p, received: e.target.value }))} />
          <input className="inp" placeholder="Value received $" type="number" step="0.01" value={input.receivedValue} onChange={(e) => setInput((p) => ({ ...p, receivedValue: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn-a" onClick={logTrade}>{editId ? "Save Edit" : "+ Log Trade"}</button>
          {editId && <button className="btn-g" onClick={cancelEdit}>Cancel</button>}
        </div>
      </div>

      {trades.length === 0 && (
        <p style={{ color: "var(--dim)", textAlign: "center", padding: 30 }}>No trades logged yet</p>
      )}

      {trades.map((t) => {
        const net = (parseFloat(t.receivedValue) || 0) - (parseFloat(t.gaveValue) || 0);
        return (
          <div key={t.id} className="card" style={{ marginBottom: 6, borderColor: editId === t.id ? "var(--acc)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 12 }}>{t.partner}</strong>
              <span style={{ fontSize: 10, color: "var(--dim)" }}>{t.date && new Date(t.date).toLocaleDateString("en-CA")}</span>
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: "var(--dim)" }}>Gave: {t.gave} ({fmtShort(t.gaveValue)})</div>
            <div style={{ fontSize: 10, color: "var(--dim)" }}>Got: {t.received} ({fmtShort(t.receivedValue)})</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: net >= 0 ? "var(--grn)" : "var(--red)", marginTop: 2 }}>
              Net: {net >= 0 ? "+" : ""}{fmtShort(net)}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button className="btn-g" style={{ padding: "2px 6px", fontSize: 8 }} onClick={() => startEdit(t)}>Edit</button>
              <div style={{ flex: 1 }} />
              <button className="btn-g" style={{ padding: "2px 5px", fontSize: 8, color: "var(--red)" }} onClick={() => deleteTrade(t.id)}>&times;</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
