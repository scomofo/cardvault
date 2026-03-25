import { useState, useMemo, useEffect } from "react";
import { useToast } from "./Toast";
import { PLATFORMS } from "../lib/constants";
import { condOf, fmtShort, uid, download } from "../lib/utils";
import { loadImage } from "../lib/storage";
import { genCSV, genEbayCSV, genSalesCSV, genInsurancePDF } from "../lib/exports";
import PriceChart from "./PriceChart";
import { aiGradePredict } from "../lib/ai";

export default function CatalogView({ catalog, setCatalog, sales, setSales, userName }) {
  const toast = useToast();
  const [view, setView] = useState("list"); // list | detail
  const [detail, setDetail] = useState(null);
  const [detailFrontImg, setDetailFrontImg] = useState(null);
  const [detailBackImg, setDetailBackImg] = useState(null);
  const [binderF, setBinderF] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [catSearch, setCatSearch] = useState("");
  const [gradePred, setGradePred] = useState(null);
  const [predicting, setPredicting] = useState(false);

  // Sold form state (replaces document.getElementById)
  const [salePrice, setSalePrice] = useState("");
  const [salePlatform, setSalePlatform] = useState("ebay");
  const [saleFees, setSaleFees] = useState("");
  const [saleShipping, setSaleShipping] = useState("");

  // Image cache for list thumbnails
  const [thumbs, setThumbs] = useState({});

  const binders = useMemo(() => {
    const s = new Set(["All"]);
    catalog.forEach((c) => { if (c.binder) s.add(c.binder); });
    return [...s];
  }, [catalog]);

  const filtered = useMemo(() => {
    let a = binderF === "All" ? [...catalog] : catalog.filter((c) => c.binder === binderF);
    if (catSearch.trim()) {
      const q = catSearch.toLowerCase();
      a = a.filter((c) => (c.name + c.set + c.number + c.rarity).toLowerCase().includes(q));
    }
    const sf = {
      date_desc: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      date_asc: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      value_desc: (a, b) => (parseFloat(b.priceEstimate?.mid) || 0) - (parseFloat(a.priceEstimate?.mid) || 0),
      value_asc: (a, b) => (parseFloat(a.priceEstimate?.mid) || 0) - (parseFloat(b.priceEstimate?.mid) || 0),
      name_asc: (a, b) => (a.name || "").localeCompare(b.name || ""),
    };
    a.sort(sf[sortBy] || sf.date_desc);
    return a;
  }, [catalog, binderF, sortBy, catSearch]);

  const totalVal = useMemo(() => catalog.filter((c) => c.status !== "sold").reduce((s, c) => s + (parseFloat(c.priceEstimate?.mid) || 0), 0), [catalog]);
  const totalCost = useMemo(() => catalog.reduce((s, c) => s + (parseFloat(c.costBasis) || 0), 0), [catalog]);

  // Load thumbnails for visible cards
  useEffect(() => {
    filtered.forEach((c) => {
      if (c.frontImgId && !thumbs[c.frontImgId]) {
        loadImage(c.frontImgId).then((img) => {
          if (img) setThumbs((p) => ({ ...p, [c.frontImgId]: img }));
        });
      }
    });
  }, [filtered]);

  // Load detail images when detail changes
  useEffect(() => {
    if (!detail) return;
    setDetailFrontImg(null);
    setDetailBackImg(null);
    if (detail.frontImgId) loadImage(detail.frontImgId).then(setDetailFrontImg);
    if (detail.backImgId) loadImage(detail.backImgId).then(setDetailBackImg);
  }, [detail]);

  const toggleListed = (id, platform) => {
    setCatalog((p) => p.map((c) => {
      if (c.id !== id) return c;
      const lo = c.listedOn || [];
      const newLo = lo.includes(platform) ? lo.filter((x) => x !== platform) : [...lo, platform];
      return { ...c, listedOn: newLo, status: newLo.length > 0 ? "listed" : "inventory" };
    }));
  };

  const markSold = (id) => {
    if (!salePrice) { toast.error("Enter sale price"); return; }
    const c = catalog.find((x) => x.id === id);
    if (!c) return;
    const sale = {
      id: uid(), cardId: id, cardName: c.name, set: c.set,
      salePrice: parseFloat(salePrice),
      costBasis: parseFloat(c.costBasis) || 0,
      platform: salePlatform,
      fees: parseFloat(saleFees) || 0,
      shippingCost: parseFloat(saleShipping) || 0,
      netProfit: parseFloat(salePrice) - (parseFloat(c.costBasis) || 0) - (parseFloat(saleFees) || 0) - (parseFloat(saleShipping) || 0),
      date: new Date().toISOString(),
    };
    setSales((p) => [sale, ...p]);
    setCatalog((p) => p.map((x) => (x.id === id ? { ...x, status: "sold", soldPrice: salePrice, soldPlatform: salePlatform } : x)));
    setDetail((d) => d ? { ...d, status: "sold", soldPrice: salePrice, soldPlatform: salePlatform } : d);
    toast.success("Marked as sold");
    setSalePrice("");
    setSaleFees("");
    setSaleShipping("");
  };

  const doPredictGrade = async () => {
    if (!detailFrontImg) return;
    setPredicting(true);
    setGradePred(null);
    const r = await aiGradePredict(detailFrontImg);
    if (r) setGradePred(r);
    else toast.error("Grade prediction failed");
    setPredicting(false);
  };

  // Detail view
  if (view === "detail" && detail) {
    return (
      <div className="fade">
        <button className="btn-g" onClick={() => { setView("list"); setGradePred(null); }}>\u2190 Back</button>
        {detailFrontImg && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "10px 0" }}>
            <img src={detailFrontImg} alt="" style={{ height: 180, borderRadius: 12, objectFit: "contain", border: "1px solid var(--brd)", background: "#000", boxShadow: "0 8px 32px #0006" }} />
            {detailBackImg && <img src={detailBackImg} alt="" style={{ height: 180, borderRadius: 12, objectFit: "contain", border: "1px solid var(--brd)", background: "#000", boxShadow: "0 8px 32px #0006" }} />}
          </div>
        )}
        <h2 className="gold" style={{ fontSize: 20, fontWeight: 900, textAlign: "center", margin: "8px 0" }}>{detail.name}</h2>
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginBottom: 12 }}>{[detail.set, detail.year, detail.number && `#${detail.number}`].filter(Boolean).join(" \u00b7 ")}</div>

        <div className="card card-glow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><div className="lbl">Condition</div><span style={{ color: condOf(detail.condition).c, fontWeight: 700 }}>{condOf(detail.condition).l}</span></div>
          <div><div className="lbl">Value</div><span className="gold" style={{ fontSize: 18, fontWeight: 900 }}>{fmtShort(detail.priceEstimate?.mid)}</span></div>
          <div><div className="lbl">Status</div><span style={{ color: detail.status === "sold" ? "var(--grn)" : detail.status === "listed" ? "var(--acc)" : "var(--dim)", fontWeight: 600, textTransform: "capitalize" }}>{detail.status || "inventory"}{detail.listedOn?.length > 0 && ` (${detail.listedOn.join(", ")})`}</span></div>
          <div><div className="lbl">Cost</div><span>{detail.costBasis ? fmtShort(detail.costBasis) : "\u2014"}</span></div>
        </div>

        {detail.priceHistory?.length > 1 && <div className="card" style={{ marginBottom: 8 }}><PriceChart data={detail.priceHistory} /></div>}

        {/* Listed On */}
        <div className="card" style={{ marginBottom: 8 }}>
          <div className="lbl">Listed On (tap to toggle)</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {PLATFORMS.map((p) => (
              <button key={p.v} onClick={() => toggleListed(detail.id, p.v)} className="chip" style={{
                borderColor: (detail.listedOn || []).includes(p.v) ? "var(--acc)" : "var(--brd)",
                background: (detail.listedOn || []).includes(p.v) ? "#d4a01718" : "transparent",
                color: (detail.listedOn || []).includes(p.v) ? "var(--acc)" : "var(--dim)",
              }}>{p.l}{(detail.listedOn || []).includes(p.v) ? " \u2713" : ""}</button>
            ))}
          </div>
        </div>

        {/* AI Grade Predict */}
        {detail.frontImgId && (
          <div className="card" style={{ marginBottom: 8 }}>
            <div className="lbl">AI Grade Predictor</div>
            <button className="btn-a" style={{ marginTop: 4 }} onClick={doPredictGrade} disabled={predicting}>{predicting ? "\u23f3" : ""} Predict PSA Grade</button>
            {gradePred && (
              <div className="fade" style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="gold" style={{ fontSize: 28, fontWeight: 900 }}>PSA {gradePred.predictedGrade}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: gradePred.confidence === "high" ? "var(--grn)" : "var(--acc)", background: gradePred.confidence === "high" ? "#30a46c18" : "#d4a01718", padding: "2px 8px", borderRadius: 5 }}>{gradePred.confidence}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
                  {["centering", "corners", "edges", "surface"].map((k) => gradePred[k] && (
                    <div key={k} style={{ background: "var(--s2)", borderRadius: 6, padding: "5px 7px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "capitalize" }}>{k}: {gradePred[k].score}</div>
                      <div style={{ fontSize: 8, color: "var(--dim)" }}>{gradePred[k].notes}</div>
                    </div>
                  ))}
                </div>
                {gradePred.recommendation && <div style={{ marginTop: 6, fontSize: 10, color: "var(--acc)", fontWeight: 600 }}>{gradePred.recommendation}</div>}
              </div>
            )}
          </div>
        )}

        {/* Mark sold - uses React state, not document.getElementById */}
        {detail.status !== "sold" ? (
          <div className="card" style={{ marginBottom: 8 }}>
            <div className="lbl">Mark as Sold</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
              <input className="inp" type="number" step="0.01" placeholder="Sale price CAD" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              <select className="inp" value={salePlatform} onChange={(e) => setSalePlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <input className="inp" type="number" step="0.01" placeholder="Fees $" value={saleFees} onChange={(e) => setSaleFees(e.target.value)} />
              <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={saleShipping} onChange={(e) => setSaleShipping(e.target.value)} />
            </div>
            <button className="btn-a" style={{ marginTop: 6, background: "var(--grn)" }} onClick={() => markSold(detail.id)}>Mark Sold</button>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 8, borderColor: "var(--grn)" }}>
            <span style={{ color: "var(--grn)", fontWeight: 700 }}>\u2705 SOLD{detail.soldPlatform ? ` on ${detail.soldPlatform}` : ""}{detail.soldPrice ? ` for ${fmtShort(detail.soldPrice)} CAD` : ""}</span>
          </div>
        )}

        <button className="btn-g" style={{ color: "var(--red)" }} onClick={() => {
          if (window.confirm("Delete this card?")) {
            setCatalog((p) => p.filter((c) => c.id !== detail.id));
            setView("list");
            toast.info("Card deleted");
          }
        }}>Delete</button>
      </div>
    );
  }

  // List view
  return (
    <div className="fade">
      {catalog.length > 0 && (
        <div className="card card-glow" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div>
              <div className="lbl" style={{ margin: 0 }}>Portfolio</div>
              <div className="gold" style={{ fontSize: 24, fontWeight: 900 }}>{fmtShort(totalVal)}</div>
            </div>
            <span style={{ fontSize: 11, color: "var(--dim)" }}>{catalog.filter((c) => c.status !== "sold").length} cards</span>
            {totalCost > 0 && (
              <div style={{ marginLeft: "auto" }}>
                <div className="lbl" style={{ margin: 0 }}>P/L</div>
                <span style={{ fontWeight: 700, color: totalVal - totalCost >= 0 ? "var(--grn)" : "var(--red)" }}>{totalVal - totalCost >= 0 ? "+" : ""}{fmtShort(totalVal - totalCost)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 8 }}>
        {binders.map((b) => (
          <button key={b} onClick={() => setBinderF(b)} className="chip" style={{
            borderColor: binderF === b ? "var(--acc)" : "var(--brd)",
            color: binderF === b ? "var(--acc)" : "var(--dim)",
          }}>{b}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input className="inp" style={{ flex: 1 }} placeholder="Search\u2026" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
        <select className="inp" style={{ width: "auto", minWidth: 80 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date_desc">Newest</option>
          <option value="value_desc">High $</option>
          <option value="name_asc">A-Z</option>
        </select>
      </div>

      {filtered.map((c, i) => {
        const co = condOf(c.condition);
        const mv = parseFloat(c.priceEstimate?.mid) || 0;
        const thumb = c.frontImgId ? thumbs[c.frontImgId] : null;
        return (
          <div key={c.id} className="card fade" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 5, cursor: "pointer", animationDelay: `${i * .02}s` }} onClick={() => { setDetail(c); setView("detail"); }}>
            {thumb
              ? <img src={thumb} alt="" style={{ width: 38, height: 53, borderRadius: 5, objectFit: "cover", border: "1px solid var(--brd)" }} />
              : <div style={{ width: 38, height: 53, borderRadius: 5, background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>\ud83c\udca0</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 12 }}>{c.name || "?"}
                {c.status === "sold" && <span style={{ fontSize: 8, color: "var(--grn)", marginLeft: 4 }}>SOLD</span>}
                {c.listedOn?.length > 0 && c.status !== "sold" && <span style={{ fontSize: 8, color: "var(--acc)", marginLeft: 4 }}>LISTED</span>}
              </strong>
              <div style={{ fontSize: 9, color: "var(--dim)" }}>{[c.set, c.number && `#${c.number}`].filter(Boolean).join(" \u00b7 ")}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: co.c, background: co.c + "18", padding: "1px 4px", borderRadius: 3 }}>{co.s}</span>
                {mv > 0 && <span className="gold" style={{ fontSize: 12, fontWeight: 800 }}>{fmtShort(mv)}</span>}
              </div>
            </div>
            <span style={{ color: "var(--dim)", fontSize: 14, opacity: .4 }}>\u203a</span>
          </div>
        );
      })}

      {/* Exports */}
      {catalog.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="lbl">Export</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, marginTop: 4 }}>
            <button className="btn-g" style={{ fontSize: 9, padding: "7px 3px" }} onClick={() => download(genCSV(catalog), "cardvault.csv")}>CSV</button>
            <button className="btn-g" style={{ fontSize: 9, padding: "7px 3px" }} onClick={() => download(genEbayCSV(catalog), "ebay.csv")}>eBay</button>
            <button className="btn-g" style={{ fontSize: 9, padding: "7px 3px" }} onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(genInsurancePDF(catalog, userName)); w.document.close(); setTimeout(() => w.print(), 500); }
            }}>Insurance</button>
          </div>
        </div>
      )}
    </div>
  );
}
