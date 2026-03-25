import { useState, useMemo } from "react";
import { useToast } from "./Toast";
import { uid, fmtShort } from "../lib/utils";
import { aiPrice } from "../lib/ai";

export default function Watchlist({ watchlist, setWatchlist }) {
  const toast = useToast();
  const [input, setInput] = useState({ name: "", set: "", number: "", targetPrice: "" });

  const alerts = useMemo(
    () => watchlist.filter((w) => w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice).length,
    [watchlist]
  );

  const addWatch = () => {
    if (!input.name) { toast.error("Enter card name"); return; }
    setWatchlist((p) => [...p, {
      id: uid(), ...input,
      targetPrice: parseFloat(input.targetPrice) || 0,
      currentPrice: null, priceHistory: null, checking: false,
    }]);
    setInput({ name: "", set: "", number: "", targetPrice: "" });
    toast.success("Added to watchlist");
  };

  const checkPrice = async (id) => {
    const w = watchlist.find((x) => x.id === id);
    if (!w) return;
    setWatchlist((p) => p.map((x) => (x.id === id ? { ...x, checking: true } : x)));
    const d = await aiPrice(w.name);
    if (d) {
      setWatchlist((p) => p.map((x) => (x.id === id ? { ...x, checking: false, currentPrice: parseFloat(d.priceEstimate?.mid) || x.currentPrice, priceHistory: d.priceHistory } : x)));
    } else {
      setWatchlist((p) => p.map((x) => (x.id === id ? { ...x, checking: false } : x)));
      toast.error("Price check failed");
    }
  };

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
        Watchlist {alerts > 0 && <span style={{ color: "var(--grn)" }}>({alerts} alerts)</span>}
      </h2>
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <input className="inp" placeholder="Card *" value={input.name} onChange={(e) => setInput((p) => ({ ...p, name: e.target.value }))} />
          <input className="inp" placeholder="Target $" type="number" value={input.targetPrice} onChange={(e) => setInput((p) => ({ ...p, targetPrice: e.target.value }))} />
        </div>
        <button className="btn-a" style={{ marginTop: 6 }} onClick={addWatch}>+ Watch</button>
      </div>

      {watchlist.map((w) => {
        const hit = w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice;
        return (
          <div key={w.id} className="card" style={{ marginBottom: 6, borderColor: hit ? "var(--grn)" : "var(--brd)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 12 }}>{w.name}</strong>
              {w.currentPrice
                ? <span style={{ fontWeight: 800, color: hit ? "var(--grn)" : "var(--acc)" }}>{fmtShort(w.currentPrice)}</span>
                : <span style={{ color: "var(--dim)" }}>&mdash;</span>
              }
            </div>
            {hit && <div style={{ fontSize: 10, color: "var(--grn)", fontWeight: 700, marginTop: 2 }}>At/below {fmtShort(w.targetPrice)} target!</div>}
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button className="btn-a" style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => checkPrice(w.id)} disabled={w.checking}>{w.checking ? "\u23f3" : "\ud83d\udd04"}</button>
              <div style={{ flex: 1 }} />
              <button className="btn-g" style={{ padding: "3px 6px", fontSize: 8, color: "var(--red)" }} onClick={() => setWatchlist((p) => p.filter((x) => x.id !== w.id))}>&times;</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
