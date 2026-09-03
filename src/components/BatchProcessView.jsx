import { fmtShort } from "../lib/utils";
import { IconCheck, IconX, IconZap, Spinner } from "./Icons";

/**
 * Batch processing view: shows progress, results, and review queue.
 */
export default function BatchProcessView({ queue, processing, processedCount, onSaveAll, onRetry, onApprove, onRemove, onCancel }) {
  const done = queue.filter((c) => c.status === "done");
  const review = queue.filter((c) => c.status === "review");
  const failed = queue.filter((c) => c.status === "failed");
  const approved = queue.filter((c) => c.status === "done" || c.status === "approved");

  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <div className="flex justify-between items-center mb-8">
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Batch Results</h2>
          <span className="badge badge-dim">{queue.length} cards</span>
        </div>

        {processing && (
          <div className="mb-10">
            <div className="flex justify-between items-center text-xs mb-4">
              <span><Spinner size={12} /> Processing...</span>
              <span className="fw-700">{processedCount}/{queue.length}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--s3)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: (processedCount / queue.length * 100) + "%", background: "var(--acc)", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
      </div>

      {review.length > 0 && (
        <div className="card mb-12" style={{ borderColor: "var(--acc-brd)" }}>
          <div className="lbl" style={{ color: "var(--acc)" }}>Needs Review ({review.length})</div>
          {review.map((item) => (
            <div key={item.id} className="flex items-center gap-8 mt-8">
              <img src={item.front} alt="" style={{ height: 48, width: 34, borderRadius: 4, objectFit: "cover", border: "1px solid var(--brd)" }} />
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="text-xs fw-700 truncate">{item.result?.name || "Unknown"}</div>
                <div className="text-xxs text-dim">{item.result?.set || ""} {item.result?.confidence ? Math.round(item.result.confidence * 100) + "%" : "low confidence"}</div>
              </div>
              <span className="badge" style={{ background: "var(--acc-bg)", color: "var(--acc)" }}>Review</span>
              <button className="btn btn-ghost btn-sm" disabled={processing} onClick={() => onApprove?.(item.id)}><IconCheck size={12} /></button>
              <button className="btn btn-ghost btn-sm" disabled={processing} onClick={() => onRetry(item.id)}><IconZap size={12} /></button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => onRemove(item.id)}><IconX size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="card mb-12" style={{ borderColor: "var(--red-brd)" }}>
          <div className="lbl" style={{ color: "var(--red)" }}>Failed ({failed.length})</div>
          {failed.map((item) => (
            <div key={item.id} className="flex items-center gap-8 mt-8">
              <img src={item.front} alt="" style={{ height: 48, width: 34, borderRadius: 4, objectFit: "cover", border: "1px solid var(--red-brd)" }} />
              <div className="flex-1 text-xs text-dim truncate">{item.error || "Identification failed"}</div>
              <button className="btn btn-ghost btn-sm" disabled={processing} onClick={() => onRetry(item.id)}><IconZap size={12} /> Retry</button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => onRemove(item.id)}><IconX size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="card mb-12">
          <div className="lbl">Identified ({done.length})</div>
          {done.map((item) => (
            <div key={item.id} className="flex items-center gap-8 mt-8">
              <img src={item.front} alt="" style={{ height: 48, width: 34, borderRadius: 4, objectFit: "cover", border: "1px solid var(--grn-brd)" }} />
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="text-xs fw-700 truncate">{item.result?.name || "Card"}</div>
                <div className="text-xxs text-dim">{item.result?.set || ""}</div>
              </div>
              {item.result?.priceEstimate?.mid > 0 && (
                <span className="gold fw-700">{fmtShort(item.result.priceEstimate.mid)}</span>
              )}
              <span className="badge badge-grn" style={{ fontSize: 10 }}>{Math.round((item.result?.confidence || 0) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {!processing && (
        <div className="flex gap-8">
          <button className="btn btn-primary btn-lg flex-1" disabled={approved.length === 0} onClick={onSaveAll}>
            <IconCheck size={14} /> Save {approved.length} Cards
          </button>
          <button className="btn btn-ghost btn-lg" onClick={onCancel}><IconX size={14} /></button>
        </div>
      )}
    </section>
  );
}
