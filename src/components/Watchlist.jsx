import { useState, useMemo } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { uid, fmtShort } from "../lib/utils";
import { aiPrice } from "../lib/ai";
import { IconPlus, IconRefresh, IconX, Spinner } from "./Icons";

export default function Watchlist() {
  const { watchlist, setWatchlist } = useData();
  const toast = useToast();
  const [input, setInput] = useState({ name: "", set: "", number: "", targetPrice: "" });
  const [checkingAll, setCheckingAll] = useState(false);

  const alerts = useMemo(
    () => watchlist.filter((w) => w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice).length,
    [watchlist]
  );

  const addWatch = () => {
    if (!input.name) { toast.error("Enter card name"); return; }
    setWatchlist((p) => [...p, { id: uid(), ...input, targetPrice: parseFloat(input.targetPrice) || 0, currentPrice: null, priceHistory: null, checking: false }]);
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

  const checkAllPrices = async () => {
    if (watchlist.length === 0) return;
    setCheckingAll(true);
    setWatchlist((p) => p.map((x) => ({ ...x, checking: true })));
    for (const w of watchlist) {
      const d = await aiPrice(w.name);
      if (d) {
        setWatchlist((p) => p.map((x) => (x.id === w.id ? { ...x, checking: false, currentPrice: parseFloat(d.priceEstimate?.mid) || x.currentPrice, priceHistory: d.priceHistory } : x)));
      } else {
        setWatchlist((p) => p.map((x) => (x.id === w.id ? { ...x, checking: false } : x)));
      }
    }
    setCheckingAll(false); toast.success("All prices checked");
  };

  const removeWatch = (id) => {
    if (window.confirm("Remove from watchlist?")) setWatchlist((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div>
      <div className="flex items-center gap-8 mb-10">
        <h2 className="section-title" style={{ marginBottom: 0 }}>Watchlist</h2>
        {alerts > 0 && <span className="badge badge-grn">{alerts} alerts</span>}
      </div>

      <div className="card-elevated mb-12">
        <div className="form-grid">
          <input className="inp" placeholder="Card name *" value={input.name} onChange={(e) => setInput((p) => ({ ...p, name: e.target.value }))} />
          <input className="inp" placeholder="Target price $" type="number" value={input.targetPrice} onChange={(e) => setInput((p) => ({ ...p, targetPrice: e.target.value }))} />
        </div>
        <div className="flex gap-6 mt-8">
          <button className="btn btn-primary btn-sm" onClick={addWatch}><IconPlus size={12} /> Watch</button>
          {watchlist.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={checkAllPrices} disabled={checkingAll}>
              {checkingAll ? <Spinner size={12} /> : <IconRefresh size={12} />} Check All
            </button>
          )}
        </div>
      </div>

      {watchlist.length === 0 && (
        <div className="card empty-state" style={{ padding: 32 }}>
          <div className="empty-desc">No cards on your watchlist</div>
        </div>
      )}

      {watchlist.map((w) => {
        const hit = w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice;
        return (
          <div key={w.id} className="card mb-6" style={{ borderColor: hit ? "var(--grn-brd)" : undefined }}>
            <div className="flex justify-between items-center">
              <strong className="text-sm">{w.name}</strong>
              {w.currentPrice
                ? <span className={`fw-800 ${hit ? "text-grn" : "gold"}`} style={{ fontSize: 15 }}>{fmtShort(w.currentPrice)}</span>
                : <span className="text-dim">&mdash;</span>
              }
            </div>
            {hit && <div className="badge badge-grn mt-4">At/below {fmtShort(w.targetPrice)} target!</div>}
            <div className="flex gap-6 mt-6 items-center">
              <button className="btn btn-primary btn-sm" style={{ padding: "4px 10px" }} onClick={() => checkPrice(w.id)} disabled={w.checking}>
                {w.checking ? <Spinner size={10} /> : <IconRefresh size={12} />}
              </button>
              <div className="flex-1" />
              <button className="btn btn-ghost btn-sm" style={{ padding: "4px 6px", color: "var(--red)" }} onClick={() => removeWatch(w.id)}><IconX size={12} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
