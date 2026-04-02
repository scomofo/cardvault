import GradingSlider from "../GradingSlider";
import { IconChevron, IconShield } from "../Icons";
import { CONDITIONS, TYPES } from "../../lib/constants";

export default function ScanDetailsStep({
  card,
  cvResult,
  gradingData,
  onCardChange,
  onCostBasisChange,
  onCreateListing,
  onSave,
  onSaveGrading,
  onToggleGrading,
  saving,
  showGrading,
}) {
  return (
    <section className="slide-up">
      <div className="card-hero mb-12">
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          Card Details
        </h2>

        <div className="form-grid mb-10">
          {[
            ["Name *", "name"],
            ["Set", "set"],
            ["Year", "year"],
            ["Card #", "number"],
            ["Rarity", "rarity"],
            ["Parallel", "parallel"],
          ].map(([label, key]) => (
            <label key={key} className="fld">
              <span className="lbl">{label}</span>
              <input
                className="inp"
                value={card[key]}
                onChange={(event) => onCardChange(key, event.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="form-section">
          <div className="lbl">Type</div>
          <div className="chip-row">
            {TYPES.map((type) => (
              <button
                key={type.v}
                onClick={() => onCardChange("type", type.v)}
                className={`chip ${card.type === type.v ? "active" : ""}`}
              >
                {type.i} {type.l}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="lbl">Condition</div>
          <div className="chip-row">
            {CONDITIONS.map((condition) => (
              <button
                key={condition.v}
                onClick={() => onCardChange("condition", condition.v)}
                className="chip"
                style={{
                  borderColor:
                    card.condition === condition.v ? condition.c : undefined,
                  color: card.condition === condition.v ? condition.c : undefined,
                  background:
                    card.condition === condition.v
                      ? `${condition.c}15`
                      : undefined,
                }}
              >
                {condition.s}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid mt-12">
          <label className="fld">
            <span className="lbl">Cost (CAD)</span>
            <input
              className="inp"
              type="number"
              step="0.01"
              value={card.costBasis}
              onChange={(event) => onCostBasisChange(event.target.value)}
            />
          </label>
          <label className="fld">
            <span className="lbl">Binder</span>
            <input
              className="inp"
              value={card.binder}
              onChange={(event) => onCardChange("binder", event.target.value)}
            />
          </label>
        </div>
      </div>

      {!showGrading ? (
        <button className="btn btn-outline btn-full mb-12" onClick={onToggleGrading}>
          <IconShield size={14} /> Quick Grade Assessment
        </button>
      ) : (
        <div className="mb-12">
          <GradingSlider
            initialGrades={gradingData || undefined}
            cvCentering={cvResult?.centering}
            onSave={onSaveGrading}
            onCancel={onToggleGrading}
          />
        </div>
      )}

      {gradingData && !showGrading && (
        <div
          className="card mb-12"
          style={{
            borderColor:
              gradingData.vault_status === "GREEN"
                ? "var(--grn-brd)"
                : gradingData.vault_status === "YELLOW"
                  ? "var(--acc-brd)"
                  : "var(--red-brd)",
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <span className="lbl" style={{ margin: 0 }}>
                Grade
              </span>
              <span className="gold fw-800" style={{ fontSize: 22, marginLeft: 8 }}>
                {gradingData.projected_grade}
              </span>
            </div>
            <span
              className={`badge ${gradingData.vault_status === "GREEN" ? "badge-grn" : gradingData.vault_status === "YELLOW" ? "badge-acc" : "badge-red"}`}
            >
              {gradingData.vault_status}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={onToggleGrading}>
              Edit
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-8">
        <button className="btn btn-primary btn-lg flex-1" disabled={saving} onClick={onSave}>
          Save Card
        </button>
        <button className="btn btn-outline btn-lg flex-1" onClick={onCreateListing}>
          Create Listing <IconChevron size={14} />
        </button>
      </div>
    </section>
  );
}
