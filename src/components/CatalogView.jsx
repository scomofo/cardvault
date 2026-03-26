import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { PLATFORMS } from "../lib/constants";
import { condOf, fmtShort, uid, download } from "../lib/utils";
import { loadImage, deleteImage } from "../lib/storage";
import { genCSV, genEbayCSV, genInsurancePDF } from "../lib/exports";
import { calculateGrade, gradeToTerm, generateConditionReport } from "../lib/grading";
import PriceChart from "./PriceChart";
import { aiGradePredict } from "../lib/ai";

export default function CatalogView() {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, userName, shipFrom } = useData();
  const [view, setView] = useState("list");
  const [detailId, setDetailId] = useState(null);
  const [detailFrontImg, setDetailFrontImg] = useState(null);
  const [detailBackImg, setDetailBackImg] = useState(null);
  const [binderF, setBinderF] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [catSearch, setCatSearch] = useState("");
  const [gradePred, setGradePred] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [salePlatform, setSalePlatform] = useState("ebay");
  const [saleFees, setSaleFees] = useState("");
  const [saleShipping, setSaleShipping] = useState("");
  const [thumbs, setThumbs] = useState({});
  const thumbAttempted = useRef(new Set());

  const detail = useMemo(() => detailId ? catalog.find((c) => c.id === detailId) || null : null, [detailId, catalog]);

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

  useEffect(() => {
    filtered.forEach((c) => {
      if (c.frontImgId && !thumbs[c.frontImgId] && !thumbAttempted.current.has(c.frontImgId)) {
        thumbAttempted.current.add(c.frontImgId);
        loadImage(c.frontImgId).then((img) => {
          if (img) setThumbs((p) => ({ ...p, [c.frontImgId]: img }));
        });
      }
    });
  }, [filtered]);

  useEffect(() => {
    if (!detail) return;
    setDetailFrontImg(null);
    setDetailBackImg(null);
    let cancelled = false;
    if (detail.frontImgId) loadImage(detail.frontImgId).then((img) => { if (!cancelled) setDetailFrontImg(img); });
    if (detail.backImgId) loadImage(detail.backImgId).then((img) => { if (!cancelled) setDetailBackImg(img); });
    return () => { cancelled = true; };
  }, [detail?.id]);

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
      salePrice: parseFloat(salePrice), costBasis: parseFloat(c.costBasis) || 0,
      platform: salePlatform, fees: parseFloat(saleFees) || 0,
      shippingCost: parseFloat(saleShipping) || 0,
      netProfit: parseFloat(salePrice) - (parseFloat(c.costBasis) || 0) - (parseFloat(saleFees) || 0) - (parseFloat(saleShipping) || 0),
      date: new Date().toISOString(),
    };
    setSales((p) => [sale, ...p]);
    setCatalog((p) => p.map((x) => (x.id === id ? { ...x, status: "sold", soldPrice: salePrice, soldPlatform: salePlatform } : x)));
    toast.success("Marked as sold");
    setSalePrice(""); setSaleFees(""); setSaleShipping("");
  };

  const doDelete = async () => {
    if (!window.confirm("Delete this card?")) return;
    if (detail.frontImgId) await deleteImage(detail.frontImgId).catch(() => {});
    if (detail.backImgId) await deleteImage(detail.backImgId).catch(() => {});
    setCatalog((p) => p.filter((c) => c.id !== detail.id));
    setDetailId(null); setView("list");
    toast.info("Card deleted");
  };

  const doPredictGrade = async () => {
    if (!detailFrontImg) return;
    setPredicting(true); setGradePred(null);
    const r = await aiGradePredict(detailFrontImg);
    if (r) setGradePred(r); else toast.error("Grade prediction failed");
    setPredicting(false);
  };

  const handleCardKeyDown = (e, c) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(c.id); setView("detail"); }
  };

  if (view === "detail" && detail) {
    return (
      <div className="fade">
        <button className="btn-g" onClick={() => { setView("list"); setGradePred(null); }}>&larr; Back</button>
        {detailFrontImg && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "10px 0" }}>
            <img src={detailFrontImg} alt={`Front of ${detail.name}`} style={{ height: 200, borderRadius: 12, objectFit: "contain", border: "1px solid var(--brd)", background: "#000", boxShadow: "0 8px 32px #0006" }} />
            {detailBackImg && <img src={detailBackImg} alt={`Back of ${detail.name}`} style={{ height: 200, borderRadius: 12, objectFit: "contain", border: "1px solid var(--brd)", background: "#000", boxShadow: "0 8px 32px #0006" }} />}
          </div>
        )}
        <h2 className="gold" style={{ fontSize: 24, fontWeight: 900, textAlign: "center", margin: "8px 0" }}>{detail.name}</h2>
        <div style={{ textAlign: "center", fontSize: 13, color: "var(--dim)", marginBottom: 12 }}>{[detail.set, detail.year, detail.number && `#${detail.number}`].filter(Boolean).join(" \u00b7 ")}</div>

        <div className="card card-glow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><div className="lbl">Condition</div><span style={{ color: condOf(detail.condition).c, fontWeight: 700, fontSize: 15 }}>{condOf(detail.condition).l}</span></div>
          <div><div className="lbl">Value</div><span className="gold" style={{ fontSize: 22, fontWeight: 900 }}>{fmtShort(detail.priceEstimate?.mid)}</span></div>
          <div><div className="lbl">Status</div><span style={{ color: detail.status === "sold" ? "var(--grn)" : detail.status === "listed" ? "var(--acc)" : "var(--dim)", fontWeight: 600, textTransform: "capitalize", fontSize: 14 }}>{detail.status || "inventory"}{detail.listedOn?.length > 0 && ` (${detail.listedOn.join(", ")})`}</span></div>
          <div><div className="lbl">Cost</div><span style={{ fontSize: 15 }}>{detail.costBasis ? fmtShort(detail.costBasis) : "\u2014"}</span></div>
        </div>

        {detail.priceHistory?.length > 1 && <div className="card" style={{ marginBottom: 10 }}><PriceChart data={detail.priceHistory} /></div>}

        <div className="card" style={{ marginBottom: 10 }}>
          <div className="lbl">Listed On (tap to toggle)</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {PLATFORMS.map((p) => (
              <button key={p.v} onClick={() => toggleListed(detail.id, p.v)} className="chip" style={{
                borderColor: (detail.listedOn || []).includes(p.v) ? "var(--acc)" : "var(--brd)",
                background: (detail.listedOn || []).includes(p.v) ? "#d4a01718" : "transparent",
                color: (detail.listedOn || []).includes(p.v) ? "var(--acc)" : "var(--dim)",
              }}>{p.l}{(detail.listedOn || []).includes(p.v) ? " \u2713" : ""}</button>
            ))}
          </div>
        </div>

        {detail.frontImgId && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="lbl">AI Grade Predictor</div>
            <button className="btn-a" style={{ marginTop: 6 }} onClick={doPredictGrade} disabled={predicting}>{predicting ? "\u23f3" : ""} Predict PSA Grade</button>
            {gradePred && (() => {
              const scores = {
                centering: parseFloat(gradePred.centering?.score) || 0,
                corners: parseFloat(gradePred.corners?.score) || 0,
                edges: parseFloat(gradePred.edges?.score) || 0,
                surface: parseFloat(gradePred.surface?.score) || 0,
              };
              const calc = calculateGrade(scores);
              const term = calc ? gradeToTerm(calc.final) : null;
              return (
                <div className="fade" style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="gold" style={{ fontSize: 32, fontWeight: 900 }}>PSA {gradePred.predictedGrade}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: gradePred.confidence === "high" ? "var(--grn)" : "var(--acc)", background: gradePred.confidence === "high" ? "#30a46c18" : "#d4a01718", padding: "3px 10px", borderRadius: 5 }}>{gradePred.confidence}</span>
                  </div>

                  {/* Calculated grades from Card Docs formulas */}
                  {calc && (
                    <div className="glass" style={{ padding: 12, borderRadius: 10, marginTop: 10 }}>
                      <div className="lbl" style={{ marginBottom: 8 }}>Calculated Grades</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>Floor</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: gradeToTerm(calc.floor).color }}>{calc.floor}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>Weighted</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: gradeToTerm(calc.weighted).color }}>{calc.weighted}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>Final</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: term.color }}>{calc.final}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "center", marginTop: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: term.color }}>{term.term}</span>
                        <span style={{ fontSize: 11, color: "var(--dim)", marginLeft: 8 }}>{term.action}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                    {["centering", "corners", "edges", "surface"].map((k) => gradePred[k] && (
                      <div key={k} style={{ background: "var(--s2)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>{k}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: gradeToTerm(parseFloat(gradePred[k].score) || 0).color }}>{gradePred[k].score}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{gradePred[k].notes}</div>
                        {/* Weight indicator */}
                        <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 3 }}>
                          Weight: {k === "corners" || k === "surface" ? "30%" : "20%"}
                        </div>
                      </div>
                    ))}
                  </div>
                  {gradePred.recommendation && <div style={{ marginTop: 10, fontSize: 13, color: "var(--acc)", fontWeight: 600 }}>{gradePred.recommendation}</div>}

                  {/* Copy condition report for eBay */}
                  {calc && (
                    <button className="btn-o" style={{ marginTop: 10, width: "100%" }} onClick={async () => {
                      const report = generateConditionReport(scores);
                      try { await navigator.clipboard.writeText(report); toast.success("Condition report copied"); }
                      catch { toast.error("Copy failed"); }
                    }}>Copy eBay Condition Report</button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {detail.status !== "sold" ? (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="lbl">Mark as Sold</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
              <input className="inp" type="number" step="0.01" placeholder="Sale price CAD" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              <select className="inp" value={salePlatform} onChange={(e) => setSalePlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <input className="inp" type="number" step="0.01" placeholder="Fees $" value={saleFees} onChange={(e) => setSaleFees(e.target.value)} />
              <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={saleShipping} onChange={(e) => setSaleShipping(e.target.value)} />
            </div>
            <button className="btn-a" style={{ marginTop: 8, background: "var(--grn)" }} onClick={() => markSold(detail.id)}>Mark Sold</button>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 10, borderColor: "var(--grn)" }}>
            <span style={{ color: "var(--grn)", fontWeight: 700, fontSize: 15 }}>{"\u2705"} SOLD{detail.soldPlatform ? ` on ${detail.soldPlatform}` : ""}{detail.soldPrice ? ` for ${fmtShort(detail.soldPrice)} CAD` : ""}</span>
          </div>
        )}

        <button className="btn-g" style={{ color: "var(--red)" }} onClick={doDelete}>Delete</button>
      </div>
    );
  }

  return (
    <div className="fade">
      {catalog.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, marginBottom: 14 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>{"\ud83c\udca0"}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>No cards yet</div>
          <div style={{ fontSize: 14, color: "var(--dim)" }}>Scan your first card to get started</div>
        </div>
      )}

      {catalog.length > 0 && (
        <div className="card card-glow" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div>
              <div className="lbl" style={{ margin: 0 }}>Portfolio</div>
              <div className="gold" style={{ fontSize: 28, fontWeight: 900 }}>{fmtShort(totalVal)}</div>
            </div>
            <span style={{ fontSize: 13, color: "var(--dim)" }}>{catalog.filter((c) => c.status !== "sold").length} cards</span>
            {totalCost > 0 && (
              <div style={{ marginLeft: "auto" }}>
                <div className="lbl" style={{ margin: 0 }}>P/L</div>
                <span style={{ fontWeight: 700, fontSize: 16, color: totalVal - totalCost >= 0 ? "var(--grn)" : "var(--red)" }}>{totalVal - totalCost >= 0 ? "+" : ""}{fmtShort(totalVal - totalCost)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 5, overflowX: "auto", marginBottom: 10 }}>
        {binders.map((b) => (
          <button key={b} onClick={() => setBinderF(b)} className="chip" style={{
            borderColor: binderF === b ? "var(--acc)" : "var(--brd)",
            color: binderF === b ? "var(--acc)" : "var(--dim)",
          }}>{b}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input className="inp" style={{ flex: 1 }} placeholder="Search..." aria-label="Search catalog" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
        <select className="inp" style={{ width: "auto", minWidth: 90 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
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
          <div key={c.id} className="card fade" role="button" tabIndex={0}
            onKeyDown={(e) => handleCardKeyDown(e, c)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, cursor: "pointer", animationDelay: `${i * .02}s` }}
            onClick={() => { setDetailId(c.id); setView("detail"); }}>
            {thumb
              ? <img src={thumb} alt={c.name} style={{ width: 44, height: 62, borderRadius: 6, objectFit: "cover", border: "1px solid var(--brd)" }} />
              : <div style={{ width: 44, height: 62, borderRadius: 6, background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{"\ud83c\udca0"}</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 15 }}>{c.name || "?"}
                {c.status === "sold" && <span style={{ fontSize: 10, color: "var(--grn)", marginLeft: 5 }}>SOLD</span>}
                {c.listedOn?.length > 0 && c.status !== "sold" && <span style={{ fontSize: 10, color: "var(--acc)", marginLeft: 5 }}>LISTED</span>}
              </strong>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>{[c.set, c.number && `#${c.number}`].filter(Boolean).join(" \u00b7 ")}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: co.c, background: co.c + "18", padding: "2px 6px", borderRadius: 4 }}>{co.s}</span>
                {mv > 0 && <span className="gold" style={{ fontSize: 15, fontWeight: 800 }}>{fmtShort(mv)}</span>}
              </div>
            </div>
            <span style={{ color: "var(--dim)", fontSize: 18, opacity: .4 }}>{"\u203a"}</span>
          </div>
        );
      })}

      {catalog.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="lbl">Export</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 6 }}>
            <button className="btn-g" onClick={() => download(genCSV(catalog), "cardvault.csv")}>CSV</button>
            <button className="btn-g" onClick={() => download(genEbayCSV(catalog, shipFrom), "ebay-file-exchange.csv")}>eBay</button>
            <button className="btn-g" onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(genInsurancePDF(catalog, userName)); w.document.close(); setTimeout(() => w.print(), 500); }
              else toast.error("Popup blocked");
            }}>Insurance</button>
          </div>
        </div>
      )}
    </div>
  );
}
