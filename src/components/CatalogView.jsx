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
import { IconBack, IconTrash, IconCheck, IconSearch, IconDownload, IconCopy, IconChevron, IconShield, Spinner, Skeleton } from "./Icons";

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
        loadImage(c.frontImgId).then((img) => { if (img) setThumbs((p) => ({ ...p, [c.frontImgId]: img })); });
      }
    });
  }, [filtered]);

  useEffect(() => {
    if (!detail) return;
    setDetailFrontImg(null); setDetailBackImg(null);
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

  // === DETAIL VIEW ===
  if (view === "detail" && detail) {
    return (
      <div className="slide-up">
        <button className="btn btn-ghost btn-sm mb-10" onClick={() => { setView("list"); setGradePred(null); }}>
          <IconBack size={14} /> Back
        </button>

        {detailFrontImg && (
          <div className="flex gap-10 justify-center mb-10">
            <img src={detailFrontImg} alt={`Front of ${detail.name}`} className="img-preview" style={{ height: 200, boxShadow: "var(--shadow-lg)" }} />
            {detailBackImg && <img src={detailBackImg} alt={`Back of ${detail.name}`} className="img-preview" style={{ height: 200, boxShadow: "var(--shadow-lg)" }} />}
          </div>
        )}

        <h2 className="gold text-center" style={{ fontSize: 24, fontWeight: 900, margin: "8px 0" }}>{detail.name}</h2>
        <div className="text-center text-sm text-dim mb-12">{[detail.set, detail.year, detail.number && `#${detail.number}`].filter(Boolean).join(" \u00b7 ")}</div>

        <div className="card-hero mb-10">
          <div className="stat-grid">
            <div className="stat-item">
              <div className="lbl">Condition</div>
              <span style={{ color: condOf(detail.condition).c, fontWeight: 700, fontSize: 15 }}>{condOf(detail.condition).l}</span>
            </div>
            <div className="stat-item">
              <div className="lbl">Value</div>
              <span className="gold stat-value">{fmtShort(detail.priceEstimate?.mid)}</span>
            </div>
            <div className="stat-item">
              <div className="lbl">Status</div>
              <span className={`badge ${detail.status === "sold" ? "badge-grn" : detail.status === "listed" ? "badge-acc" : "badge-dim"}`}>
                {detail.status || "inventory"}{detail.listedOn?.length > 0 && ` (${detail.listedOn.join(", ")})`}
              </span>
            </div>
            <div className="stat-item">
              <div className="lbl">Cost</div>
              <span style={{ fontSize: 15 }}>{detail.costBasis ? fmtShort(detail.costBasis) : "\u2014"}</span>
            </div>
          </div>
        </div>

        {detail.priceHistory?.length > 1 && <div className="card mb-10"><PriceChart data={detail.priceHistory} /></div>}

        <div className="card mb-10">
          <div className="lbl">Listed On</div>
          <div className="chip-row mt-6">
            {PLATFORMS.map((p) => (
              <button key={p.v} onClick={() => toggleListed(detail.id, p.v)}
                className={`chip ${(detail.listedOn || []).includes(p.v) ? "active" : ""}`}>
                {p.l}{(detail.listedOn || []).includes(p.v) ? " \u2713" : ""}
              </button>
            ))}
          </div>
        </div>

        {detail.frontImgId && (
          <div className="card mb-10">
            <div className="lbl">AI Grade Predictor</div>
            <button className="btn btn-primary btn-sm mt-6" onClick={doPredictGrade} disabled={predicting}>
              {predicting ? <Spinner size={14} /> : <IconShield size={14} />} Predict PSA Grade
            </button>
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
                <div className="fade mt-10">
                  <div className="flex items-center gap-10 flex-wrap">
                    <span className="gold" style={{ fontSize: 32, fontWeight: 900 }}>PSA {gradePred.predictedGrade}</span>
                    <span className={`badge ${gradePred.confidence === "high" ? "badge-grn" : "badge-acc"}`}>{gradePred.confidence}</span>
                  </div>

                  {calc && (
                    <div className="glass mt-10" style={{ padding: 14, borderRadius: "var(--radius)" }}>
                      <div className="lbl mb-8">Calculated Grades</div>
                      <div className="form-grid-3">
                        {[["Floor", calc.floor], ["Weighted", calc.weighted], ["Final", calc.final]].map(([label, val]) => (
                          <div key={label} className="stat-item">
                            <div className="text-xxs text-dim">{label}</div>
                            <div style={{ fontSize: label === "Final" ? 22 : 20, fontWeight: label === "Final" ? 900 : 800, color: gradeToTerm(val).color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {term && (
                        <div className="text-center mt-8">
                          <span className="fw-700" style={{ fontSize: 14, color: term.color }}>{term.term}</span>
                          <span className="text-xxs text-dim" style={{ marginLeft: 8 }}>{term.action}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-grid mt-10">
                    {["centering", "corners", "edges", "surface"].map((k) => gradePred[k] && (
                      <div key={k} className="card" style={{ padding: 10 }}>
                        <div className="flex justify-between items-center">
                          <span className="text-xs fw-700" style={{ textTransform: "capitalize" }}>{k}</span>
                          <span className="fw-800" style={{ fontSize: 16, color: gradeToTerm(parseFloat(gradePred[k].score) || 0).color }}>{gradePred[k].score}</span>
                        </div>
                        <div className="text-xxs text-dim mt-4">{gradePred[k].notes}</div>
                        <div className="text-xxs text-dim mt-4">Weight: {k === "corners" || k === "surface" ? "30%" : "20%"}</div>
                      </div>
                    ))}
                  </div>
                  {gradePred.recommendation && <div className="text-sm text-acc fw-600 mt-10">{gradePred.recommendation}</div>}
                  {calc && (
                    <button className="btn btn-outline btn-sm btn-full mt-10" onClick={async () => {
                      const report = generateConditionReport(scores);
                      try { await navigator.clipboard.writeText(report); toast.success("Condition report copied"); }
                      catch { toast.error("Copy failed"); }
                    }}><IconCopy size={12} /> Copy eBay Condition Report</button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {detail.status !== "sold" ? (
          <div className="card mb-10">
            <div className="lbl">Mark as Sold</div>
            <div className="form-grid mt-6">
              <input className="inp" type="number" step="0.01" placeholder="Sale price CAD" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              <select className="inp" value={salePlatform} onChange={(e) => setSalePlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <input className="inp" type="number" step="0.01" placeholder="Fees $" value={saleFees} onChange={(e) => setSaleFees(e.target.value)} />
              <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={saleShipping} onChange={(e) => setSaleShipping(e.target.value)} />
            </div>
            <button className="btn btn-success btn-sm mt-8" onClick={() => markSold(detail.id)}>
              <IconCheck size={14} /> Mark Sold
            </button>
          </div>
        ) : (
          <div className="card mb-10" style={{ borderColor: "var(--grn-brd)" }}>
            <span className="badge badge-grn" style={{ fontSize: 14, padding: "6px 14px" }}>
              <IconCheck size={14} /> SOLD{detail.soldPlatform ? ` on ${detail.soldPlatform}` : ""}{detail.soldPrice ? ` for ${fmtShort(detail.soldPrice)} CAD` : ""}
            </span>
          </div>
        )}

        <button className="btn btn-danger btn-sm" onClick={doDelete}><IconTrash size={14} /> Delete Card</button>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="fade">
      <h1 className="page-title">Collection</h1>

      {catalog.length === 0 && (
        <div className="card empty-state mb-12">
          <div className="empty-icon">{"\ud83c\udca0"}</div>
          <div className="empty-title">No cards yet</div>
          <div className="empty-desc">Scan your first card to get started</div>
        </div>
      )}

      {catalog.length > 0 && (
        <div className="card-hero mb-12">
          <div className="flex items-center gap-10">
            <div>
              <div className="lbl" style={{ margin: 0 }}>Portfolio Value</div>
              <div className="gold" style={{ fontSize: 30, fontWeight: 900 }}>{fmtShort(totalVal)}</div>
            </div>
            <span className="badge badge-dim">{catalog.filter((c) => c.status !== "sold").length} cards</span>
            {totalCost > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="lbl" style={{ margin: 0 }}>P/L</div>
                <span className="fw-700" style={{ fontSize: 18, color: totalVal - totalCost >= 0 ? "var(--grn)" : "var(--red)" }}>
                  {totalVal - totalCost >= 0 ? "+" : ""}{fmtShort(totalVal - totalCost)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chip-scroll mb-10">
        {binders.map((b) => (
          <button key={b} onClick={() => setBinderF(b)} className={`chip ${binderF === b ? "active" : ""}`}>{b}</button>
        ))}
      </div>

      <div className="flex gap-8 mb-12">
        <div className="flex-1" style={{ position: "relative" }}>
          <IconSearch size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dim)", pointerEvents: "none" }} />
          <input className="inp" style={{ paddingLeft: 36 }} placeholder="Search..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
        </div>
        <select className="inp" style={{ width: "auto", minWidth: 100 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
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
          <div key={c.id} className="card-interactive flex items-center gap-10 mb-6 fade" role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailId(c.id); setView("detail"); } }}
            style={{ animationDelay: `${Math.min(i * .03, .3)}s` }}
            onClick={() => { setDetailId(c.id); setView("detail"); }}>
            {thumb
              ? <img src={thumb} alt={c.name} style={{ width: 46, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid var(--brd)" }} />
              : <div style={{ width: 46, height: 64, borderRadius: 8, background: "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{"\ud83c\udca0"}</div>
            }
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div className="flex items-center gap-6">
                <strong className="text-sm truncate">{c.name || "?"}</strong>
                {c.status === "sold" && <span className="badge badge-grn">SOLD</span>}
                {c.listedOn?.length > 0 && c.status !== "sold" && <span className="badge badge-acc">LISTED</span>}
              </div>
              <div className="text-xxs text-dim mt-4">{[c.set, c.number && `#${c.number}`].filter(Boolean).join(" \u00b7 ")}</div>
              <div className="flex gap-6 items-center mt-4">
                <span className="badge" style={{ background: co.c + "15", color: co.c, padding: "2px 8px" }}>{co.s}</span>
                {mv > 0 && <span className="gold fw-800" style={{ fontSize: 15 }}>{fmtShort(mv)}</span>}
              </div>
            </div>
            <IconChevron size={16} style={{ color: "var(--dim)", opacity: .4, flexShrink: 0 }} />
          </div>
        );
      })}

      {catalog.length > 0 && (
        <div className="card mt-16">
          <div className="lbl">Export</div>
          <div className="form-grid-3 mt-6">
            <button className="btn btn-ghost btn-sm" onClick={() => download(genCSV(catalog), "cardvault.csv")}><IconDownload size={12} /> CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={() => download(genEbayCSV(catalog, shipFrom), "ebay-file-exchange.csv")}><IconDownload size={12} /> eBay</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(genInsurancePDF(catalog, userName)); w.document.close(); setTimeout(() => w.print(), 500); }
              else toast.error("Popup blocked");
            }}><IconDownload size={12} /> Insurance</button>
          </div>
        </div>
      )}
    </div>
  );
}
