import { useState, useEffect, useMemo } from "react";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { DataProvider, useData } from "./lib/DataContext";
import { IconCamera, IconCards, IconDollar, IconTools, IconSettings, IconBarChart } from "./components/Icons";
import GlobalSearch from "./components/GlobalSearch";
import DashboardView from "./components/DashboardView";
import ScanView from "./components/ScanView";
import BatchView from "./components/BatchView";
import CatalogView from "./components/CatalogView";
import SetsView from "./components/SetsView";
import GradeTracker from "./components/GradeTracker";
import Watchlist from "./components/Watchlist";
import TradeTracker from "./components/TradeTracker";
import SalesFlow from "./components/SalesFlow";
import DealerModeView from "./components/DealerModeView";
import Settings from "./components/Settings";
import "./styles/app.css";

const NAV = [
  { v: "dashboard", l: "Dash", Icon: IconBarChart },
  { v: "scan", l: "Scan", Icon: IconCamera },
  { v: "cards", l: "Cards", Icon: IconCards },
  { v: "sales", l: "Sales", Icon: IconDollar },
  { v: "tools", l: "Tools", Icon: IconTools },
  { v: "more", l: "More", Icon: IconSettings },
];

const TOOL_TABS = [
  { v: "batch", l: "Batch" },
  { v: "dealer", l: "Dealer" },
  { v: "sets", l: "Sets" },
  { v: "grade", l: "Grading" },
  { v: "watch", l: "Watch" },
  { v: "trade", l: "Trades" },
];

function ToolsView({ tab, setTab }) {
  return (
    <div className="fade">
      <h1 className="page-title">Tools</h1>
      <div className="chip-scroll mb-12">
        {TOOL_TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`chip ${tab === t.v ? "active" : ""}`}>
            {t.l}
          </button>
        ))}
      </div>
      {tab === "batch" && <BatchView />}
      {tab === "dealer" && <DealerModeView />}
      {tab === "sets" && <SetsView />}
      {tab === "grade" && <GradeTracker />}
      {tab === "watch" && <Watchlist />}
      {tab === "trade" && <TradeTracker />}
    </div>
  );
}

function AppContent() {
  const [view, setView] = useState("dashboard");
  const [toolsTab, setToolsTab] = useState("batch");
  const [online, setOnline] = useState(navigator.onLine);
  const { catalog, userName } = useData();

  const handleNavigate = (target) => {
    if (typeof target === "string") {
      setView(target);
      return;
    }

    if (target?.toolsTab) {
      setToolsTab(target.toolsTab);
    }
    if (target?.view) {
      setView(target.view);
    }
  };

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    const off = window.cardvault?.onOpenSettings?.(() => setView("more"));
    return off;
  }, []);

  const activeCount = useMemo(() => catalog.filter((c) => c.status !== "sold").length, [catalog]);

  useEffect(() => {
    window.cardvault?.setBadgeCount?.(activeCount);
  }, [activeCount]);

  return (
    <div className="app-shell">
      {!online && (
        <div className="offline-banner fade">
          Offline &mdash; local features work, AI needs internet
        </div>
      )}

      <header className="app-header">
        <h1 className="app-logo">
          <span className="gold">Card</span><span style={{ color: "var(--tx)" }}>Vault</span>
        </h1>
        <div className="flex items-center gap-8">
          <GlobalSearch onNavigate={handleNavigate} />
          {userName && <span className="text-xs text-dim" style={{ letterSpacing: ".5px" }}>{userName}</span>}
          <button className="btn btn-outline btn-sm" onClick={() => setView("cards")}>
            {activeCount} cards
          </button>
        </div>
      </header>

      <main>
        {view === "dashboard" && <DashboardView />}
        {view === "scan" && <ScanView onNavigate={setView} />}
        {view === "cards" && <CatalogView />}
        {view === "sales" && <SalesFlow />}
        {view === "tools" && <ToolsView tab={toolsTab} setTab={setToolsTab} />}
        {view === "more" && <Settings />}
      </main>

      <nav className="nav-bar" role="tablist">
        {NAV.map((t) => (
          <button key={t.v} onClick={() => setView(t.v)}
            className={`nav-btn ${view === t.v ? "active" : ""}`}
            role="tab" aria-selected={view === t.v}>
            <t.Icon size={22} className="nav-icon" />
            <span className="nav-label">{t.l}</span>
            {view === t.v && <div className="nav-indicator" />}
          </button>
        ))}
      </nav>
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
