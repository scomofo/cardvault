import { useState, useCallback } from "react";
import Camera from "./Camera";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { CONDITIONS, TYPES } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage } from "../lib/storage";

export default function BatchView() {
  const toast = useToast();
  const { setCatalog } = useData();
  const [queue, setQueue] = useState([]);
  const [cond, setCond] = useState("near_mint");
  const [type, setType] = useState("sports");
  const [binder, setBinder] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);

  const updateItem = (id, patch) =>
    setQueue((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Drag-and-drop handler: accept multiple images, create queue items, auto-identify
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;

    // Create queue entries from dropped files
    const newItems = [];
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = (ev) => resolve(ev.target.result);
        r.readAsDataURL(file);
      });
      newItems.push({
        id: uid(), frontImg: dataUrl, backImg: null, name: "", set: "", year: "", number: "",
        condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null,
      });
    }

    setQueue((p) => [...p, ...newItems]);
    toast.info(`Added ${newItems.length} photo${newItems.length > 1 ? "s" : ""}`);

    // Auto-identify all new items
    setProcessing(true);
    let identified = 0;
    for (let i = 0; i < newItems.length; i++) {
      setProgress({ current: i + 1, total: newItems.length, action: "Identifying" });
      const r = await aiRecognize(newItems[i].frontImg);
      if (r?.name) {
        setQueue((p) => p.map((x) => (x.id === newItems[i].id ? { ...x, ...r } : x)));
        identified++;
      }
    }
    setProgress(null);
    setProcessing(false);
    if (identified > 0) toast.success(`Identified ${identified}/${newItems.length} cards`);
  }, [cond, type, toast]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);

  const idAll = async () => {
    const items = queue.filter((i) => i.frontImg && !i.name);
    if (!items.length) return;
    setProcessing(true);
    let identified = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, action: "Identifying" });
      const r = await aiRecognize(items[i].frontImg);
      if (r?.name) { updateItem(items[i].id, r); identified++; }
    }
    setProgress(null);
    toast.success(`Identified ${identified} cards`);
    setProcessing(false);
  };

  const priceAll = async () => {
    const items = queue.filter((i) => i.name && !i.priceEstimate);
    if (!items.length) return;
    setProcessing(true);
    let priced = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress({ current: i + 1, total: items.length, action: "Pricing" });
      const d = await aiPrice(items[i].name + " " + (items[i].set || ""));
      if (d) { updateItem(items[i].id, { priceEstimate: d.priceEstimate, priceHistory: d.priceHistory }); priced++; }
    }
    setProgress(null);
    toast.success(`Priced ${priced} cards`);
    setProcessing(false);
  };

  const saveAll = async () => {
    const items = [];
    for (const item of queue.filter((i) => i.name)) {
      const id = uid();
      let frontImgId = null, backImgId = null;
      if (item.frontImg) { frontImgId = `img_${id}_front`; await saveImage(frontImgId, item.frontImg); }
      if (item.backImg) { backImgId = `img_${id}_back`; await saveImage(backImgId, item.backImg); }
      items.push({ id, ...item, frontImgId, backImgId, frontImg: undefined, backImg: undefined, binder, type: item.type || type, listing: {}, status: "inventory", listedOn: [], createdAt: new Date().toISOString() });
    }
    setCatalog((p) => [...items, ...p]);
    setQueue([]);
    toast.success(`Saved ${items.length} cards`);
  };

  return (
    <div className="fade" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Batch Scan</h2>

      {/* Drop zone */}
      <div className="card" style={{
        marginBottom: 12, textAlign: "center", padding: 28,
        borderStyle: "dashed", borderWidth: 2,
        borderColor: dragging ? "var(--acc)" : "var(--brd)",
        background: dragging ? "#d4a01712" : "transparent",
        transition: "all .2s",
      }}>
        <div style={{ fontSize: 40, marginBottom: 6, opacity: dragging ? 1 : 0.4 }}>{"\ud83d\udcf7"}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: dragging ? "var(--acc)" : "#fff" }}>
          {dragging ? "Drop photos here" : "Drag & drop card photos"}
        </div>
        <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
          Drop multiple images to auto-identify with AI
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="lbl">Defaults</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="inp" style={{ flex: 1 }} value={cond} onChange={(e) => setCond(e.target.value)}>
            {CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
          <select className="inp" style={{ flex: 1 }} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <input className="inp" style={{ flex: 1 }} value={binder} onChange={(e) => setBinder(e.target.value)} placeholder="Binder" />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="glass" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", marginBottom: 10, borderRadius: 10 }}>
          <div>
            <span style={{ fontSize: 13, color: "var(--dim)" }}>Total: <strong className="gold">{fmtShort(queue.reduce((s, i) => s + (parseFloat(i.priceEstimate?.mid) || 0), 0))}</strong></span>
            {progress && (
              <div style={{ fontSize: 12, color: "var(--acc)", fontWeight: 600, marginTop: 3 }}>
                {progress.action} {progress.current}/{progress.total}...
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button className="btn-a" style={{ padding: "6px 10px", fontSize: 11 }} onClick={idAll} disabled={processing}>ID All</button>
            <button className="btn-a" style={{ padding: "6px 10px", fontSize: 11 }} onClick={priceAll} disabled={processing}>Price All</button>
            <button className="btn-o" style={{ padding: "6px 10px", fontSize: 11 }} onClick={saveAll}>Save All</button>
          </div>
        </div>
      )}

      {queue.map((item, idx) => (
        <div key={item.id} className="card fade" style={{ marginBottom: 10, padding: 12, animationDelay: `${idx * .04}s` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Camera side="front" image={item.frontImg} onCapture={(img) => updateItem(item.id, { frontImg: img })} onRetake={() => updateItem(item.id, { frontImg: null })} compact />
            <Camera side="back" image={item.backImg} onCapture={(img) => updateItem(item.id, { backImg: img })} onRetake={() => updateItem(item.id, { backImg: null })} compact />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <input className="inp" placeholder="Name" aria-label="Card name" value={item.name || ""} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
            <input className="inp" placeholder="Set" aria-label="Card set" value={item.set || ""} onChange={(e) => updateItem(item.id, { set: e.target.value })} />
            <input className="inp" placeholder="#" aria-label="Card number" value={item.number || ""} onChange={(e) => updateItem(item.id, { number: e.target.value })} />
            <input className="inp" placeholder="Cost $" aria-label="Cost" value={item.costBasis || ""} onChange={(e) => updateItem(item.id, { costBasis: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {item.priceEstimate?.mid && <span className="gold" style={{ fontWeight: 800, fontSize: 16 }}>{fmtShort(item.priceEstimate.mid)}</span>}
            <div style={{ flex: 1 }} />
            <button className="btn-g" style={{ padding: "4px 8px", color: "var(--red)" }} aria-label="Remove card" onClick={() => setQueue((p) => p.filter((x) => x.id !== item.id))}>{"\u2715"}</button>
          </div>
        </div>
      ))}

      <button className="btn-a" style={{ width: "100%", padding: "14px 0" }} onClick={() => setQueue((p) => [...p, {
        id: uid(), frontImg: null, backImg: null, name: "", set: "", year: "", number: "",
        condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null,
      }])}>+ Add Card</button>
    </div>
  );
}
