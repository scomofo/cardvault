import { useState } from "react";
import { CONDITIONS } from "../lib/constants";
import { fmtShort } from "../lib/utils";
import { IconCheck, IconX, IconZap, Spinner } from "./Icons";

/** Review exceptions without discarding cards that are not ready to save. */
export default function BatchProcessView({ queue, processing, processedCount, onSaveAll, onRetry, onApprove, onRemove, onCancel }) {
  const [condition, setCondition] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const ready = queue.filter((item) => ["done", "approved"].includes(item.status));
  const review = queue.filter((item) => item.status === "review");
  const unfinished = queue.filter((item) => ["captured", "failed", "processing"].includes(item.status));

  const remove = (id) => {
    if (!processing && window.confirm("Remove this scan from the batch? This does not delete any saved card.")) onRemove(id);
  };

  function renderItem(item, needsReview = false) {
    return (
      <div key={item.id} className="card mt-8">
        <div className="flex items-center gap-8">
          {item.front && <img src={item.front} alt="Card front" style={{ height: 72, width: 50, borderRadius: 4, objectFit: "contain" }} />}
          {item.back && <img src={item.back} alt="Card back" style={{ height: 72, width: 50, borderRadius: 4, objectFit: "contain" }} />}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="text-xs fw-700">{item.result?.name || "Unidentified card"}</div>
            <div className="text-xxs text-dim">{[item.result?.year, item.result?.set, item.result?.number && `#${item.result.number}`, item.result?.parallel].filter(Boolean).join(" · ")}</div>
            {item.result && <div className="text-xxs text-dim mt-4">{item.status === "approved" ? "Match approved by you" : `${item.result.confidenceLabel || "Unconfirmed"} model confidence — check exact variant`}</div>}
            {!item.back && <div className="text-xxs text-dim mt-4">No back photo. Review before publishing.</div>}
            {item.result?.priceEstimate?.mid > 0 && <div className="text-xs mt-4">AI estimate: {fmtShort(item.result.priceEstimate.mid)} — not a verified sale price</div>}
          </div>
        </div>
        {item.error && <div role="alert" className="text-xs text-red mt-6">{item.error}</div>}
        <div className="flex gap-8 mt-8 flex-wrap">
          {needsReview && <button className="btn btn-outline btn-sm" disabled={processing} onClick={() => onApprove?.(item.id)}><IconCheck size={12} /> Confirm exact match</button>}
          <button className="btn btn-ghost btn-sm" disabled={processing} onClick={() => onRetry(item.id)}><IconZap size={12} /> Identify again</button>
          <button className="btn btn-ghost btn-sm" disabled={processing} onClick={() => remove(item.id)}><IconX size={12} /> Remove scan</button>
        </div>
      </div>
    );
  }

  return (
    <section className="slide-up" aria-busy={processing}>
      <div className="card-hero mb-12">
        <div className="flex justify-between items-center mb-8">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Batch review</h2>
          <span className="badge badge-dim">{queue.length} scans remaining</span>
        </div>
        <p className="text-xs text-dim">Only successfully saved cards leave this queue. Unfinished scans are saved on this device so you can resume later.</p>
        {processing && <div role="status" className="text-xs"><Spinner size={12} /> Working — {processedCount} completed in this operation</div>}
      </div>

      {unfinished.length > 0 && (
        <div className="card mb-12">
          <div className="lbl">Not yet identified ({unfinished.length})</div>
          <button className="btn btn-outline btn-sm mt-8" disabled={processing} onClick={() => onRetry()}><IconZap size={12} /> Resume identification</button>
          {unfinished.map((item) => renderItem(item))}
        </div>
      )}
      {review.length > 0 && (
        <div className="card mb-12">
          <div className="lbl">Needs your review ({review.length})</div>
          <p className="text-xs text-dim">Check the year, set, number and parallel. A model confidence label is not a measured probability.</p>
          {review.map((item) => renderItem(item, true))}
        </div>
      )}
      {ready.length > 0 && (
        <div className="card mb-12">
          <div className="lbl">Ready to save ({ready.length})</div>
          {ready.map((item) => renderItem(item))}
          <div className="form-grid mt-12">
            <label className="text-xs">
              Inspected condition for these cards
              <select className="inp mt-4" value={condition} disabled={processing} onChange={(event) => setCondition(event.target.value)}>
                <option value="">Choose condition — no automatic grade</option>
                {CONDITIONS.map((entry) => <option key={entry.v} value={entry.v}>{entry.l}</option>)}
              </select>
            </label>
            <label className="text-xs">
              Storage location (optional)
              <input className="inp mt-4" value={storageLocation} disabled={processing} onChange={(event) => setStorageLocation(event.target.value)} placeholder="Box 2 · Divider B" />
            </label>
          </div>
          <p className="text-xxs text-dim">This condition applies to the ready cards only. Saved cards remain inventory, not live marketplace listings.</p>
        </div>
      )}
      <div className="flex gap-8 flex-wrap">
        <button className="btn btn-primary btn-lg flex-1" disabled={processing || !condition || ready.length === 0} onClick={() => onSaveAll({ condition, storageLocation })}>
          <IconCheck size={14} /> Save {ready.length} ready cards
        </button>
        <button className="btn btn-ghost btn-lg" disabled={processing} onClick={onCancel}>Pause batch</button>
      </div>
    </section>
  );
}
