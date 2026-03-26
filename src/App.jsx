import { useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { DataProvider, useData } from "./lib/DataContext";
import ScanView from "./components/ScanView";
import BatchView from "./components/BatchView";
import CatalogView from "./components/CatalogView";
import SetsView from "./components/SetsView";
import GradeTracker from "./components/GradeTracker";
import Watchlist from "./components/Watchlist";
import TradeTracker from "./components/TradeTracker";
import SalesFlow from "./components/SalesFlow";
import Settings from "./components/Settings";
import "./styles/app.css";

const TABS = [
  { v: "scan", i: "\ud83d\udcf8", l: "Scan" },
  { v: "batch", i: "\u26a1", l: "Batch" },
  { v: "cards", i: "\ud83d\udccb", l: "Cards" },
  { v: "sales", i: "\ud83d\udcb0", l: "Sales" },
  { v: "grade", i: "\ud83c\udfc5", l: "Grade" },
  { v: "watch", i: "\ud83d\udc41\ufe0f", l: "Watch" },
  { v: "trade", i: "\ud83e\udd1d", l: "Trade" },
  { v: "more", i: "\u2699\ufe0f", l: "More" },
];

function AppContent() {
  const [view, setView] = useState("scan");
  const [online, setOnline] = useState(navigator.onLine);
  const { catalog, userName } = useData();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", maxWidth: 740, margin: "0 auto", padding: "0 12px 80px" }}>
      {!online && (
        <div className="fade" style={{ background: "#e5484d22", border: "1px solid #e5484d44", borderRadius: 10, padding: "6px 12px", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--red)", textAlign: "center" }}>
          Offline &mdash; local features work, AI needs internet
        </div>
      )}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 8px", borderBottom: "1px solid var(--brd)", marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
          <span className="gold">CardVault</span>
        </h1>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {userName && <span style={{ fontSize: 12, color: "var(--dim)" }}>{userName}</span>}
          <button className="btn-o" onClick={() => setView("cards")}>{catalog.filter((c) => c.status !== "sold").length} cards</button>
        </div>
      </header>

      {view === "scan" && <ScanView onNavigate={setView} />}
      {view === "batch" && <BatchView />}
      {view === "cards" && <CatalogView />}
      {view === "sales" && <SalesFlow />}
      {view === "sets" && <SetsView />}
      {view === "grade" && <GradeTracker />}
      {view === "watch" && <Watchlist />}
      {view === "trade" && <TradeTracker />}
      {view === "more" && <Settings />}

      <div className="nav-bar" role="tablist">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setView(t.v)} className="nav-btn" role="tab" aria-selected={view === t.v} style={{ color: view === t.v ? "var(--acc)" : "var(--dim)" }}>
            <span className="icon">{t.i}</span>
            <span className="label" style={{ fontWeight: view === t.v ? 700 : 500 }}>{t.l}</span>
            {view === t.v && <div className="nav-indicator" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
