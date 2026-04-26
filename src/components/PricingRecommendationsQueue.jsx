import { useState, useEffect } from "react";
import { pricingRecsAPI } from "../lib/api";
import { useData } from "../lib/DataContext";
import { Spinner } from "./Icons";

const STRATEGY_LABEL = { quick_sale: "Quick Sale", market: "Market", premium: "Premium" };
const CONFIDENCE_STYLE = { high: "var(--grn)", medium: "var(--orange)", low: "var(--dim)" };

function fmt(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PricingRecommendationsQueue() {
  const { useServer } = useData();
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState({});

  useEffect(() => {
    if (!useServer) return;
    setLoading(true);
    pricingRecsAPI.list().then(setRecs).catch(() => setRecs([])).finally(() => setLoading(false));
  }, [useServer]);

  if (!useServer) return null;

  const handleApply = async (rec) => {
    setApplying((p) => ({ ...p, [rec.id]: "applying" }));
    try {
      await pricingRecsAPI.apply(rec.id);
      setApplying((p) => ({ ...p, [rec.id]: "done" }));
    } catch {
      setApplying((p) => ({ ...p, [rec.id]: "error" }));
    }
  };

  const handleDismiss = async (id) => {
    try {
      await pricingRecsAPI.dismiss(id);
      setRecs((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  };

  if (loading) return <div className="card mb-12"><div className="lbl">Pricing Recommendations</div><Spinner size={14} /></div>;
  if (!recs.length) return null;

  // Group by item
  const byItem = {};
  for (const r of recs) {
    if (!byItem[r.item_id]) byItem[r.item_id] = { name: r.item_name, set: r.item_set, recs: [] };
    byItem[r.item_id].recs.push(r);
  }

  return (
    <div className="card mb-12">
      <div className="flex justify-between items-center mb-8">
        <div className="lbl" style={{ margin: 0 }}>Pricing Recommendations</div>
        <span className="badge badge-acc">{recs.length}</span>
      </div>
      <div className="text-xxs text-dim mb-10">Apply suggested prices based on recent market data.</div>
      {Object.entries(byItem).map(([itemId, { name, set, recs: itemRecs }]) => (
        <div key={itemId} className="card-elevated mb-8" style={{ padding: "10px 12px" }}>
          <div className="text-xs fw-700 mb-6">{name || "Unknown card"}{set ? ` · ${set}` : ""}</div>
          <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
            {itemRecs.map((rec) => {
              const state = applying[rec.id];
              return (
                <div key={rec.id} style={{ minWidth: 110, flex: "1 1 110px", border: "1px solid var(--brd)", borderRadius: "var(--radius)", padding: "6px 8px" }}>
                  <div className="flex justify-between items-center">
                    <span className="text-xxs" style={{ color: "var(--acc)" }}>{STRATEGY_LABEL[rec.strategy] || rec.strategy}</span>
                    <span className="text-xxs" style={{ color: CONFIDENCE_STYLE[rec.confidence] || "var(--dim)" }}>{rec.confidence}</span>
                  </div>
                  <div className="fw-800 mt-4" style={{ fontSize: 15 }}>{fmt(rec.recommended_price_cents)}</div>
                  {rec.minimum_acceptable_price_cents > 0 && (
                    <div className="text-xxs text-dim">min {fmt(rec.minimum_acceptable_price_cents)}</div>
                  )}
                  <div className="flex gap-4 mt-6">
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, fontSize: 10, padding: "2px 0" }}
                      onClick={() => handleApply(rec)}
                      disabled={!!state}
                    >
                      {state === "applying" ? <Spinner size={10} /> : state === "done" ? "Applied" : state === "error" ? "Error" : "Apply"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: "2px 6px" }}
                      onClick={() => handleDismiss(rec.id)}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
