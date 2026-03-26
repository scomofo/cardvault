import { useState, useMemo } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { uid, fmtShort } from "../lib/utils";
import { IconPlus, IconEdit, IconX } from "./Icons";

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
      toast.success("Trade updated"); setEditId(null);
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
    <div>
      <div className="flex items-center gap-8 mb-10">
        <h2 className="section-title" style={{ marginBottom: 0 }}>Trade Tracker</h2>
        <span className={`badge ${balance >= 0 ? "badge-grn" : "badge-red"}`}>
          {balance >= 0 ? "+" : ""}{fmtShort(balance)} CAD
        </span>
      </div>

      <div className="card-elevated mb-12">
        <div className="lbl">{editId ? "Edit Trade" : "Log Trade"}</div>
        <div className="form-grid mt-6">
          <input className="inp" placeholder="Trading partner *" value={input.partner} onChange={(e) => setInput((p) => ({ ...p, partner: e.target.value }))} />
          <input className="inp" type="date" value={input.date} onChange={(e) => setInput((p) => ({ ...p, date: e.target.value }))} />
          <input className="inp" placeholder="Cards you gave" value={input.gave} onChange={(e) => setInput((p) => ({ ...p, gave: e.target.value }))} />
          <input className="inp" placeholder="Value gave $" type="number" step="0.01" value={input.gaveValue} onChange={(e) => setInput((p) => ({ ...p, gaveValue: e.target.value }))} />
          <input className="inp" placeholder="Cards you received" value={input.received} onChange={(e) => setInput((p) => ({ ...p, received: e.target.value }))} />
          <input className="inp" placeholder="Value received $" type="number" step="0.01" value={input.receivedValue} onChange={(e) => setInput((p) => ({ ...p, receivedValue: e.target.value }))} />
        </div>
        <div className="flex gap-6 mt-8">
          <button className="btn btn-primary btn-sm" onClick={logTrade}>{editId ? "Save Edit" : <><IconPlus size={12} /> Log Trade</>}</button>
          {editId && <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>}
        </div>
      </div>

      {trades.length === 0 && (
        <div className="card empty-state" style={{ padding: 32 }}>
          <div className="empty-desc">No trades logged yet</div>
        </div>
      )}

      {trades.map((t) => {
        const net = (parseFloat(t.receivedValue) || 0) - (parseFloat(t.gaveValue) || 0);
        return (
          <div key={t.id} className="card mb-6" style={{ borderColor: editId === t.id ? "var(--acc-brd)" : undefined }}>
            <div className="flex justify-between items-center">
              <strong className="text-sm">{t.partner}</strong>
              <span className="text-xxs text-dim">{t.date && new Date(t.date).toLocaleDateString("en-CA")}</span>
            </div>
            <div className="text-xxs text-dim mt-4">Gave: {t.gave} ({fmtShort(t.gaveValue)})</div>
            <div className="text-xxs text-dim">Got: {t.received} ({fmtShort(t.receivedValue)})</div>
            <div className="flex items-center mt-6">
              <span className={`badge ${net >= 0 ? "badge-grn" : "badge-red"}`}>
                Net: {net >= 0 ? "+" : ""}{fmtShort(net)}
              </span>
              <div className="flex-1" />
              <button className="btn btn-ghost btn-sm" style={{ padding: "4px 6px" }} onClick={() => startEdit(t)}><IconEdit size={12} /></button>
              <button className="btn btn-ghost btn-sm" style={{ padding: "4px 6px", color: "var(--red)" }} onClick={() => deleteTrade(t.id)}><IconX size={12} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
