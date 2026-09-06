import { draftPreview, conditionLabel } from "../../lib/batchDraft";
import { CONDITIONS } from "../../lib/constants";
import { fmtShort } from "../../lib/utils";
import BatchPhoto from "./BatchPhoto";

export default function BatchDraftRow({ entry, actions, disabled, onNavigate }) {
  const status = actions.readiness(entry), preview = draftPreview(entry);
  const saved = entry.stage === "saved";
  const edit = (updates) => actions.patch(entry.id, updates);
  return (
    <article className={`card batch-row batch-row-${status.bucket}`}>
      <div className="batch-row-heading">
        <label className="batch-select">
          <input type="checkbox" checked={entry.selected} disabled={disabled || saved} onChange={(event) => edit({ selected: event.target.checked })} aria-label={`Select ${entry.card.name || "unnamed card"}`} />
          <BatchPhoto imageId={entry.frontImgId} alt={entry.card.name || "Front photo"} />
        </label>
        <div className="batch-row-name"><strong>{entry.card.name || "Card needs identification"}</strong><span>{[entry.card.year, entry.card.set, entry.card.parallel].filter(Boolean).join(" · ") || "Add card details below"}</span></div>
        <div className="batch-row-total"><span className="badge badge-dim">{saved ? "Draft saved" : status.bucket === "lot" ? "Lot / low return" : status.ready ? "Ready for draft" : "Needs review"}</span><strong>{status.proceeds == null ? "—" : fmtShort(status.proceeds)}</strong><small>Estimated proceeds</small></div>
      </div>
      {entry.error && <p className="batch-error" role="alert">{entry.error}</p>}
      {!saved && status.issues.length > 0 && <p className="batch-help">{status.issues.join(" · ")}</p>}
      {saved ? <div className="batch-toolbar"><span className="batch-help">Saved as a draft by this batch. Check Sales for its current marketplace status.</span>{onNavigate && <button className="btn btn-outline" onClick={() => onNavigate({ view: "sales", focus: { type: "listing", id: entry.listingId } })}>Open draft</button>}</div> : (
        <details>
          <summary>Review details, photos and listing preview</summary>
          <fieldset disabled={disabled} className="batch-fields">
            <div className="batch-photos">
              {["front", "back"].map((side) => <div key={side}>
                <BatchPhoto imageId={entry[`${side}ImgId`]} alt={`${side} of ${entry.card.name || "card"}`} />
                {entry.source === "photo" && <label className="btn btn-outline batch-upload">Add / replace {side}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) actions.replacePhoto(entry, side, file); }} /></label>}
              </div>)}
            </div>
            {entry.source === "inventory" && <p className="batch-help">Existing inventory card: identity, photos, condition and cost are preserved. To correct these, edit the card in Collection, then remove and reselect it here.</p>}
            <div className="batch-form-grid">
              {[["name", "Card / player name"], ["set", "Set"], ["year", "Year"], ["number", "Card number"], ["parallel", "Parallel / variant"]].map(([field, label]) => <label key={field}>{label}<input className="inp" value={entry.card[field] || ""} readOnly={entry.source === "inventory"} onChange={(event) => actions.updateCard(entry, field, event.target.value)} /></label>)}
              <label>Inspected condition<select className="inp" value={entry.card.condition} disabled={entry.source === "inventory"} onChange={(event) => actions.updateCard(entry, "condition", event.target.value)}><option value="">Choose condition</option>{CONDITIONS.map((condition) => <option key={condition.v} value={condition.v}>{conditionLabel(condition.v)}</option>)}</select></label>
            </div>
            <div className="batch-toolbar">
              <label className="batch-check"><input type="checkbox" checked={entry.identityConfirmed} onChange={(event) => edit({ identityConfirmed: event.target.checked })} />Exact identity and variant reviewed</label>
              <label className="batch-check"><input type="checkbox" checked={entry.conditionConfirmed} disabled={!entry.card.condition} onChange={(event) => edit({ conditionConfirmed: event.target.checked })} />I inspected this condition</label>
              {entry.source === "photo" && <button className="btn btn-outline" onClick={() => actions.identify(entry.id)}>Identify / retry</button>}
            </div>
            {entry.confidenceLabel && <p className="batch-help">AI match label: {entry.confidenceLabel}. This is not a calibrated probability or authentication.</p>}
            <div className="batch-form-grid">
              {[["price", "Selling price (CAD)"], ["buyerShipping", "Buyer pays shipping (CAD)"], ["shippingCost", "Estimated postage (CAD)"], ["packagingCost", "Packaging (CAD)"], ["minProceeds", "Minimum proceeds (CAD)"]].map(([field, label]) => <label key={field}>{label}<input className="inp" type="number" min="0" step="0.01" value={entry[field]} onChange={(event) => edit({ [field]: event.target.value, allowLowReturn: false })} /></label>)}
              <label>Storage location<input className="inp" value={entry.storageLocation || ""} readOnly={entry.source === "inventory"} onChange={(event) => edit({ storageLocation: event.target.value })} placeholder="Box 2 · Divider B · 017" /></label>
            </div>
            {entry.card.priceEstimate?.evidence === "ai_estimate_unverified" && <p className="batch-help">AI price estimate — unverified, not confirmed sold data. {entry.card.priceEstimate.results?.length || 0} source references retained.</p>}
            {entry.card.priceEstimate?.results?.length > 0 && <details><summary>Pricing source references</summary>{entry.card.priceEstimate.results.map((source, index) => <p className="batch-help" key={index}>{source.title || source.source || "Source"} — {source.price ?? "unknown price"} {source.currency || "currency not verified"} · {source.date || "date not verified"}</p>)}</details>}
            <label>Listing title ({preview.title.length}/80)<input className="inp" value={preview.title} maxLength={80} onChange={(event) => edit({ titleOverride: event.target.value })} /></label>
            <label>Listing description<textarea className="inp" rows={6} value={preview.description} maxLength={10000} onChange={(event) => edit({ descriptionOverride: event.target.value })} /></label>
            <div className="batch-toolbar"><button className="btn btn-ghost" onClick={() => edit({ titleOverride: null, descriptionOverride: null })}>Reset listing text from details</button><label className="batch-check"><input type="checkbox" checked={entry.disposition === "lot"} onChange={(event) => edit({ disposition: event.target.checked ? "lot" : "sell" })} />Hold for a lot instead</label></div>
            {status.belowFloor && <label className="batch-check batch-warning"><input type="checkbox" checked={entry.allowLowReturn} onChange={(event) => edit({ allowLowReturn: event.target.checked })} />Proceeds are below my minimum. Keep as an individual draft anyway.</label>}
            <div className="batch-toolbar"><span className="batch-help">Draft only · eBay Canada · Fixed price · Quantity 1</span><button className="btn btn-ghost" onClick={() => { if (window.confirm("Remove this card from the batch? Existing inventory and saved listings will not be deleted.")) actions.remove(entry.id); }}>Remove from batch</button></div>
          </fieldset>
        </details>
      )}
    </article>
  );
}
