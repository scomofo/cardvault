import { IconCopy } from "../Icons";
import ProfitWarning from "../ProfitWarning";
import SoldComps from "../SoldComps";
import { PLATFORMS, SHIP_CA } from "../../lib/constants";

export default function ScanListingStep({
  listing,
  onCopy,
  onListingChange,
  onNewCard,
  onSaveAndList,
  onSaveOnly,
  saving,
  costBasis = 0,
  feeRate = 0,
  comps = [],
}) {
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
        <SoldComps comps={comps} />
        <ProfitWarning price={parseFloat(listing.price)} costBasis={costBasis} feeRate={feeRate} shipping={parseFloat(listing.shipping) || 0} />

        <label className="fld mb-10">
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

      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" onClick={onCopy}>
          <IconCopy size={14} /> Copy
        </button>
        <button className="btn btn-outline btn-lg flex-1" disabled={saving} onClick={onSaveAndList}>
          Save + List
        </button>
      </div>
      <button className="btn btn-ghost btn-lg btn-full mt-8" disabled={saving} onClick={onSaveOnly}>
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
