import { useState } from "react";
import Camera from "./Camera";
import { useToast } from "./Toast";
import { CONDITIONS, TYPES } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage } from "../lib/storage";

export default function BatchView({ setCatalog }) {
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [cond, setCond] = useState("near_mint");
  const [type, setType] = useState("sports");
  const [binder, setBinder] = useState("");
  const [processing, setProcessing] = useState(false);

  const idAll = async () => {
    setProcessing(true);
    let identified = 0;
    for (const item of queue) {
      if (item.frontImg && !item.name) {
        const r = await aiRecognize(item.frontImg);
        if (r?.name) {
          setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, ...r } : x)));
          identified++;
        }
      }
    }
    toast.success(`Identified ${identified} cards`);
    setProcessing(false);
  };

  const priceAll = async () => {
    setProcessing(true);
    let priced = 0;
    for (const item of queue) {
      if (item.name && !item.priceEstimate) {
        const d = await aiPrice(item.name + " " + (item.set || ""));
        if (d) {
          setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, priceEstimate: d.priceEstimate, priceHistory: d.priceHistory } : x)));
          priced++;
        }
      }
    }
    toast.success(`Priced ${priced} cards`);
    setProcessing(false);
  };

  const saveAll = async () => {
    const items = [];
    for (const item of queue.filter((i) => i.name)) {
      const id = uid();
      let frontImgId = null, backImgId = null;
      if (item.frontImg) {
        frontImgId = `img_${id}_front`;
        await saveImage(frontImgId, item.frontImg);
      }
      if (item.backImg) {
        backImgId = `img_${id}_back`;
        await saveImage(backImgId, item.backImg);
      }
      items.push({
        id, ...item, frontImgId, backImgId,
        frontImg: undefined, backImg: undefined,
        binder, type: item.type || type, listing: {},
        status: "inventory", listedOn: [],
        createdAt: new Date().toISOString(),
      });
    }
    setCatalog((p) => [...items, ...p]);
    setQueue([]);
    toast.success(`Saved ${items.length} cards`);
  };

  return (
    <div className="fade">
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Batch Scan</h2>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="lbl">Defaults</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
        <div className="glass" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", marginBottom: 8, borderRadius: 10 }}>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>Total: <strong className="gold">{fmtShort(queue.reduce((s, i) => s + (parseFloat(i.priceEstimate?.mid) || 0), 0))}</strong></span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn-a" style={{ padding: "4px 8px", fontSize: 9 }} onClick={idAll} disabled={processing}>ID All</button>
            <button className="btn-a" style={{ padding: "4px 8px", fontSize: 9 }} onClick={priceAll} disabled={processing}>Price All</button>
            <button className="btn-o" style={{ padding: "4px 8px", fontSize: 9 }} onClick={saveAll}>Save All</button>
          </div>
        </div>
      )}

      {queue.map((item, idx) => (
        <div key={item.id} className="card fade" style={{ marginBottom: 8, padding: 10, animationDelay: `${idx * .04}s` }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <Camera side="front" image={item.frontImg} onCapture={(img) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, frontImg: img } : x)))} onRetake={() => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, frontImg: null } : x)))} compact />
            <Camera side="back" image={item.backImg} onCapture={(img) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, backImg: img } : x)))} onRetake={() => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, backImg: null } : x)))} compact />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4 }}>
            <input className="inp" placeholder="Name" value={item.name || ""} onChange={(e) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))} />
            <input className="inp" placeholder="Set" value={item.set || ""} onChange={(e) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, set: e.target.value } : x)))} />
            <input className="inp" placeholder="#" value={item.number || ""} onChange={(e) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, number: e.target.value } : x)))} />
            <input className="inp" placeholder="Cost $" value={item.costBasis || ""} onChange={(e) => setQueue((p) => p.map((x) => (x.id === item.id ? { ...x, costBasis: e.target.value } : x)))} />
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {item.priceEstimate?.mid && <span className="gold" style={{ fontWeight: 800 }}>{fmtShort(item.priceEstimate.mid)}</span>}
            <div style={{ flex: 1 }} />
            <button className="btn-g" style={{ padding: "3px 6px", fontSize: 9, color: "var(--red)" }} onClick={() => setQueue((p) => p.filter((x) => x.id !== item.id))}>\u2715</button>
          </div>
        </div>
      ))}

      <button className="btn-a" style={{ width: "100%", padding: "12px 0" }} onClick={() => setQueue((p) => [...p, {
        id: uid(), frontImg: null, backImg: null, name: "", set: "", year: "", number: "",
        condition: cond, type, costBasis: "", priceEstimate: null, priceHistory: null,
      }])}>+ Add Card</button>
    </div>
  );
}
