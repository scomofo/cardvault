import { useState, useRef, useCallback, useEffect } from "react";
import Camera from "./Camera";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { itemsAPI, imagesAPI, presetsAPI } from "../lib/api";
import { CONDITIONS, TYPES } from "../lib/constants";
import { classifyListingViability } from "../lib/listingViability";
import { uid, fmtShort } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage, saveData, loadData, loadBatchSession, saveBatchSession } from "../lib/storage";
import { useFeeModels } from "../hooks/useFeeModels";
import { estimateSellingProceeds } from "../lib/sellingEstimate";
import { computeDHash } from "../lib/phash";
import { saveApprovedBatch, persistBatchRemoval } from "../lib/batchSave";
import { IconPlus, IconZap, IconX, Spinner } from "./Icons";

let pendingSessionWrite = Promise.resolve();
function persistIntake(queue) {
  const operation = pendingSessionWrite.catch(() => {}).then(() => saveBatchSession("tools", queue));
  pendingSessionWrite = operation;
  return operation;
}
const VIABILITY_LABELS = {
  bulk_lot: { color: "var(--orange)", label: "bulk lot" },
  not_worth_listing: { color: "var(--red)", label: "not worth listing" },
  review: { color: "var(--orange)", label: "review" },
};

export default function BatchView() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { catalog, setCatalog, useServer } = useData();
  const { getFeeRate } = useFeeModels(useServer);
  const [shippingCost, setShippingCost] = useState("4.99");
  const [restored, setRestored] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const queueRef = useRef([]);
  const calcNet = (price) => estimateSellingProceeds({ price, feeRate: getFeeRate("ebay"), shippingCost });
  const [queue, setQueue] = useState([]);
  const [cond, setCond] = useState("");
  const [type, setType] = useState("sports");
  const [binder, setBinder] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    pendingSessionWrite.catch(() => {}).then(() => loadBatchSession("tools")).then((saved) => {
      if (cancelled) return;
      if (!Array.isArray(saved)) throw new Error("Invalid saved batch");
      setQueue(saved);
      setRestored(true);
    }).catch((error) => { if (!cancelled) toastRef.current.error(`Cannot restore batch: ${error.message}. Reload before adding cards.`); });
    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  useEffect(() => {
    queueRef.current = queue;
    if (!restored) return;
    persistIntake(queue).catch((error) => toastRef.current.error(`Batch is not saved: ${error.message}. Keep this screen open.`));
  }, [queue, restored]);

  useEffect(() => {
    if (!useServer) return;
    presetsAPI.list().then(setPresets).catch(() => {});
  }, [useServer]);

  const updateItem = (id, patch) => {
    if (savingRef.current) return;
    setQueue((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeItem = async (id) => {
    if (!restored || processing || savingRef.current || !window.confirm("Remove this unsaved scan?")) return;
    savingRef.current = true;
    setProcessing(true);
    try {
      await persistBatchRemoval({ queue: queueRef.current, id, persist: persistIntake,
        apply: (remaining) => {
          queueRef.current = remaining;
          if (mountedRef.current) setQueue(remaining);
        },
      });
    } catch (error) { toast.error(`Scan was not removed: ${error.message}. Please retry.`); }
    finally {
      savingRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  };

  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); setDragging(false);
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length || !restored || processing || savingRef.current) return;
    const newItems = [];
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader(); r.onload = (ev) => resolve(ev.target.result); r.onerror = () => resolve(null); r.readAsDataURL(file);
      });
      if (!dataUrl) { toast.error(`Could not read ${file.name}; it was not added.`); continue; }
      newItems.push({ id: uid(), frontImg: dataUrl, backImg: null, name: "", set: "", year: "", number: "", condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null });
    }
    const nextQueue = [...queueRef.current, ...newItems];
    try { await persistIntake(nextQueue); }
    catch (error) { toast.error(`Photos were not saved: ${error.message}. Drop them again after freeing storage.`); return; }
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    toast.info(`Added ${newItems.length} photo${newItems.length > 1 ? "s" : ""}`);
    setProcessing(true);
    let identified = 0;
    for (let i = 0; i < newItems.length; i++) {
      setProgress({ current: i + 1, total: newItems.length, action: "Identifying" });
      const r = await aiRecognize(newItems[i].frontImg);
      if (r?.name) { setQueue((p) => p.map((x) => (x.id === newItems[i].id ? { ...x, ...r } : x))); identified++; }
    }
    setProgress(null); setProcessing(false);
    if (identified > 0) toast.success(`Identified ${identified}/${newItems.length} cards`);
  }, [cond, type, toast, restored, processing]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);

  const idAll = async () => {
    if (processing || savingRef.current || !restored) return;
    const items = queue.filter((i) => i.frontImg && !i.name);
    if (!items.length) return;
    setProcessing(true); let identified = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, action: "Identifying" });
      const r = await aiRecognize(items[i].frontImg);
      if (r?.name) { updateItem(items[i].id, r); identified++; }
    }
    setProgress(null); toast.success(`Identified ${identified} cards`); setProcessing(false);
  };

  const priceAll = async () => {
    if (processing || savingRef.current || !restored) return;
    const items = queue.filter((i) => i.name && !i.priceEstimate);
    if (!items.length) return;
    setProcessing(true); let priced = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, action: "Pricing" });
      const d = await aiPrice(items[i].name + " " + (items[i].set || ""));
      if (d) { updateItem(items[i].id, { priceEstimate: { ...d.priceEstimate, evidence: "ai_estimate_unverified", results: d.results || [] }, priceHistory: d.priceHistory }); priced++; }
    }
    setProgress(null); toast.success(`Priced ${priced} cards`); setProcessing(false);
  };

  const savePreset = async () => {
    const name = window.prompt("Preset name");
    if (!name?.trim()) return;
    try {
      const preset = await presetsAPI.create({
        name: name.trim(),
        defaults: { condition: cond, type, binder, minPrice },
      });
      setPresets((current) => [preset, ...current]);
      toast.success("Preset saved");
    } catch (err) {
      toast.error(`Preset save failed: ${err.message}`);
    }
  };

  const saveAll = async () => {
    if (savingRef.current || processing || !restored) return;
    if (!CONDITIONS.some((entry) => entry.v === cond)) { toast.error("Choose the condition you inspected for this batch"); return; }
    const named = queueRef.current.filter((item) => item.name?.trim()).map((item) => ({ ...item, status: "approved" }));
    if (!named.length) return;
    const floor = Number(minPrice) || 0;
    const belowFloor = named.filter((item) => Number(item.priceEstimate?.mid) > 0 && Number(item.priceEstimate.mid) < floor);
    if (belowFloor.length && !window.confirm(`${belowFloor.length} cards are below ${fmtShort(floor)}. Save as inventory anyway?`)) return;
    savingRef.current = true;
    setProcessing(true);
    const entries = new Map();
    try {
      const summary = await saveApprovedBatch({
        queue: named,
        persist: async (item) => {
          if (!mountedRef.current) throw new Error("Resume this batch to finish saving");
          const id = item.id;
          const frontImgId = item.frontImg ? `img_${id}_front` : null;
          const backImgId = item.backImg ? `img_${id}_back` : null;
          for (const [imageId, image] of [[frontImgId, item.frontImg], [backImgId, item.backImg]]) {
            if (!imageId) continue;
            await saveImage(imageId, image);
            if (useServer) await imagesAPI.upload(imageId, image);
          }
          let entry = {
            id, name: item.name, set: item.set, cardSet: item.set, year: item.year,
            number: item.number, cardNumber: item.number, parallel: item.parallel || "", rarity: item.rarity || "",
            condition: cond, type: item.type || type, binder,
            costBasis: Number(item.costBasis) || 0,
            priceEstimate: { ...item.priceEstimate, evidence: "ai_estimate_unverified", costBasisKnown: item.costBasis !== "" && item.costBasis != null },
            priceHistory: item.priceHistory, marketPrice: Number(item.priceEstimate?.mid) || 0,
            frontImgId, backImgId, frontImgPhash: item.frontImg ? await computeDHash(item.frontImg) : null,
            status: "inventory", listedOn: [], createdAt: item.createdAt || new Date().toISOString(),
          };
          if (useServer) entry = { ...entry, ...await itemsAPI.create(entry) };
          const previous = loadData("catalog", catalog);
          if (!saveData("catalog", [entry, ...previous.filter((card) => card.id !== id)])) throw new Error("Local storage full; scan retained for retry");
          entries.set(id, entry);
        },
        onSaved: async (item) => {
          if (!mountedRef.current) throw new Error("Saved card; resume to finish clearing this scan");
          const remaining = queueRef.current.filter((scan) => scan.id !== item.id);
          await persistIntake(remaining);
          queueRef.current = remaining;
          setQueue(remaining);
          const entry = entries.get(item.id);
          setCatalog((previous) => [entry, ...previous.filter((card) => card.id !== entry.id)]);
        },
        onError: (item, error) => { if (mountedRef.current) toast.error(`${item.name}: ${error.message}`); },
      });
      if (mountedRef.current) toast.info(`${summary.savedIds.length} saved; ${queueRef.current.length} scans remain. Nothing was published.`);
    } finally { savingRef.current = false; if (mountedRef.current) setProcessing(false); }
  };

  const floor = parseFloat(minPrice) || 0;
  const totalNet = queue.reduce((s, i) => {
    const net = calcNet(i.priceEstimate?.mid);
    return s + (net ?? 0);
  }, 0);

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className={`drop-zone mb-12 ${dragging ? "dragging" : ""}`}>
        <div className="drop-icon">{"📷"}</div>
        <div className="fw-700" style={{ fontSize: 15, color: dragging ? "var(--acc)" : "var(--tx)" }}>
          {dragging ? "Drop photos here" : "Drag & drop card photos"}
        </div>
        <div className="text-xs text-dim mt-4">Drop photos to auto-identify, or add a manual card below</div>
      </div>

      <div className="card mb-12">
        <div className="lbl">Batch defaults</div>
        <label className="text-xs">Estimated postage per card (CAD)
          <input aria-label="Estimated postage" className="inp mt-4 mb-8" type="number" min="0" step="0.01" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} />
        </label>
        <div className="text-xxs text-dim mb-8">Uses your configured eBay fee rate. Proceeds exclude acquisition cost, packaging and other unmodelled charges; they are not profit. AI prices require verification.</div>
        <div className="flex gap-8 flex-wrap">
          <select aria-label="Inspected batch condition" disabled={processing} className="inp flex-1" value={cond} onChange={(e) => setCond(e.target.value)}>
            <option value="">Choose inspected condition</option>
            {CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
          <select className="inp flex-1" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <input className="inp flex-1" value={binder} onChange={(e) => setBinder(e.target.value)} placeholder="Binder" />
          <input
            className="inp flex-1"
            type="number"
            step="0.01"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Floor price $"
            title="Minimum price — items below this will require confirmation before saving"
          />
        </div>
        {useServer && (
          <div className="flex gap-8 flex-wrap mt-8">
            <select
              className="inp flex-1"
              value=""
              onChange={(e) => {
                const preset = presets.find((entry) => entry.id === e.target.value);
                if (!preset?.defaults) return;
                if (preset.defaults.condition) setCond(preset.defaults.condition);
                if (preset.defaults.type) setType(preset.defaults.type);
                if (preset.defaults.binder != null) setBinder(preset.defaults.binder);
                if (preset.defaults.minPrice != null) setMinPrice(preset.defaults.minPrice);
              }}
            >
              <option value="">Load preset</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" type="button" onClick={savePreset}>
              Save preset
            </button>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="glass flex justify-between items-center mb-10" style={{ padding: "12px 16px", borderRadius: "var(--radius)" }}>
          <div>
            <span className="text-sm text-dim">
              Est. proceeds (priced cards only): <strong className="gold">{fmtShort(totalNet)}</strong>
            </span>
            {progress && (
              <div className="flex items-center gap-6 mt-4">
                <Spinner size={12} />
                <span className="text-xs text-acc fw-600">{progress.action} {progress.current}/{progress.total}</span>
              </div>
            )}
          </div>
          <div className="flex gap-6">
            <button className="btn btn-primary btn-sm" onClick={idAll} disabled={processing}><IconZap size={12} /> ID All</button>
            <button className="btn btn-primary btn-sm" onClick={priceAll} disabled={processing}>Price All</button>
            <button className="btn btn-outline btn-sm" disabled={processing || !restored || !cond} onClick={saveAll}>Save named cards</button>
          </div>
        </div>
      )}

      {queue.map((item, idx) => {
        const mid = parseFloat(item.priceEstimate?.mid) || 0;
        const net = calcNet(mid);
        const belowFloor = floor > 0 && mid > 0 && mid < floor;
        const viability = classifyListingViability({ mid, net, floor });
        const viabilityLabel = VIABILITY_LABELS[viability];
        return (
          <div key={item.id} className="card fade mb-10" style={{ padding: 14, animationDelay: `${idx * .04}s` }}>
            <div className="flex gap-8 mb-8">
              <Camera side="front" image={item.frontImg} onCapture={(img) => updateItem(item.id, { frontImg: img })} onRetake={() => updateItem(item.id, { frontImg: null })} compact />
              <Camera side="back" image={item.backImg} onCapture={(img) => updateItem(item.id, { backImg: img })} onRetake={() => updateItem(item.id, { backImg: null })} compact />
            </div>
            <div className="form-grid mb-6">
              <input className="inp" placeholder="Name" value={item.name || ""} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
              <input className="inp" placeholder="Set" value={item.set || ""} onChange={(e) => updateItem(item.id, { set: e.target.value })} />
              <input className="inp" placeholder="#" value={item.number || ""} onChange={(e) => updateItem(item.id, { number: e.target.value })} />
              <input className="inp" placeholder="Cost $" value={item.costBasis || ""} onChange={(e) => updateItem(item.id, { costBasis: e.target.value })} />
            </div>
            <div className="flex items-center gap-6">
              {mid > 0 && (
                <span className="gold fw-800" style={{ fontSize: 16 }}>{fmtShort(mid)}</span>
              )}
              {net !== null && (
                <span className="text-xs fw-600" style={{ color: net >= 0 ? "var(--grn)" : "var(--red)" }}>
                  proceeds {fmtShort(net)}
                </span>
              )}
              {belowFloor && (
                <span className="text-xs fw-700" style={{ color: "var(--red)" }}>
                  below floor
                </span>
              )}
              {viabilityLabel && (
                <span className="text-xs fw-700" style={{ color: viabilityLabel.color }}>
                  {viabilityLabel.label}
                </span>
              )}
              <div className="flex-1" />
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} disabled={processing} aria-label="Remove scan" onClick={() => removeItem(item.id)}><IconX size={12} /></button>
            </div>
          </div>
        );
      })}

      <button className="btn btn-primary btn-full btn-lg" disabled={processing || !restored} onClick={() => setQueue((p) => [...p, {
        id: uid(), frontImg: null, backImg: null, name: "", set: "", year: "", number: "",
        condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null,
      }])}><IconPlus size={14} /> Add Manual Card</button>
    </div>
  );
}
