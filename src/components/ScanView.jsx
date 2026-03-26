import { useState, useEffect } from "react";
import Camera from "./Camera";
import PriceChart from "./PriceChart";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { CONDITIONS, TYPES, PLATFORMS, SHIP_CA, EMPTY_CARD, EMPTY_LISTING } from "../lib/constants";
import { condOf, fmtShort, uid } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage } from "../lib/storage";
import { IconSearch, IconZap, IconChevron, IconCopy, IconExternalLink, IconShield, Spinner } from "./Icons";
import GradingSlider from "./GradingSlider";

export default function ScanView({ onNavigate }) {
  const toast = useToast();
  const { setCatalog } = useData();
  const [step, setStep] = useState(0);
  const [frontImg, setFrontImg] = useState(null);
  const [backImg, setBackImg] = useState(null);
  const [card, setCard] = useState({ ...EMPTY_CARD });
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [status, setStatus] = useState("");
  const [priceEst, setPriceEst] = useState({ low: "", mid: "", high: "" });
  const [priceHistory, setPriceHistory] = useState([]);
  const [listing, setListing] = useState({ ...EMPTY_LISTING });
  const [showGrading, setShowGrading] = useState(false);
  const [gradingData, setGradingData] = useState(null);
  const [saving, setSaving] = useState(false);

  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true); setResults([]); setStatus("Searching\u2026");
    const d = await aiPrice(searchQ);
    if (d) {
      setResults(d.results || []); setPriceEst(d.priceEstimate || {}); setPriceHistory(d.priceHistory || []);
      if (d.cardInfo) {
        setCard((p) => ({ ...p, name: p.name || d.cardName || "", set: p.set || d.cardInfo.set || "", year: p.year || d.cardInfo.year || "", number: p.number || d.cardInfo.number || "", rarity: p.rarity || d.cardInfo.rarity || "", type: d.cardInfo.type || p.type }));
      }
      setStatus(`${(d.results || []).length} results`);
    } else { setStatus("Search failed"); toast.error("Price search failed"); }
    setSearching(false);
  };

  const doRecognize = async () => {
    if (!frontImg) return;
    setRecognizing(true); setStatus("Identifying\u2026");
    const r = await aiRecognize(frontImg);
    if (r?.name) {
      setCard((p) => ({ ...p, name: r.name, set: r.set || p.set, year: r.year || p.year, number: r.number || p.number, rarity: r.rarity || p.rarity, parallel: r.parallel || "", type: r.type || p.type }));
      setSearchQ([r.name, r.set, r.number && `#${r.number}`].filter(Boolean).join(" "));
      setStatus(`\u2713 ${r.name} (${r.confidence})`);
    } else { setStatus("Couldn't ID \u2014 enter manually"); toast.error("Card recognition failed"); }
    setRecognizing(false);
  };

  const saveCard = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const id = uid();
      let frontImgId = null, backImgId = null;
      if (frontImg) { frontImgId = `img_${id}_front`; await saveImage(frontImgId, frontImg); }
      if (backImg) { backImgId = `img_${id}_back`; await saveImage(backImgId, backImg); }
      const entry = { id, ...card, frontImgId, backImgId, priceEstimate: priceEst, priceHistory, listing: { ...listing }, binder: card.binder || "", status: card.status || "inventory", listedOn: card.listedOn || [], ...(gradingData ? { centering: gradingData.centering, corners: gradingData.corners, edges: gradingData.edges, surface: gradingData.surface, projected_grade: gradingData.projected_grade, vault_status: gradingData.vault_status, condition_report: gradingData.condition_report } : {}), createdAt: new Date().toISOString() };
      setCatalog((p) => [entry, ...p]);
      toast.success(`Saved: ${card.name || "Card"}`);
      return entry;
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setStep(0); setFrontImg(null); setBackImg(null); setCard({ ...EMPTY_CARD }); setSearchQ(""); setResults([]); setPriceEst({ low: "", mid: "", high: "" }); setPriceHistory([]); setListing({ ...EMPTY_LISTING }); setStatus(""); setShowGrading(false); setGradingData(null); };

  const copyListing = async () => {
    try { await navigator.clipboard.writeText(`${listing.title}\n${fmtShort(listing.price)} CAD + ${fmtShort(listing.shipping)} shipping\n\n${listing.description}`); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  const steps = ["Capture", "Identify", "Details", "List"];

  return (
    <>
      <h1 className="page-title">Scan Card</h1>

      <div className="stepper">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}: ${s}`}
            className={`stepper-step ${i === step ? "current" : i < step ? "completed" : "upcoming"}`}>
            {i < step ? "\u2713" : i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <section className="slide-up">
          <div className="card-hero mb-12">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Photograph Card</h2>
            <div className="flex gap-10" style={{ flexWrap: "wrap" }}>
              <Camera side="front" image={frontImg} onCapture={setFrontImg} onRetake={() => setFrontImg(null)} />
              <Camera side="back" image={backImg} onCapture={setBackImg} onRetake={() => setBackImg(null)} />
            </div>
          </div>

          <details className="mb-12">
            <summary style={{ fontSize: 13, fontWeight: 700, color: "var(--acc)", cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
              Photo Tips for Best Results
            </summary>
            <div className="card mt-6" style={{ fontSize: 12, lineHeight: 1.8, color: "var(--dim)" }}>
              <div className="fw-700 mb-4" style={{ color: "var(--tx)" }}>Lighting & Setup</div>
              <div>Use a <b style={{ color: "var(--tx)" }}>black background</b> for chrome/white-bordered cards</div>
              <div>Position camera <b style={{ color: "var(--tx)" }}>parallel to card</b> &mdash; tilt 5-10&deg; for reflections</div>
              <div className="fw-700 mt-8 mb-4" style={{ color: "var(--tx)" }}>iPhone Tips</div>
              <div>Use <b style={{ color: "var(--tx)" }}>2x or 3x telephoto</b> &mdash; avoid 1x wide (barrel distortion)</div>
              <div>Tap &amp; hold for <b style={{ color: "var(--tx)" }}>AE/AF Lock</b></div>
            </div>
          </details>

          <div className="flex gap-8">
            <button className="btn btn-primary btn-lg flex-1" disabled={!frontImg} onClick={() => { doRecognize(); setStep(1); }}>
              <IconZap size={16} /> AI Identify
            </button>
            <button className="btn btn-outline btn-lg" disabled={!frontImg} onClick={() => setStep(1)}>
              Skip <IconChevron size={14} />
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="slide-up">
          <div className="card-hero mb-12">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Identify & Price</h2>

            {status && (
              <div className="badge mb-8" style={{ display: "inline-flex" }}>
                {(searching || recognizing) && <Spinner size={12} />}
                <span className={searching || recognizing ? "badge-acc" : results.length ? "badge-grn" : "badge-red"}>{status}</span>
              </div>
            )}

            {frontImg && (
              <div className="flex gap-8 justify-center mb-10">
                <img src={frontImg} alt="Front" className="img-preview" style={{ height: 70 }} />
                {backImg && <img src={backImg} alt="Back" className="img-preview" style={{ height: 70 }} />}
              </div>
            )}

            <div className="flex gap-8 mb-10">
              <input className="inp" placeholder="Card name or search..." value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
              <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
                {searching ? <Spinner size={14} /> : <IconSearch size={16} />}
              </button>
              {frontImg && (
                <button className="btn btn-outline" onClick={doRecognize} disabled={recognizing}>
                  {recognizing ? <Spinner size={14} /> : <IconZap size={16} />}
                </button>
              )}
            </div>

            <div className="flex gap-6 flex-wrap mb-8">
              {[{ l: "eBay Sold", h: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQ)}&LH_Sold=1&LH_Complete=1` },
                { l: "TCGplayer", h: `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchQ)}` },
                { l: "130point", h: `https://130point.com/sales/?search=${encodeURIComponent(searchQ)}` }].map((x) => (
                <a key={x.l} href={x.h} target="_blank" rel="noopener noreferrer" className="link-chip">
                  {x.l} <IconExternalLink size={10} />
                </a>
              ))}
            </div>

            {results.length > 0 && (
              <>
                <div className="glass" style={{ display: "flex", justifyContent: "space-around", padding: "16px 0", borderRadius: "var(--radius)", margin: "10px 0" }}>
                  <div className="stat-item">
                    <div className="lbl" style={{ margin: 0 }}>Low</div>
                    <div className="stat-value text-red" style={{ fontSize: 18 }}>{fmtShort(priceEst.low)}</div>
                  </div>
                  <div className="stat-item">
                    <div className="lbl" style={{ margin: 0 }}>Market</div>
                    <div className="stat-value gold" style={{ fontSize: 28 }}>{fmtShort(priceEst.mid)}</div>
                  </div>
                  <div className="stat-item">
                    <div className="lbl" style={{ margin: 0 }}>High</div>
                    <div className="stat-value text-grn" style={{ fontSize: 18 }}>{fmtShort(priceEst.high)}</div>
                  </div>
                </div>

                {priceHistory.length > 1 && <div className="mt-12 mb-12"><PriceChart data={priceHistory} /></div>}

                <div className="lbl mt-12">Recent Sales</div>
                {results.map((r, i) => (
                  <a key={r.url || `${r.title}-${i}`} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="card-interactive flex items-center gap-8 mb-4" style={{ padding: "10px 14px", textDecoration: "none", color: "inherit" }}>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <div className="text-sm truncate">{r.title}</div>
                      <div className="text-xxs text-dim">{r.source} &middot; {r.date}</div>
                    </div>
                    <span className="gold fw-700" style={{ fontSize: 16 }}>{fmtShort(r.price)}</span>
                  </a>
                ))}
              </>
            )}
          </div>
          <button className="btn btn-primary btn-lg btn-full" onClick={() => setStep(2)}>Continue <IconChevron size={14} /></button>
        </section>
      )}

      {step === 2 && (
        <section className="slide-up">
          <div className="card-hero mb-12">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Card Details</h2>
            <div className="form-grid mb-10">
              {[["Name *", "name"], ["Set", "set"], ["Year", "year"], ["Card #", "number"], ["Rarity", "rarity"], ["Parallel", "parallel"]].map(([l, k]) => (
                <label key={k} className="fld"><span className="lbl">{l}</span><input className="inp" value={card[k]} onChange={(e) => setCard((p) => ({ ...p, [k]: e.target.value }))} /></label>
              ))}
            </div>

            <div className="form-section">
              <div className="lbl">Type</div>
              <div className="chip-row">
                {TYPES.map((t) => (
                  <button key={t.v} onClick={() => setCard((p) => ({ ...p, type: t.v }))}
                    className={`chip ${card.type === t.v ? "active" : ""}`}>
                    {t.i} {t.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <div className="lbl">Condition</div>
              <div className="chip-row">
                {CONDITIONS.map((c) => (
                  <button key={c.v} onClick={() => setCard((p) => ({ ...p, condition: c.v }))}
                    className="chip" style={{
                      borderColor: card.condition === c.v ? c.c : undefined,
                      color: card.condition === c.v ? c.c : undefined,
                      background: card.condition === c.v ? c.c + "15" : undefined
                    }}>
                    {c.s}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid mt-12">
              <label className="fld"><span className="lbl">Cost (CAD)</span><input className="inp" type="number" step="0.01" value={card.costBasis} onChange={(e) => setCard((p) => ({ ...p, costBasis: e.target.value }))} /></label>
              <label className="fld"><span className="lbl">Binder</span><input className="inp" value={card.binder} onChange={(e) => setCard((p) => ({ ...p, binder: e.target.value }))} /></label>
            </div>
          </div>

          {/* Quick Grade toggle */}
          {!showGrading ? (
            <button className="btn btn-outline btn-full mb-12" onClick={() => setShowGrading(true)}>
              <IconShield size={14} /> Quick Grade Assessment
            </button>
          ) : (
            <div className="mb-12">
              <GradingSlider
                initialGrades={gradingData || undefined}
                onSave={(data) => { setGradingData(data); setShowGrading(false); }}
                onCancel={() => setShowGrading(false)}
              />
            </div>
          )}

          {gradingData && !showGrading && (
            <div className="card mb-12" style={{ borderColor: `${gradingData.vault_status === "GREEN" ? "var(--grn-brd)" : gradingData.vault_status === "YELLOW" ? "var(--acc-brd)" : "var(--red-brd)"}` }}>
              <div className="flex justify-between items-center">
                <div>
                  <span className="lbl" style={{ margin: 0 }}>Grade</span>
                  <span className="gold fw-800" style={{ fontSize: 22, marginLeft: 8 }}>{gradingData.projected_grade}</span>
                </div>
                <span className={`badge ${gradingData.vault_status === "GREEN" ? "badge-grn" : gradingData.vault_status === "YELLOW" ? "badge-acc" : "badge-red"}`}>
                  {gradingData.vault_status}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowGrading(true)}>Edit</button>
              </div>
            </div>
          )}

          <div className="flex gap-8">
            <button className="btn btn-primary btn-lg flex-1" disabled={saving} onClick={async () => { await saveCard(); reset(); }}>Save Card</button>
            <button className="btn btn-outline btn-lg flex-1" onClick={() => {
              const co = condOf(card.condition);
              setListing((p) => ({ ...p, title: [card.name, card.set, card.number && `#${card.number}`, `[${co.s}]`].filter(Boolean).join(" "), description: [card.name, card.set && `Set: ${card.set}`, card.rarity && `Rarity: ${card.rarity}`, `Condition: ${co.l}`, "Ships tracked from Canada"].filter(Boolean).join("\n"), price: priceEst.mid || "" }));
              setStep(3);
            }}>Create Listing <IconChevron size={14} /></button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="slide-up">
          <div className="card-hero mb-12">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Listing</h2>

            <div className="form-section">
              <div className="lbl">Platform</div>
              <div className="chip-row">
                {PLATFORMS.map((p) => (
                  <button key={p.v} onClick={() => setListing((prev) => ({ ...prev, platform: p.v }))}
                    className={`chip ${listing.platform === p.v ? "active" : ""}`}>{p.l}</button>
                ))}
              </div>
            </div>

            <label className="fld mb-8"><span className="lbl">Title</span>
              <input className="inp fw-600" value={listing.title} onChange={(e) => setListing((p) => ({ ...p, title: e.target.value }))} />
            </label>

            <div className="form-grid mb-8">
              <label className="fld"><span className="lbl">Price (CAD)</span>
                <input className="inp fw-800" style={{ fontSize: 18 }} type="number" step="0.01" value={listing.price} onChange={(e) => setListing((p) => ({ ...p, price: e.target.value }))} />
              </label>
              <label className="fld"><span className="lbl">Shipping $</span>
                <input className="inp" type="number" step="0.01" value={listing.shipping} onChange={(e) => setListing((p) => ({ ...p, shipping: e.target.value }))} />
              </label>
            </div>

            <label className="fld mb-10"><span className="lbl">Description</span>
              <textarea className="inp" style={{ minHeight: 80, resize: "vertical" }} value={listing.description} onChange={(e) => setListing((p) => ({ ...p, description: e.target.value }))} />
            </label>

            <div className="lbl">Canada Post Shipping</div>
            <div className="text-xs text-dim mb-6">Recommended: Tracked Packet (~$13 CAD, 4-7 days)</div>
            <div className="flex gap-6 flex-wrap">
              {SHIP_CA.map((s) => (
                <span key={s.l} className="badge badge-dim">{s.l} {s.p}</span>
              ))}
            </div>
          </div>

          <div className="flex gap-8">
            <button className="btn btn-primary btn-lg flex-1" onClick={copyListing}><IconCopy size={14} /> Copy</button>
            <button className="btn btn-outline btn-lg flex-1" disabled={saving} onClick={() => saveCard()}>Save</button>
          </div>
          <button className="btn btn-ghost btn-lg btn-full mt-8" onClick={reset}>+ New Card</button>
        </section>
      )}
    </>
  );
}
