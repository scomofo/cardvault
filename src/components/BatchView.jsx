import { useState, useCallback } from "react";
import Camera from "./Camera";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { itemsAPI } from "../lib/api";
import { CONDITIONS, TYPES } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage } from "../lib/storage";
import { IconPlus, IconZap, IconX, Spinner } from "./Icons";

const BATCH_FEE_RATE = 0.1312; // eBay default for net estimate
const BATCH_SHIP = 4.99;

function calcNet(midPrice) {
  const p = parseFloat(midPrice) || 0;
  if (!p) return null;
  return Math.round((p - p * BATCH_FEE_RATE - BATCH_SHIP) * 100) / 100;
}

export default function BatchView() {
  const toast = useToast();
  const { setCatalog, useServer } = useData();
  const [queue, setQueue] = useState([]);
  const [cond, setCond] = useState("near_mint");
  const [type, setType] = useState("sports");
  const [binder, setBinder] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);

  const updateItem = (id, patch) => setQueue((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); setDragging(false);
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const newItems = [];
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader(); r.onload = (ev) => resolve(ev.target.result); r.readAsDataURL(file);
      });
      newItems.push({ id: uid(), frontImg: dataUrl, backImg: null, name: "", set: "", year: "", number: "", condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null });
    }
    setQueue((p) => [...p, ...newItems]);
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
  }, [cond, type, toast]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);

  const idAll = async () => {
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
    const items = queue.filter((i) => i.name && !i.priceEstimate);
    if (!items.length) return;
    setProcessing(true); let priced = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, action: "Pricing" });
      const d = await aiPrice(items[i].name + " " + (items[i].set || ""));
      if (d) { updateItem(items[i].id, { priceEstimate: d.priceEstimate, priceHistory: d.priceHistory }); priced++; }
    }
    setProgress(null); toast.success(`Priced ${priced} cards`); setProcessing(false);
  };

  const saveAll = async () => {
    const named = queue.filter((i) => i.name);
    if (!named.length) return;

    const floor = parseFloat(minPrice) || 0;
    const belowFloor = floor > 0 ? named.filter((i) => {
      const mid = parseFloat(i.priceEstimate?.mid) || 0;
      return mid > 0 && mid < floor;
    }) : [];
    if (belowFloor.length > 0 && !window.confirm(`${belowFloor.length} card(s) are priced below your floor of ${fmtShort(floor)}. Save anyway?`)) {
      return;
    }

    const items = [];
    for (const item of named) {
      const id = uid();
      let frontImgId = null, backImgId = null;
      if (item.frontImg) { frontImgId = `img_${id}_front`; await saveImage(frontImgId, item.frontImg); }
      if (item.backImg) { backImgId = `img_${id}_back`; await saveImage(backImgId, item.backImg); }
      items.push({
        id, name: item.name, cardSet: item.set, year: item.year, cardNumber: item.number,
        condition: item.condition || cond, type: item.type || type, binder,
        costBasis: parseFloat(item.costBasis) || 0,
        priceEstimate: item.priceEstimate, priceHistory: item.priceHistory,
        marketPrice: parseFloat(item.priceEstimate?.mid) || 0,
        frontImgId, backImgId, status: "inventory", listedOn: [],
      });
    }

    if (useServer) {
      try {
        const result = await itemsAPI.bulkCreate(items);
        setCatalog((p) => [...(result.created || items), ...p]);
        toast.success(`Saved ${items.length} cards to server`);
      } catch (err) {
        toast.error(`Server save failed: ${err.message} — saved locally`);
        setCatalog((p) => [...items.map((i) => ({ ...i, createdAt: new Date().toISOString() })), ...p]);
      }
    } else {
      setCatalog((p) => [...items.map((i) => ({ ...i, createdAt: new Date().toISOString() })), ...p]);
      toast.success(`Saved ${items.length} cards`);
    }

    setQueue([]);
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
        <div className="text-xs text-dim mt-4">Drop multiple images to auto-identify with AI</div>
      </div>

      <div className="card mb-12">
        <div className="lbl">Batch defaults</div>
        <div className="flex gap-8 flex-wrap">
          <select className="inp flex-1" value={cond} onChange={(e) => setCond(e.target.value)}>
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
      </div>

      {queue.length > 0 && (
        <div className="glass flex justify-between items-center mb-10" style={{ padding: "12px 16px", borderRadius: "var(--radius)" }}>
          <div>
            <span className="text-sm text-dim">
              Est. net: <strong className="gold">{fmtShort(totalNet)}</strong>
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
            <button className="btn btn-outline btn-sm" onClick={saveAll}>Save All</button>
          </div>
        </div>
      )}

      {queue.map((item, idx) => {
        const mid = parseFloat(item.priceEstimate?.mid) || 0;
        const net = calcNet(mid);
        const belowFloor = floor > 0 && mid > 0 && mid < floor;
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
                  net {fmtShort(Math.max(net, 0))}
                </span>
              )}
              {belowFloor && (
                <span className="text-xs fw-700" style={{ color: "var(--red)" }}>
                  below floor
                </span>
              )}
              <div className="flex-1" />
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => setQueue((p) => p.filter((x) => x.id !== item.id))}><IconX size={12} /></button>
            </div>
          </div>
        );
      })}

      <button className="btn btn-primary btn-full btn-lg" onClick={() => setQueue((p) => [...p, {
        id: uid(), frontImg: null, backImg: null, name: "", set: "", year: "", number: "",
        condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null,
      }])}><IconPlus size={14} /> Add Card</button>
    </div>
  );
}
