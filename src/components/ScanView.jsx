import { useState } from "react";
import Camera from "./Camera";
import PriceChart from "./PriceChart";
import { useToast } from "./Toast";
import { CONDITIONS, TYPES, PLATFORMS, SHIP_CA, EMPTY_CARD, EMPTY_LISTING } from "../lib/constants";
import { condOf, fmtShort, uid } from "../lib/utils";
import { aiRecognize, aiPrice } from "../lib/ai";
import { saveImage } from "../lib/storage";

export default function ScanView({ catalog, setCatalog, onNavigate }) {
  const toast = useToast();
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

  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    setStatus("Searching\u2026");
    const d = await aiPrice(searchQ);
    if (d) {
      setResults(d.results || []);
      setPriceEst(d.priceEstimate || {});
      setPriceHistory(d.priceHistory || []);
      if (d.cardInfo) {
        setCard((p) => ({
          ...p,
          name: p.name || d.cardName || "",
          set: p.set || d.cardInfo.set || "",
          year: p.year || d.cardInfo.year || "",
          number: p.number || d.cardInfo.number || "",
          rarity: p.rarity || d.cardInfo.rarity || "",
          type: d.cardInfo.type || p.type,
        }));
      }
      setStatus(`${(d.results || []).length} results`);
    } else {
      setStatus("Search failed \u2014 check API connection");
      toast.error("Price search failed");
    }
    setSearching(false);
  };

  const doRecognize = async () => {
    if (!frontImg) return;
    setRecognizing(true);
    setStatus("Identifying\u2026");
    const r = await aiRecognize(frontImg);
    if (r?.name) {
      setCard((p) => ({
        ...p, name: r.name, set: r.set || p.set, year: r.year || p.year,
        number: r.number || p.number, rarity: r.rarity || p.rarity,
        parallel: r.parallel || "", type: r.type || p.type,
      }));
      setSearchQ([r.name, r.set, r.number && `#${r.number}`].filter(Boolean).join(" "));
      setStatus(`\u2713 ${r.name} (${r.confidence})`);
    } else {
      setStatus("Couldn't ID \u2014 enter manually");
      toast.error("Card recognition failed");
    }
    setRecognizing(false);
  };

  const saveCard = async () => {
    const id = uid();
    let frontImgId = null, backImgId = null;

    if (frontImg) {
      frontImgId = `img_${id}_front`;
      await saveImage(frontImgId, frontImg);
    }
    if (backImg) {
      backImgId = `img_${id}_back`;
      await saveImage(backImgId, backImg);
    }

    const entry = {
      id, ...card,
      frontImgId, backImgId,
      priceEstimate: priceEst, priceHistory,
      listing: { ...listing },
      binder: card.binder || "",
      status: card.status || "inventory",
      listedOn: card.listedOn || [],
      createdAt: new Date().toISOString(),
    };
    setCatalog((p) => [entry, ...p]);
    toast.success(`Saved: ${card.name || "Card"}`);
    return entry;
  };

  const reset = () => {
    setStep(0);
    setFrontImg(null);
    setBackImg(null);
    setCard({ ...EMPTY_CARD });
    setSearchQ("");
    setResults([]);
    setPriceEst({ low: "", mid: "", high: "" });
    setPriceHistory([]);
    setListing({ ...EMPTY_LISTING });
    setStatus("");
  };

  const steps = ["\ud83d\udcf8 Capture", "\ud83d\udd0d Identify", "\ud83d\udccb Details", "\ud83d\udcb0 List"];

  return (
    <>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 3, marginBottom: 12, overflowX: "auto" }}>
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            flex: 1, padding: "7px 3px", borderRadius: 8, border: "none", fontSize: 10,
            fontWeight: i === step ? 800 : 500, textAlign: "center", minWidth: 0,
            background: i === step ? "linear-gradient(135deg,var(--acc),var(--acc2))" : i < step ? "#d4a01722" : "var(--s2)",
            color: i === step ? "#08090d" : i < step ? "var(--acc)" : "var(--dim)",
          }}>{s}</button>
        ))}
      </div>

      {/* Step 0: Capture */}
      {step === 0 && (
        <section className="fade">
          <div className="card card-glow">
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Photograph Card</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Camera side="front" image={frontImg} onCapture={setFrontImg} onRetake={() => setFrontImg(null)} />
              <Camera side="back" image={backImg} onCapture={setBackImg} onRetake={() => setBackImg(null)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn-a" style={{ flex: 1, padding: "12px 0", opacity: frontImg ? 1 : .4 }} disabled={!frontImg} onClick={() => { doRecognize(); setStep(1); }}>AI Identify \u2192</button>
            <button className="btn-o" style={{ padding: "12px 14px", opacity: frontImg ? 1 : .4 }} disabled={!frontImg} onClick={() => setStep(1)}>Skip \u2192</button>
          </div>
        </section>
      )}

      {/* Step 1: Identify & Price */}
      {step === 1 && (
        <section className="fade">
          <div className="card card-glow">
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Identify & Price</h2>
            {status && (
              <div style={{ fontSize: 11, fontWeight: 600, color: searching || recognizing ? "var(--acc)" : results.length ? "var(--grn)" : "var(--red)", marginBottom: 6 }}>
                {(searching || recognizing) && <span style={{ marginRight: 4, animation: "pulse 1.5s infinite" }}>\u25cf</span>}{status}
              </div>
            )}
            {frontImg && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 8 }}>
                <img src={frontImg} alt="" style={{ height: 55, borderRadius: 5, border: "1px solid var(--brd)", objectFit: "contain", background: "#000" }} />
                {backImg && <img src={backImg} alt="" style={{ height: 55, borderRadius: 5, border: "1px solid var(--brd)", objectFit: "contain", background: "#000" }} />}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input className="inp" placeholder="Card name or search\u2026" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
              <button className="btn-a" style={{ padding: "8px 14px" }} onClick={doSearch} disabled={searching}>{searching ? "\u23f3" : "\ud83d\udd0d"}</button>
              {frontImg && <button className="btn-o" style={{ padding: "8px 10px" }} onClick={doRecognize} disabled={recognizing}>\ud83e\udd16</button>}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {[
                { l: "eBay Sold", h: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQ)}&LH_Sold=1&LH_Complete=1` },
                { l: "TCGplayer", h: `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(searchQ)}` },
                { l: "130point", h: `https://130point.com/sales/?search=${encodeURIComponent(searchQ)}` },
              ].map((x) => (
                <a key={x.l} href={x.h} target="_blank" rel="noopener noreferrer" style={{ padding: "3px 8px", borderRadius: 5, background: "var(--s3)", border: "1px solid var(--brd)", fontSize: 9, fontWeight: 600 }}>{x.l}</a>
              ))}
            </div>
            {results.length > 0 && (
              <>
                <div className="glass" style={{ display: "flex", justifyContent: "space-around", padding: "12px 0", borderRadius: 10, margin: "6px 0" }}>
                  <div style={{ textAlign: "center" }}><div className="lbl" style={{ margin: 0 }}>Low</div><div style={{ fontSize: 16, fontWeight: 800, color: "var(--red)" }}>{fmtShort(priceEst.low)}</div></div>
                  <div style={{ textAlign: "center" }}><div className="lbl" style={{ margin: 0 }}>Market</div><div style={{ fontSize: 24, fontWeight: 900 }} className="gold">{fmtShort(priceEst.mid)}</div></div>
                  <div style={{ textAlign: "center" }}><div className="lbl" style={{ margin: 0 }}>High</div><div style={{ fontSize: 16, fontWeight: 800, color: "var(--grn)" }}>{fmtShort(priceEst.high)}</div></div>
                </div>
                {priceHistory.length > 1 && <div style={{ margin: "10px 0" }}><PriceChart data={priceHistory} /></div>}
                <div className="lbl" style={{ marginTop: 10 }}>Recent Sales</div>
                {results.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11 }}>{r.title}</div>
                      <div style={{ fontSize: 9, color: "var(--dim)" }}>{r.source} \u00b7 {r.date}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--acc)" }}>{fmtShort(r.price)}</span>
                  </a>
                ))}
              </>
            )}
          </div>
          <button className="btn-a" style={{ width: "100%", marginTop: 10, padding: "12px 0" }} onClick={() => setStep(2)}>Continue \u2192</button>
        </section>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <section className="fade">
          <div className="card card-glow">
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Card Details</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[["Name *", "name"], ["Set", "set"], ["Year", "year"], ["Card #", "number"], ["Rarity", "rarity"], ["Parallel", "parallel"]].map(([l, k]) => (
                <label key={k} className="fld">{l}<input className="inp" value={card[k]} onChange={(e) => setCard((p) => ({ ...p, [k]: e.target.value }))} /></label>
              ))}
            </div>
            <div className="lbl" style={{ marginTop: 10 }}>Type</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {TYPES.map((t) => (
                <button key={t.v} onClick={() => setCard((p) => ({ ...p, type: t.v }))} className="chip" style={{
                  borderColor: card.type === t.v ? "var(--acc)" : "var(--brd)",
                  color: card.type === t.v ? "var(--acc)" : "var(--dim)",
                  background: card.type === t.v ? "#d4a01712" : "transparent",
                }}>{t.i} {t.l}</button>
              ))}
            </div>
            <div className="lbl" style={{ marginTop: 10 }}>Condition</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {CONDITIONS.map((c) => (
                <button key={c.v} onClick={() => setCard((p) => ({ ...p, condition: c.v }))} className="chip" style={{
                  borderColor: card.condition === c.v ? c.c : "var(--brd)",
                  color: card.condition === c.v ? c.c : "var(--dim)",
                  background: card.condition === c.v ? c.c + "18" : "transparent",
                }}>{c.s}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
              <label className="fld">Cost (CAD)<input className="inp" type="number" step="0.01" value={card.costBasis} onChange={(e) => setCard((p) => ({ ...p, costBasis: e.target.value }))} /></label>
              <label className="fld">Binder<input className="inp" value={card.binder} onChange={(e) => setCard((p) => ({ ...p, binder: e.target.value }))} /></label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn-a" style={{ flex: 1, padding: "12px 0" }} onClick={() => { saveCard(); }}>Save</button>
            <button className="btn-o" style={{ flex: 1, padding: "12px 0" }} onClick={() => {
              const co = condOf(card.condition);
              setListing((p) => ({
                ...p,
                title: [card.name, card.set, card.number && `#${card.number}`, `[${co.s}]`].filter(Boolean).join(" "),
                description: [card.name, card.set && `Set: ${card.set}`, card.rarity && `Rarity: ${card.rarity}`, `Condition: ${co.l}`, "Ships tracked from Canada"].filter(Boolean).join("\n"),
                price: priceEst.mid || "",
              }));
              setStep(3);
            }}>Listing \u2192</button>
          </div>
        </section>
      )}

      {/* Step 3: Listing */}
      {step === 3 && (
        <section className="fade">
          <div className="card card-glow">
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Listing</h2>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
              {PLATFORMS.map((p) => (
                <button key={p.v} onClick={() => setListing((prev) => ({ ...prev, platform: p.v }))} className="chip" style={{
                  borderColor: listing.platform === p.v ? "var(--acc)" : "var(--brd)",
                  color: listing.platform === p.v ? "var(--acc)" : "var(--dim)", fontWeight: 700,
                }}>{p.l}</button>
              ))}
            </div>
            <label className="fld">Title<input className="inp" style={{ fontWeight: 600 }} value={listing.title} onChange={(e) => setListing((p) => ({ ...p, title: e.target.value }))} /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <label className="fld" style={{ flex: 1 }}>Price (CAD)<input className="inp" style={{ fontSize: 16, fontWeight: 700 }} type="number" step="0.01" value={listing.price} onChange={(e) => setListing((p) => ({ ...p, price: e.target.value }))} /></label>
              <label className="fld" style={{ width: 70 }}>Ship $<input className="inp" type="number" step="0.01" value={listing.shipping} onChange={(e) => setListing((p) => ({ ...p, shipping: e.target.value }))} /></label>
            </div>
            <label className="fld" style={{ marginTop: 6 }}>Description<textarea className="inp" style={{ minHeight: 80, resize: "vertical", fontSize: 10 }} value={listing.description} onChange={(e) => setListing((p) => ({ ...p, description: e.target.value }))} /></label>
            <div className="lbl" style={{ marginTop: 10 }}>Canada Post Shipping</div>
            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4 }}>Recommended: Tracked Packet (~$13 CAD, 4-7 days, tracking + $100 coverage)</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {SHIP_CA.map((s) => (
                <span key={s.l} style={{ fontSize: 9, background: "var(--s3)", border: "1px solid var(--brd)", borderRadius: 5, padding: "3px 7px", color: "var(--dim)" }}>{s.l} {s.p}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn-a" style={{ flex: 1, padding: "12px 0" }} onClick={() => {
              navigator.clipboard.writeText(`${listing.title}\n${fmtShort(listing.price)} CAD + ${fmtShort(listing.shipping)} shipping\n\n${listing.description}`);
              toast.success("Copied to clipboard");
            }}>Copy</button>
            <button className="btn-o" style={{ flex: 1, padding: "12px 0" }} onClick={() => saveCard()}>Save</button>
          </div>
          <button className="btn-g" style={{ width: "100%", marginTop: 6 }} onClick={reset}>+ New Card</button>
        </section>
      )}
    </>
  );
}
