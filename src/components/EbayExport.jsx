import { useState, useMemo } from "react";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";
import { IconCheck, Spinner } from "./Icons";

// eBay 2026 condition descriptor mappings (mirrors cv-service/ebay_engine.py)
function centeringDesc(score) {
  if (score >= 9.5) return "Gem Mint Centering";
  if (score >= 9.0) return "Well Centered";
  if (score >= 7.0) return "Slightly Off Center";
  return "Off Center";
}

function cornerDesc(score) {
  if (score >= 9.5) return "Sharp";
  if (score >= 8.5) return "Slightly Rounded";
  return "Rounded";
}

function edgeDesc(score) {
  if (score >= 9.5) return "None";
  if (score >= 8.5) return "Minor";
  return "Moderate";
}

function conditionId(grade) {
  if (grade >= 9.5) return 2750;
  if (grade >= 8.0) return 3000;
  if (grade >= 6.0) return 4000;
  return 5000;
}

function buildCsv(cards, currency, shipFrom) {
  const site = currency === "CAD" ? "Country=CA|Currency=CAD" : "Country=US|Currency=USD";
  const category = currency === "CAD" ? "213" : "212";
  const shipService = currency === "CAD" ? "CA_StandardInternationalFlat" : "USPSFirstClass";
  const shipCost = currency === "CAD" ? "4.99" : "3.99";
  const location = shipFrom || "Alberta, Canada";

  const header = [
    `Action(SiteID=US|${site})`, "Category", "Title", "Description", "ConditionID",
    "Format", "StartPrice", "Quantity", "Duration", "Location",
    "ShippingService-1:Option", "ShippingService-1:Cost", "DispatchTimeMax",
    "ReturnsAcceptedOption", "C:Player", "C:Season", "C:Set", "C:Parallel/Variety",
    "C:Graded", "C:Centering", "C:Corner_Sharpness", "C:Edge_Chipping",
  ];

  const rows = cards.map((c) => {
    const title = [c.year, c.set, c.name, c.number && `#${c.number}`, c.parallel]
      .filter(Boolean).join(" ").slice(0, 80);

    const price = c.priceEstimate?.mid || "0.99";
    const centering = parseFloat(c.centering || c.cv_centering_score) || 9;
    const corners = parseFloat(c.corners) || 9;
    const edges = parseFloat(c.edges) || 9;
    const grade = parseFloat(c.projected_grade) || 9;

    return [
      "Add", category, esc(title),
      esc(`Ships in penny sleeve + toploader from Canada.`),
      conditionId(grade), "FixedPrice", price, "1", "GTC", esc(location),
      shipService, shipCost, "3", "ReturnsAccepted",
      esc(c.name), c.year || "", esc(c.set || ""),
      esc(c.parallel || c.rarity || ""),
      c.gradeCompany ? "Yes" : "No",
      centeringDesc(centering), cornerDesc(corners), edgeDesc(edges),
    ];
  });

  return [header, ...rows].map((r) => r.join(",")).join("\n");
}

function esc(str) {
  if (!str) return '""';
  return `"${String(str).replace(/"/g, '""')}"`;
}

export default function EbayExport() {
  const { catalog, shipFrom } = useData();
  const [currency, setCurrency] = useState("CAD");
  const [selected, setSelected] = useState(new Set());
  const [generating, setGenerating] = useState(false);

  const exportable = useMemo(
    () => catalog.filter((c) => c.name && c.status !== "sold"),
    [catalog]
  );

  const toggleAll = () => {
    if (selected.size === exportable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(exportable.map((c) => c.id)));
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doExport = () => {
    setGenerating(true);
    try {
      const cards = exportable.filter((c) => selected.has(c.id));
      if (cards.length === 0) return;

      const csv = buildCsv(cards, currency, shipFrom);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ebay_${currency.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card-elevated fade mb-12">
      <div className="flex justify-between items-center mb-8">
        <div className="lbl" style={{ margin: 0 }}>eBay CSV Export</div>
        <div className="flex gap-6">
          <button
            className={`chip ${currency === "CAD" ? "active" : ""}`}
            onClick={() => setCurrency("CAD")}
          >
            eBay.ca (CAD)
          </button>
          <button
            className={`chip ${currency === "USD" ? "active" : ""}`}
            onClick={() => setCurrency("USD")}
          >
            eBay.com (USD)
          </button>
        </div>
      </div>

      <div className="text-xxs text-dim mb-8">
        Includes 2026 mandatory condition descriptors (Centering, Corner Sharpness, Edge Chipping)
      </div>

      {exportable.length === 0 ? (
        <div className="text-xs text-dim" style={{ padding: 16, textAlign: "center" }}>
          No cards available for export
        </div>
      ) : (
        <>
          <div className="flex items-center gap-8 mb-8">
            <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
              {selected.size === exportable.length ? "Deselect All" : "Select All"}
            </button>
            <span className="text-xs text-dim">{selected.size} of {exportable.length} selected</span>
          </div>

          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
            {exportable.map((c) => (
              <label key={c.id} className="flex items-center gap-8" style={{
                padding: "6px 8px", cursor: "pointer", fontSize: 12,
                borderBottom: "1px solid var(--brd)",
                background: selected.has(c.id) ? "var(--s1)" : "transparent",
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  style={{ accentColor: "var(--acc-solid)" }}
                />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xxs text-dim">{c.set}</span>
                <span className="fw-700" style={{ color: "var(--acc-solid)", minWidth: 50, textAlign: "right" }}>
                  {fmtShort(c.priceEstimate?.mid)}
                </span>
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary btn-full"
            disabled={selected.size === 0 || generating}
            onClick={doExport}
          >
            {generating ? <Spinner size={14} /> : <IconCheck size={14} />}
            {" "}Generate {currency} CSV ({selected.size} cards)
          </button>
        </>
      )}
    </div>
  );
}
