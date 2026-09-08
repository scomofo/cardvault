import { useMemo, useState } from "react";
import { useData } from "../lib/DataContext";
import { deriveSellerWorkflow } from "../lib/sellerWorkflow";
import { IconCamera, IconChevron, Skeleton } from "./Icons";
import DraftPreparation from "./DraftPreparation";
import "../styles/seller.css";

const GROUPS = {
  prepare: { label: "Prepare cards", description: "Review prices and create drafts in one batch." },
  drafts: { label: "Review drafts", description: "These listings have not been confirmed live. Open a draft to review and publish." },
  live: { label: "Live listings", description: "Publication confirmed by a marketplace. Sync a listing in Sales to check for an order." },
  ship: { label: "Pack & ship", description: "Paid orders, oldest first. Prepare postage and confirm dispatch after carrier handoff." },
  review: { label: "Check publication", description: "Open these listings and check the marketplace before retrying publication." },
  handoff: { label: "Handoffs", description: "Review and submit these consignments from Sales." },
  publishing: { label: "Publishing", description: "Publication is in progress. Check the listing before attempting another publish." },
  awaitingPayment: { label: "Awaiting payment", description: "These orders are waiting for payment before shipping." },
};

export default function SellerHome({ onNavigate }) {
  const { catalog, listings, orders, loading, useServer } = useData();
  const workflow = useMemo(() => deriveSellerWorkflow({ catalog, listings, orders }), [catalog, listings, orders]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const group = selectedGroup || workflow.nextGroup;
  const rows = workflow[group];
  const openRecord = (record) => onNavigate({ view: "sales", focus: { type: ["ship", "awaitingPayment"].includes(group) ? "order" : "listing", id: record.id } });

  return <section className="seller-home" aria-label="Selling workspace">
    <div className="seller-heading">
      <h1 className="page-title">Sell your collection</h1>
      <button className="btn btn-primary" onClick={() => onNavigate({ view: "scan", focus: { type: "scan_mode", id: "batch" } })}><IconCamera size={18} /> Scan a batch</button>
    </div>
    <div className="seller-shortcuts">
      <button className="btn btn-outline" onClick={() => onNavigate({ view: "tools", toolsTab: "batch" })}>Upload photos / add cards</button>
      <button className="btn btn-ghost" onClick={() => onNavigate("cards")}>Open collection</button>
      <button className="btn btn-ghost" onClick={() => onNavigate("settings")}>Selling setup</button>
    </div>
    {loading ? <Skeleton h={120} /> : <>
      {!useServer && <p className="seller-note" role="status">Using saved data on this device. Connect to the CardVault server to publish or refresh marketplace orders.</p>}
      <div className="seller-stages" aria-label="Selling tasks">
        {["prepare", "drafts", "live", "ship"].map((key) => <button key={key} aria-pressed={group === key} className={`seller-stage ${group === key ? "is-selected" : ""}`} onClick={() => setSelectedGroup(key)}>
          <strong>{workflow[key].length}</strong><span>{GROUPS[key].label}</span>
        </button>)}
      </div>
      <div className="seller-exceptions">
        {["review", "handoff", "publishing", "awaitingPayment"].filter((key) => workflow[key].length).map((key) => <button className="btn btn-outline" aria-pressed={group === key} key={key} onClick={() => setSelectedGroup(key)}>{GROUPS[key].label} · {workflow[key].length}</button>)}
      </div>
      <div className="card seller-work">
        <h2>{GROUPS[group].label}</h2>
        {group === "prepare" ? <DraftPreparation cards={rows} onNavigate={onNavigate} onWorkStarted={() => setSelectedGroup("prepare")} /> : <>
          <p>{GROUPS[group].description}</p>
          {rows.length === 0 && <p className="seller-note">Nothing waiting here.</p>}
          {rows.map((record) => <button className="seller-task" key={record.id} onClick={() => openRecord(record)}>
            <span><strong>{record.cardName || record.card_name || "Open record"}</strong>
              <span className="seller-note">{[record.platform, record.storageLocation && `Pick from ${record.storageLocation}`, record.soldAt && new Date(record.soldAt).toLocaleDateString()].filter(Boolean).join(" · ")}</span>
            </span><IconChevron size={18} />
          </button>)}
        </>}
      </div>
    </>}
  </section>;
}
