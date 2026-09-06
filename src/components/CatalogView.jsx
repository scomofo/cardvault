import { useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { condOf, fmtShort, download } from "../lib/utils";
import { loadImage, deleteImage, loadString, saveString } from "../lib/storage";
import { cardEstimate, catalogStatus, catalogReturnFocusId, filterCatalog, summarizeCatalog } from "../lib/catalogState";
import { genCSV, genEbayCSV, genInsurancePDF } from "../lib/exports";
import { IconSearch, IconDownload, IconChevron, IconCamera, IconCopy, IconGrid, IconList, IconX } from "./Icons";
import CardDetail from "./CardDetail";

export default function CatalogView({ onNavigate, focus, onFocusConsumed }) {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, listings, setListings, userName, shipFrom } = useData();
  const [layout, setLayout] = useState(() => loadString("catalog_layout") === "grid" ? "grid" : "list");
  const [detailId, setDetailId] = useState(null);
  const [detailFrontImg, setDetailFrontImg] = useState(null);
  const [detailBackImg, setDetailBackImg] = useState(null);
  const [binderF, setBinderF] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [catSearch, setCatSearch] = useState("");
  const [thumbs, setThumbs] = useState({});
  const thumbAttempted = useRef(new Set());
  const cardButtons = useRef(new Map());
  const returnFocusOrigin = useRef(null);
  const detailIndex = useRef(0);
  const searchInput = useRef(null);
  const collectionHeading = useRef(null);

  const detail = useMemo(() => detailId ? catalog.find((c) => c.id === detailId) || null : null, [detailId, catalog]);

  // Action queue and global-search deep links open the card directly.
  useEffect(() => {
    if (!focus?.id) return;
    if (catalog.some((c) => c.id === focus.id)) {
      detailIndex.current = 0;
      setDetailId(focus.id);
    }
    onFocusConsumed?.();
  }, [focus, catalog, onFocusConsumed]);

  const binders = useMemo(() => [...new Set(catalog.map((c) => c.binder).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [catalog]);
  const filtered = useMemo(() => filterCatalog(catalog, {
    binder: binderF, status: statusF, search: catSearch, sort: sortBy,
  }), [catalog, binderF, statusF, sortBy, catSearch]);
  const summary = useMemo(() => summarizeCatalog(catalog), [catalog]);
  const hasFilters = Boolean(binderF || statusF !== "all" || catSearch.trim());

  useEffect(() => {
    if (!detailId && returnFocusOrigin.current) {
      const id = catalogReturnFocusId(filtered, returnFocusOrigin.current);
      const target = cardButtons.current.get(id) || searchInput.current || collectionHeading.current;
      target?.focus();
      returnFocusOrigin.current = null;
    }
  }, [detailId, filtered]);

  useEffect(() => {
    filtered.forEach((c) => {
      if (!c.frontImgId || thumbAttempted.current.has(c.frontImgId)) return;
      thumbAttempted.current.add(c.frontImgId);
      loadImage(c.frontImgId)
        .then((img) => { if (img) setThumbs((p) => ({ ...p, [c.frontImgId]: img })); })
        .catch(() => {}); // A missing local photo must not interrupt browsing.
    });
  }, [filtered]);

  const frontImgId = detail?.frontImgId;
  const backImgId = detail?.backImgId;
  useEffect(() => {
    setDetailFrontImg(null); setDetailBackImg(null);
    let cancelled = false;
    if (frontImgId) loadImage(frontImgId).then((img) => { if (!cancelled) setDetailFrontImg(img); }).catch(() => {});
    if (backImgId) loadImage(backImgId).then((img) => { if (!cancelled) setDetailBackImg(img); }).catch(() => {});
    return () => { cancelled = true; };
  }, [detailId, frontImgId, backImgId]);

  const handleDetailBack = async (deleteId) => {
    if (deleteId) {
      const d = catalog.find((c) => c.id === deleteId);
      if (d?.frontImgId) await deleteImage(d.frontImgId).catch(() => {});
      if (d?.backImgId) await deleteImage(d.backImgId).catch(() => {});
      setCatalog((p) => p.filter((c) => c.id !== deleteId));
      toast.info("Card deleted");
    }
    returnFocusOrigin.current = { id: detailId, index: detailIndex.current };
    setDetailId(null);
  };

  const resetFilters = () => {
    setBinderF(""); setStatusF("all"); setCatSearch("");
    searchInput.current?.focus();
  };

  if (detail) {
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

  return (
    <div className="catalog-view fade">
      <div className="catalog-heading">
        <h1 className="page-title" ref={collectionHeading} tabIndex={-1}>Collection</h1>
        {catalog.length > 0 && onNavigate && (
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate("scan")}>
            <IconCamera size={16} aria-hidden="true" /> Scan card
          </button>
        )}
      </div>

      {catalog.length === 0 ? (
        <div className="card catalog-empty">
          <IconCopy size={36} aria-hidden="true" />
          <h2>Your collection starts here</h2>
          <p>Scan a card or upload a photo to add your first card.</p>
          {onNavigate && <button className="btn btn-primary" onClick={() => onNavigate("scan")}>
            <IconCamera size={16} aria-hidden="true" /> Scan your first card
          </button>}
        </div>
      ) : (
        <>
          <section className="card-hero catalog-summary" aria-label="Collection overview">
            <div className="catalog-metric catalog-value">
              <span className="catalog-label">Estimated value · CAD</span>
              <strong>{summary.priced ? fmtShort(summary.value) : "—"}</strong>
              <span>{summary.priced} of {summary.owned} owned cards priced</span>
            </div>
            <div className="catalog-metric">
              <span className="catalog-label">Cards owned</span>
              <strong>{summary.owned}</strong>
              <span>{summary.listed} listed · {summary.sold} sold</span>
            </div>
            <div className="catalog-metric">
              <span className="catalog-label">Est. gain / loss</span>
              <strong className={summary.comparable ? summary.gain >= 0 ? "text-grn" : "text-red" : ""}>
                {summary.comparable ? `${summary.gain >= 0 ? "+" : "−"}${fmtShort(Math.abs(summary.gain))}` : "—"}
              </strong>
              <span>{summary.comparable} owned with value + cost</span>
            </div>
          </section>

          <div className="catalog-controls">
            <div className="catalog-search">
              <IconSearch size={18} aria-hidden="true" />
              <input ref={searchInput} className="inp" type="search" aria-label="Search collection"
                placeholder="Name, set, year, team or #…" value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)} />
              {catSearch && <button className="btn btn-ghost btn-icon" aria-label="Clear search"
                onClick={() => { setCatSearch(""); searchInput.current?.focus(); }}>
                <IconX size={16} aria-hidden="true" />
              </button>}
            </div>
            <div className="catalog-status chip-scroll" role="group" aria-label="Filter by card status">
              {[["all", "All cards", catalog.length], ["owned", "Owned", summary.owned], ["listed", "Listed", summary.listed], ["sold", "Sold", summary.sold]].map(([value, label, count]) => (
                <button key={value} className={`chip ${statusF === value ? "active" : ""}`}
                  aria-pressed={statusF === value} onClick={() => setStatusF(value)}>
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            <div className="catalog-toolbar">
              <label className="fld">
                <span className="catalog-label">Binder</span>
                <select className="inp" value={binderF} onChange={(e) => setBinderF(e.target.value)}>
                  <option value="">All binders</option>
                  {binders.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="fld">
                <span className="catalog-label">Sort by</span>
                <select className="inp" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="date_desc">Newest first</option>
                  <option value="date_asc">Oldest first</option>
                  <option value="value_desc">Highest value</option>
                  <option value="value_asc">Lowest value</option>
                  <option value="name_asc">Name A–Z</option>
                </select>
              </label>
            </div>
          </div>

          <div className="catalog-results-heading">
            <p role="status" aria-live="polite" aria-atomic="true">
              {filtered.length} {filtered.length === 1 ? "card" : "cards"}{hasFilters ? ` of ${catalog.length}` : ""}
            </p>
            {hasFilters && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Clear filters</button>}
            <div className="catalog-layout" role="group" aria-label="Collection layout">
              {[["list", IconList], ["grid", IconGrid]].map(([value, Icon]) => (
                <button key={value} className={`btn btn-icon ${layout === value ? "selected" : ""}`}
                  aria-label={`${value === "list" ? "List" : "Grid"} view`} aria-pressed={layout === value}
                  onClick={() => { setLayout(value); saveString("catalog_layout", value); }}>
                  <Icon size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card catalog-empty">
              <IconSearch size={30} aria-hidden="true" />
              <h2>No cards match your filters</h2>
              <p>Try another search, binder, or card status.</p>
              <button className="btn btn-outline" onClick={resetFilters}>Show all cards</button>
            </div>
          ) : (
            <ul className={`catalog-entries catalog-entries-${layout}`} aria-label="Collection cards">
              {filtered.map((c, index) => {
                const co = condOf(c.condition);
                const value = cardEstimate(c);
                const status = catalogStatus(c);
                const thumb = c.frontImgId ? thumbs[c.frontImgId] : null;
                return (
                  <li key={c.id}>
                    <button className="catalog-entry" ref={(node) => {
                      if (node) cardButtons.current.set(c.id, node);
                      else cardButtons.current.delete(c.id);
                    }} onClick={() => { detailIndex.current = index; setDetailId(c.id); }}>
                      <span className={`catalog-photo ${thumb ? "" : "catalog-photo-empty"}`} aria-hidden="true">
                        {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async"
                          onError={() => setThumbs((p) => ({ ...p, [c.frontImgId]: null }))} />
                          : <><IconCopy size={24} /><span>No photo</span></>}
                      </span>
                      <span className="catalog-card-info">
                        <strong className="catalog-card-name">{c.name || "Untitled card"}</strong>
                        <span className="catalog-card-meta">{[c.year, c.set, c.number != null && c.number !== "" && `#${c.number}`].filter(Boolean).join(" · ") || "No card details yet"}</span>
                        <span className="catalog-card-tags">
                          <span className="badge" style={{ background: `${co.c}15`, color: co.c }}>{co.s}</span>
                          <span className={`badge ${status === "sold" ? "badge-grn" : status === "listed" ? "badge-acc" : "badge-dim"}`}>
                            {status === "sold" ? "Sold" : status === "listed" ? "Listed" : "In collection"}
                          </span>
                          {c.binder && <span className="catalog-binder">{c.binder}</span>}
                        </span>
                      </span>
                      <span className="catalog-card-price">
                        <span>{value === null ? "Awaiting pricing" : "Est. value"}</span>
                        <strong>{value === null ? "—" : fmtShort(value)}</strong>
                      </span>
                      <IconChevron className="catalog-chevron" size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="card catalog-export" aria-label="Export collection">
            <div>
              <h2>Export collection</h2>
              <p>Includes all {catalog.length} {catalog.length === 1 ? "card" : "cards"}, regardless of filters.</p>
            </div>
            <div className="catalog-export-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => download(genCSV(catalog), "cardvault.csv")}><IconDownload size={14} aria-hidden="true" /> CSV</button>
              <button className="btn btn-ghost btn-sm" onClick={() => download(genEbayCSV(catalog, shipFrom), "ebay-file-exchange.csv")}><IconDownload size={14} aria-hidden="true" /> eBay</button>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const w = window.open("", "_blank");
                if (w) { w.document.write(genInsurancePDF(catalog, userName)); w.document.close(); setTimeout(() => w.print(), 500); }
                else toast.error("Popup blocked");
              }}><IconDownload size={14} aria-hidden="true" /> Insurance</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
