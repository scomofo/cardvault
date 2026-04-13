import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { PLATFORMS } from "../lib/constants";
import { condOf, fmtShort, uid, download } from "../lib/utils";
import { loadImage, deleteImage } from "../lib/storage";
import { genCSV, genEbayCSV, genInsurancePDF } from "../lib/exports";
import { IconSearch, IconDownload, IconChevron } from "./Icons";
import CardDetail from "./CardDetail";

export default function CatalogView() {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, listings, setListings, userName, shipFrom } = useData();
  const [view, setView] = useState("list");
  const [detailId, setDetailId] = useState(null);
  const [detailFrontImg, setDetailFrontImg] = useState(null);
  const [detailBackImg, setDetailBackImg] = useState(null);
  const [binderF, setBinderF] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [catSearch, setCatSearch] = useState("");
  const [thumbs, setThumbs] = useState({});
  const thumbAttempted = useRef(new Set());

  const detail = useMemo(() => detailId ? catalog.find((c) => c.id === detailId) || null : null, [detailId, catalog]);

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


    filtered.forEach((c) => {
      if (c.frontImgId && !thumbs[c.frontImgId] && !thumbAttempted.current.has(c.frontImgId)) {
        thumbAttempted.current.add(c.frontImgId);
        loadImage(c.frontImgId).then((img) => { if (img) setThumbs((p) => ({ ...p, [c.frontImgId]: img })); });
      }
    });
  }, [filtered]);


    if (!detail) return;
    setDetailFrontImg(null); setDetailBackImg(null);
    let cancelled = false;
    if (detail.frontImgId) loadImage(detail.frontImgId).then((img) => { if (!cancelled) setDetailFrontImg(img); });
    if (detail.backImgId) loadImage(detail.backImgId).then((img) => { if (!cancelled) setDetailBackImg(img); });
    return () => { cancelled = true; };
  }, [detail?.id]);


  const handleDetailBack = async (deleteId) => {
    if (deleteId) {
      const d = catalog.find((c) => c.id === deleteId);
      if (d?.frontImgId) await deleteImage(d.frontImgId).catch(() => {});
      if (d?.backImgId) await deleteImage(d.backImgId).catch(() => {});
      setCatalog((p) => p.filter((c) => c.id !== deleteId));
      toast.info("Card deleted");
    }
    setDetailId(null); setView("list");
  };

  if (view === "detail" && detail) {
    return (
      <CardDetail
        detail={detail}
        detailFrontImg={detailFrontImg}
        detailBackImg={detailBackImg}
        catalog={catalog}
        setCatalog={setCatalog}
        sales={sales}
        setSales={setSales}
        listings={listings}
        setListings={setListings}
        onBack={handleDetailBack}
      />
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
