import { IconCopy } from "../Icons";
import NetPanel from "../NetPanel";
import SoldComps from "../SoldComps";
import { PLATFORMS, SHIP_CA } from "../../lib/constants";

const STRATEGIES = [
  { key: "quick", label: "Quick Sale", desc: "Sell fast at or below market" },
  { key: "market", label: "Market", desc: "Match current asking price" },
  { key: "premium", label: "Premium", desc: "Hold for higher margin" },
];

function deriveStrategyPrices(priceEst) {
  const low = parseFloat(priceEst?.low) || 0;
  const mid = parseFloat(priceEst?.mid) || 0;
  const high = parseFloat(priceEst?.high) || 0;
  if (!mid) return null;
  return {
    quick: low || Math.round(mid * 0.9 * 100) / 100,
    market: mid,
    premium: high || Math.round(mid * 1.15 * 100) / 100,
  };
}

export default function ScanListingStep({
  listing,
  onCopy,
  onListingChange,
  onNewCard,
  onSaveAndList,
  onSaveOnly,
  saving,
  publishing = false,
  publishTarget = null,
  costBasis = 0,
  feeRate = 0,
  comps = [],
  priceEst = {},
}) {
  const strategyPrices = deriveStrategyPrices(priceEst);
  const busy = saving || publishing;
  const saveAndListLabel = publishTarget
    ? publishTarget.mode === "handoff"
      ? `Save + Queue for ${publishTarget.label}`
      : `Save + Publish to ${publishTarget.label}`
    : "Save + List";

  function applyStrategy(key) {
    if (!strategyPrices) return;
    onListingChange("price", String(strategyPrices[key]));
  }

  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          Listing
        </h2>

        <div className="form-section">
          <div className="lbl">Platform</div>
          <div className="chip-row">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.v}
                onClick={() => onListingChange("platform", platform.v)}
                className={`chip ${listing.platform === platform.v ? "active" : ""}`}
              >
                {platform.l}
              </button>
            ))}
          </div>
        </div>

        {strategyPrices && (
          <div className="form-section">
            <div className="lbl">Pricing strategy</div>
            <div className="chip-row">
              {STRATEGIES.map(({ key, label }) => {
                const sp = strategyPrices[key];
                const active = parseFloat(listing.price) === sp;
                return (
                  <button
                    key={key}
                    onClick={() => applyStrategy(key)}
                    className={`chip ${active ? "active" : ""}`}
                    title={STRATEGIES.find((s) => s.key === key).desc}
                  >
                    {label} <span style={{ opacity: 0.7, fontSize: 11 }}>${sp.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="fld mb-8">
          <span className="lbl">Title</span>
          <input
            className="inp fw-600"
            value={listing.title}
            onChange={(event) => onListingChange("title", event.target.value)}
          />
        </label>

        <div className="form-grid mb-8">
          <label className="fld">
            <span className="lbl">Price (CAD)</span>
            <input
              className="inp fw-800"
              style={{ fontSize: 18 }}
              type="number"
              step="0.01"
              value={listing.price}
              onChange={(event) => onListingChange("price", event.target.value)}
            />
          </label>
          <label className="fld">
            <span className="lbl">Shipping $</span>
            <input
              className="inp"
              type="number"
              step="0.01"
              value={listing.shipping}
              onChange={(event) => onListingChange("shipping", event.target.value)}
            />
          </label>
        </div>

        <NetPanel
          price={listing.price}
          shipping={listing.shipping}
          feeRate={feeRate}
          costBasis={costBasis}
        />

        <SoldComps comps={comps} />

        <label className="fld mb-10 mt-8">
          <span className="lbl">Description</span>
          <textarea
            className="inp"
            style={{ minHeight: 80, resize: "vertical" }}
            value={listing.description}
            onChange={(event) => onListingChange("description", event.target.value)}
          />
        </label>

        <div className="lbl">Canada Post Shipping</div>
        <div className="text-xs text-dim mb-6">
          Recommended: Tracked Packet (~$13 CAD, 4-7 days)
        </div>
        <div className="flex gap-6 flex-wrap">
          {SHIP_CA.map((shipping) => (
            <span key={shipping.l} className="badge badge-dim">
              {shipping.l} {shipping.p}
            </span>
          ))}
        </div>
      </div>

      {publishTarget && (
        <div className="text-xxs text-dim mb-8" style={{ textAlign: "center" }}>
          {publishTarget.mode === "handoff"
            ? `Creates a ${publishTarget.label} handoff — review and submit it from the Sales tab`
            : `Publishes live to ${publishTarget.label} via your connected account`}
        </div>
      )}
      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" onClick={onCopy}>
          <IconCopy size={14} /> Copy
        </button>
        <button className="btn btn-outline btn-lg flex-1" disabled={busy} onClick={onSaveAndList}>
          {publishing ? "Publishing…" : saveAndListLabel}
        </button>
      </div>
      <button className="btn btn-ghost btn-lg btn-full mt-8" disabled={busy} onClick={onSaveOnly}>
        Save Only
      </button>
      <button
        className="btn btn-ghost btn-sm btn-full mt-6"
        style={{ color: "var(--dim)" }}
        onClick={onNewCard}
      >
        + New Card
      </button>
    </section>
  );
}
