import CenteringOverlay from "../CenteringOverlay";
import PriceChart from "../PriceChart";
import {
  IconChevron,
  IconExternalLink,
  IconSearch,
  IconZap,
  Spinner,
} from "../Icons";
import { fmtShort } from "../../lib/utils";

const SEARCH_LINKS = [
  {
    label: "eBay Sold",
    buildHref: (query) =>
      `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`,
  },
  {
    label: "TCGplayer",
    buildHref: (query) =>
      `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(query)}`,
  },
  {
    label: "130point",
    buildHref: (query) =>
      `https://130point.com/sales/?search=${encodeURIComponent(query)}`,
  },
  {
    label: "Google Lens",
    buildHref: (query) =>
      `https://lens.google.com/search?p=${encodeURIComponent(query)}`,
  },
];

const CONFIDENCE_STYLE = {
  high:   { cls: "badge-grn",    label: "High confidence" },
  medium: { cls: "badge-acc",    label: "Medium confidence — verify match" },
  low:    { cls: "badge-red",    label: "Low confidence — review required" },
};

export default function ScanIdentifyStep({
  backImg,
  cvResult,
  frontImg,
  onContinue,
  onRecognize,
  onSearch,
  onSearchQChange,
  onToggleOverlay,
  priceEst,
  priceHistory,
  recognizing,
  results,
  searchQ,
  searching,
  showCvOverlay,
  status,
  matchConfidence = null,
}) {
  const busy = searching || recognizing;
  const confStyle = matchConfidence ? CONFIDENCE_STYLE[matchConfidence] : null;

  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
          Identify & Price
        </h2>

        {status && (
          <div className="flex items-center gap-6 flex-wrap mb-8">
            <div className="badge" style={{ display: "inline-flex" }}>
              {busy && <Spinner size={12} />}
              <span className={busy ? "badge-acc" : results.length ? "badge-grn" : "badge-red"}>
                {status}
              </span>
            </div>
            {confStyle && (
              <span className={`badge ${confStyle.cls}`} style={{ fontSize: 10 }}>
                {confStyle.label}
              </span>
            )}
          </div>
        )}
        {matchConfidence === "low" && !busy && (
          <div className="glass mb-8" style={{ padding: "8px 12px", borderColor: "var(--red-brd)", borderRadius: "var(--radius)", fontSize: 12 }}>
            <span style={{ color: "var(--red)" }}>Low confidence match — search manually or re-capture before listing.</span>
          </div>
        )}

        {frontImg && (
          <div className="flex gap-8 justify-center mb-10">
            <div style={{ position: "relative", display: "inline-block" }}>
              <img
                src={cvResult?.warped_image || frontImg}
                alt="Front"
                className="img-preview"
                style={{ height: 100 }}
              />
              {cvResult && showCvOverlay && (
                <CenteringOverlay centering={cvResult.centering} />
              )}
            </div>
            {backImg && (
              <img
                src={backImg}
                alt="Back"
                className="img-preview"
                style={{ height: 100 }}
              />
            )}
          </div>
        )}

        {cvResult && (
          <div className="flex gap-6 items-center justify-center mb-8">
            <span
              className={`badge ${cvResult.centering.is_gem ? "badge-grn" : "badge-acc"}`}
            >
              L/R: {cvResult.centering.lr} | T/B: {cvResult.centering.tb}
            </span>
            <span className="text-xxs text-dim">{cvResult.processing_ms}ms</span>
            <button className="btn btn-ghost btn-sm" onClick={onToggleOverlay}>
              {showCvOverlay ? "Hide" : "Show"} Overlay
            </button>
          </div>
        )}

        <div className="flex gap-8 mb-10">
          <input
            className="inp"
            placeholder="Card name or search..."
            value={searchQ}
            onChange={(event) => onSearchQChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSearch()}
          />
          <button className="btn btn-primary" onClick={onSearch} disabled={searching}>
            {searching ? <Spinner size={14} /> : <IconSearch size={16} />}
          </button>
          {frontImg && (
            <button className="btn btn-outline" onClick={onRecognize} disabled={recognizing}>
              {recognizing ? <Spinner size={14} /> : <IconZap size={16} />}
            </button>
          )}
        </div>

        <div className="flex gap-6 flex-wrap mb-8">
          {SEARCH_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.buildHref(searchQ)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-chip"
            >
              {link.label} <IconExternalLink size={10} />
            </a>
          ))}
        </div>

        {results.length > 0 && (
          <>
            <div
              className="glass"
              style={{
                display: "flex",
                justifyContent: "space-around",
                padding: "16px 0",
                borderRadius: "var(--radius)",
                margin: "10px 0",
              }}
            >
              <div className="stat-item">
                <div className="lbl" style={{ margin: 0 }}>
                  Low
                </div>
                <div className="stat-value text-red" style={{ fontSize: 18 }}>
                  {fmtShort(priceEst.low)}
                </div>
              </div>
              <div className="stat-item">
                <div className="lbl" style={{ margin: 0 }}>
                  Market
                </div>
                <div className="stat-value gold" style={{ fontSize: 28 }}>
                  {fmtShort(priceEst.mid)}
                </div>
              </div>
              <div className="stat-item">
                <div className="lbl" style={{ margin: 0 }}>
                  High
                </div>
                <div className="stat-value text-grn" style={{ fontSize: 18 }}>
                  {fmtShort(priceEst.high)}
                </div>
              </div>
            </div>

            {priceHistory.length > 1 && (
              <div className="mt-12 mb-12">
                <PriceChart data={priceHistory} />
              </div>
            )}

            <div className="lbl mt-12">Recent Sales</div>
            {results.map((result, index) => (
              <a
                key={result.url || `${result.title}-${index}`}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card-interactive flex items-center gap-8 mb-4"
                style={{
                  padding: "10px 14px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="text-sm truncate">{result.title}</div>
                  <div className="text-xxs text-dim">
                    {result.source} · {result.date}
                  </div>
                </div>
                <span className="gold fw-700" style={{ fontSize: 16 }}>
                  {fmtShort(result.price)}
                </span>
              </a>
            ))}
          </>
        )}
      </div>

      <button
        className={`btn btn-lg btn-full ${matchConfidence === "low" ? "btn-outline" : "btn-primary"}`}
        onClick={onContinue}
      >
        {matchConfidence === "low" ? "Continue anyway" : "Continue"} <IconChevron size={14} />
      </button>
    </section>
  );
}
