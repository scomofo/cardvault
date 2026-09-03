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
  { v: "dealer", l: "Dealer", Icon: IconTools },
  { v: "more", l: "More", Icon: IconSettings },
];

// Views reachable from the More menu keep the "more" nav slot highlighted.
const MORE_VIEWS = new Set(["more", "tools", "settings"]);

const TOOL_TABS = [
  { v: "batch", l: "Batch" },
  { v: "sets", l: "Sets" },
  { v: "grade", l: "Grading" },
  { v: "watch", l: "Watch" },
  { v: "trade", l: "Trades" },
];

const MORE_ITEMS = [
  { label: "Batch Scan", desc: "Bulk photo intake and processing", target: { view: "tools", toolsTab: "batch" } },
  { label: "Sets", desc: "Set completion tracking", target: { view: "tools", toolsTab: "sets" } },
  { label: "Grading", desc: "PSA/BGS/SGC submission tracker", target: { view: "tools", toolsTab: "grade" } },
  { label: "Watchlist", desc: "Price target alerts", target: { view: "tools", toolsTab: "watch" } },
  { label: "Trades", desc: "Trade log and partner balances", target: { view: "tools", toolsTab: "trade" } },
  { label: "Settings", desc: "Connections, fees, backup, and data", target: { view: "settings" } },
];

function MoreView({ onNavigate }) {
  return (
    <div className="fade">
      <h1 className="page-title">More</h1>
      {MORE_ITEMS.map((item) => (
        <button
          key={item.label}
          className="card card-interactive mb-8"
          style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
          onClick={() => onNavigate(item.target)}
        >
          <div className="text-xs fw-700">{item.label}</div>
          <div className="text-xxs text-dim mt-4">{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function ToolsView({ tab, setTab, focus, onFocusConsumed }) {
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
      {tab === "sets" && <SetsView />}
      {tab === "grade" && <GradeTracker focus={focus} onFocusConsumed={onFocusConsumed} />}
      {tab === "watch" && <Watchlist />}
      {tab === "trade" && <TradeTracker />}
    </div>
  );
}

function AppContent() {
  const [view, setView] = useState("dashboard");
  const [toolsTab, setToolsTab] = useState("batch");
  const [online, setOnline] = useState(navigator.onLine);
  // Record-level navigation target ({ type, id }); consumed by the view it
  // lands on (same pattern as pendingScanImage).
  const [pendingFocus, setPendingFocus] = useState(null);
  const { catalog, userName } = useData();

  const handleNavigate = (target) => {
    if (typeof target === "string") {
      setPendingFocus(null);
      setView(target);
      return;
    }

    if (target?.toolsTab) {
      setToolsTab(target.toolsTab);
    }
    setPendingFocus(target?.focus || null);
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
    const off = window.cardvault?.onOpenSettings?.(() => setView("settings"));
    return off;
  }, []);

  useEffect(() => {
    const off = window.cardvault?.onDeepLink?.((url) => {
      try {
        const parsed = new URL(url);
        const host = parsed.host || parsed.hostname;
        if (host === "settings") {
          handleNavigate("settings");
        } else if (host === "card") {
          // cardvault://card/<id> (Spotlight) — open that card's detail.
          const cardId = decodeURIComponent(parsed.pathname.split("/").filter(Boolean)[0] || "");
          handleNavigate(cardId ? { view: "cards", focus: { type: "card", id: cardId } } : "cards");
        } else if (host === "scan") {
          handleNavigate("scan");
        } else if (host === "dashboard") {
          handleNavigate("dashboard");
        }
      } catch {
        // ignore malformed deep links
      }
    });
    return off;
  }, []);

  const activeCount = useMemo(() => catalog.filter((c) => c.status !== "sold").length, [catalog]);

  useEffect(() => {
    window.cardvault?.setBadgeCount?.(activeCount);
  }, [activeCount]);

  const [pendingScanImage, setPendingScanImage] = useState(null);

  useEffect(() => {
    const off = window.cardvault?.onScanImage?.((dataUrl) => {
      setPendingScanImage(dataUrl);
      setView("scan");
    });
    return off;
  }, []);

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
          <button className="btn btn-outline btn-sm" onClick={() => handleNavigate("cards")}>
            {activeCount} cards
          </button>
        </div>
      </header>

      <main>
        {/* Keyed by view so a crash is contained to the tab it happened on —
            switching tabs remounts a fresh boundary instead of carrying the
            error state into an unrelated view, and the header/nav above stay
            usable so the user can navigate away from the broken one. */}
        <ErrorBoundary key={view} fullScreen={false}>
          {view === "dashboard" && <DashboardView onNavigate={handleNavigate} />}
          {view === "scan" && (
            <ScanView
              onNavigate={handleNavigate}
              pendingImage={pendingScanImage}
              onPendingImageConsumed={() => setPendingScanImage(null)}
            />
          )}
          {view === "cards" && (
            <CatalogView focus={pendingFocus} onFocusConsumed={() => setPendingFocus(null)} />
          )}
          {view === "sales" && (
            <SalesFlow
              onNavigate={handleNavigate}
              focus={pendingFocus}
              onFocusConsumed={() => setPendingFocus(null)}
            />
          )}
          {view === "dealer" && <DealerModeView />}
          {view === "tools" && (
            <ToolsView
              tab={toolsTab}
              setTab={setToolsTab}
              focus={pendingFocus}
              onFocusConsumed={() => setPendingFocus(null)}
            />
          )}
          {view === "more" && <MoreView onNavigate={handleNavigate} />}
          {view === "settings" && <Settings />}
        </ErrorBoundary>
      </main>

      <nav className="nav-bar" role="tablist">
        {NAV.map((t) => {
          const isActive = view === t.v || (t.v === "more" && MORE_VIEWS.has(view));
          return (
            <button key={t.v} onClick={() => handleNavigate(t.v)}
              className={`nav-btn ${isActive ? "active" : ""}`}
              role="tab" aria-selected={isActive}>
              <t.Icon size={22} className="nav-icon" />
              <span className="nav-label">{t.l}</span>
              {isActive && <div className="nav-indicator" />}
            </button>
          );
        })}
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
