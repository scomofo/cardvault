import { useState } from "react";
import { useBatchDraft } from "../hooks/useBatchDraft";
import { CONDITIONS } from "../lib/constants";
import { conditionLabel } from "../lib/batchDraft";
import BatchPublishPanel from "./batch/BatchPublishPanel";
import BatchCaptureMode from "./BatchCaptureMode";
import BatchDraftRow from "./batch/BatchDraftRow";
import BatchInventoryPicker from "./batch/BatchInventoryPicker";
import "../styles/batchSell.css";

const FILTERS = [["all", "All"], ["review", "Needs review"], ["ready", "Ready"], ["lot", "Lot / low return"], ["saved", "Saved drafts"]];
export default function BatchSellView({ onNavigate }) {
  const actions = useBatchDraft();
  const [capture, setCapture] = useState(false), [paired, setPaired] = useState(false), [filter, setFilter] = useState("all");
  const [presetName, setPresetName] = useState(""), [condition, setCondition] = useState("");
  if (actions.loading || actions.data.loading) return <section className="batch-sell"><h1>Sell a batch</h1><p role="status">Restoring your selling queue…</p></section>;
  if (!actions.session) return <section className="batch-sell"><h1>Sell a batch</h1><p role="alert">{actions.error || "The batch could not be loaded. Your stored data has not been cleared."}</p><button className="btn btn-primary" onClick={actions.reload}>Retry loading</button></section>;
  const { entries, defaults, presets } = actions.session;
  const disabled = Boolean(actions.busy || actions.error);
  const counts = Object.fromEntries(FILTERS.map(([key]) => [key, key === "all" ? entries.length : entries.filter((entry) => actions.readiness(entry).bucket === key).length]));
  const readyCount = entries.filter((entry) => entry.selected && actions.readiness(entry).ready).length;
  const unfinished = entries.filter((entry) => entry.stage !== "saved");
  const selectedPhotos = unfinished.filter((entry) => entry.selected && entry.source === "photo").length;
  const importFiles = (files) => { if (files.length) actions.importPhotos([...files], paired); };

  return <section className="batch-sell fade" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) importFiles(event.dataTransfer.files); }}>
    <header className="batch-heading"><div><h1>Sell a batch</h1><p>Photos or inventory → reviewed drafts → check and explicitly approve publication.</p></div><span className="badge badge-dim">{actions.data.useServer ? "Server connected" : "Offline / local drafts"}</span></header>
    <p className="batch-status" role="status">{actions.busy || (actions.saving ? "Saving your changes…" : "Batch saved on this browser and device")}</p>
    {actions.error && <div className="card batch-error" role="alert">{actions.error}<button className="btn btn-outline" onClick={actions.reload}>Reload saved batch</button></div>}
    {!actions.data.useServer && <p className="batch-warning">Drafts stay on this device until server sync. Reconnect and check the latest inventory before live publication.</p>}
    {capture ? <BatchCaptureMode queue={entries.filter((entry) => entry.stage !== "saved")} onAddToQueue={actions.capture} onDone={() => setCapture(false)} onCancel={() => setCapture(false)} /> : <>
      <div className="card batch-intake"><h2>Add your cards</h2><div className="batch-toolbar"><button className="btn btn-primary" disabled={disabled} onClick={() => setCapture(true)}>Photograph cards</button><button className="btn btn-outline" disabled={disabled} onClick={actions.addManual}>Add manual card</button><label className={`btn btn-outline batch-upload ${disabled ? "disabled" : ""}`}>Import photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => { importFiles(event.target.files); event.target.value = ""; }} /></label><label className="batch-check"><input type="checkbox" checked={paired} disabled={disabled} onChange={(event) => setPaired(event.target.checked)} />Front/back pairs in selection order</label></div><p className="batch-help">Drag photos here too. Unpaired photos become separate fronts; add their backs during review. Camera frames are saved after you add the card.</p></div>
      <BatchInventoryPicker actions={actions} disabled={disabled} />
    </>}
    <details className="card" open={!entries.length}>
      <summary>Selling defaults and saved presets</summary>
      <fieldset disabled={disabled} className="batch-fields">
        <p className="batch-help">These are your estimates, not live carrier quotes. New cards inherit these defaults; existing queue entries change only when you apply them.</p>
        <div className="batch-form-grid">{[["buyerShipping", "Buyer shipping (CAD)"], ["shippingCost", "Estimated postage (CAD)"], ["packagingCost", "Packaging (CAD)"], ["minProceeds", "Minimum proceeds (CAD)"]].map(([key, label]) => <label key={key}>{label}<input className="inp" type="number" min="0" step="0.01" value={defaults[key]} onChange={(event) => actions.changeDefaults({ [key]: event.target.value })} /></label>)}<label>Storage location for new cards<input className="inp" value={defaults.storageLocation} onChange={(event) => actions.changeDefaults({ storageLocation: event.target.value })} placeholder="Box / divider" /></label></div>
        <div className="batch-toolbar"><button className="btn btn-outline" onClick={actions.applyDefaults} disabled={!unfinished.some((entry) => entry.selected)}>Apply defaults to selected</button><label>Saved preset<select className="inp" value="" onChange={(event) => { const preset = presets.find((item) => item.name === event.target.value); if (preset) actions.changeDefaults(preset.defaults); }}><option value="">Load a preset</option>{presets.map((preset) => <option key={preset.name}>{preset.name}</option>)}</select></label><label>Preset name<input className="inp" value={presetName} maxLength={80} onChange={(event) => setPresetName(event.target.value)} /></label><button className="btn btn-ghost" disabled={!presetName.trim()} onClick={() => actions.savePreset(presetName)}>Save preset</button></div>
      </fieldset>
    </details>
    <div className="batch-filters" aria-label="Filter selling queue">{FILTERS.map(([key, label]) => <button key={key} className={`chip ${filter === key ? "active" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <strong>{counts[key]}</strong></button>)}</div>
    {unfinished.length > 0 && <div className="card batch-toolbar">
      <label className="batch-check"><input type="checkbox" disabled={disabled} checked={unfinished.every((entry) => entry.selected)} onChange={(event) => actions.selectAll(event.target.checked)} />Select all unfinished</label>
      <button className="btn btn-outline" disabled={disabled || !selectedPhotos} onClick={() => actions.identify()}>Identify unnamed photos</button>
      <label>Inspected photo-card condition<select className="inp" value={condition} disabled={disabled} onChange={(event) => setCondition(event.target.value)}><option value="">Choose condition</option>{CONDITIONS.map((item) => <option key={item.v} value={item.v}>{conditionLabel(item.v)}</option>)}</select></label>
      <button className="btn btn-outline" disabled={disabled || !condition || !selectedPhotos} onClick={() => actions.inspectSelected(condition)}>Apply inspected condition ({selectedPhotos})</button>
    </div>}
    {!entries.length && <div className="card batch-empty"><h2>Your next sale starts here</h2><p>Photograph a stack or choose cards you already own. Your photos, edits and unfinished reviews stay together.</p></div>}
    {entries.filter((entry) => filter === "all" || actions.readiness(entry).bucket === filter).map((entry) => <BatchDraftRow key={entry.id} entry={entry} actions={actions} disabled={disabled} onNavigate={onNavigate} />)}
    <BatchPublishPanel listings={actions.data.listings} useServer={actions.data.useServer} onNavigate={onNavigate} />
    {entries.length > 0 && <footer className="card batch-save-bar"><div><strong>{readyCount} selected ready for drafts</strong><p className="batch-help">{counts.review} need review · {counts.lot} held for lots / low return · {counts.saved} saved</p><p className="batch-help">Estimated proceeds use {(actions.feeRate * 100).toFixed(2)}% fees on price + buyer shipping, less postage and packaging. Not profit; acquisition cost and other charges are excluded.</p></div><div className="batch-toolbar"><button className="btn btn-primary" disabled={disabled || actions.saving || !readyCount} onClick={actions.saveSelected}>Save {readyCount} reviewed drafts</button>{counts.saved > 0 && <button className="btn btn-ghost" disabled={disabled} onClick={actions.clearFinished}>Clear finished from queue</button>}</div></footer>}
  </section>;
}
