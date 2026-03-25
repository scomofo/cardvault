import { useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast";
import ScanView from "./components/ScanView";
import BatchView from "./components/BatchView";
import CatalogView from "./components/CatalogView";
import SetsView from "./components/SetsView";
import GradeTracker from "./components/GradeTracker";
import Watchlist from "./components/Watchlist";
import TradeTracker from "./components/TradeTracker";
import Settings from "./components/Settings";
import { loadData, saveData, loadString, saveString } from "./lib/storage";
import "./styles/app.css";

const TABS = [
  { v: "scan", i: "\ud83d\udcf8", l: "Scan" },
  { v: "batch", i: "\u26a1", l: "Batch" },
  { v: "cards", i: "\ud83d\udccb", l: "Cards" },
  { v: "sets", i: "\ud83d\udcca", l: "Sets" },
  { v: "grade", i: "\ud83c\udfc5", l: "Grade" },
  { v: "watch", i: "\ud83d\udc41\ufe0f", l: "Watch" },
  { v: "trade", i: "\ud83e\udd1d", l: "Trade" },
  { v: "more", i: "\u2699\ufe0f", l: "More" },
];

function AppContent() {
  const [view, setView] = useState("scan");
  const [online, setOnline] = useState(navigator.onLine);

  // Data stores — loaded from versioned localStorage
  const [catalog, setCatalog] = useState(() => loadData("catalog"));
  const [sales, setSales] = useState(() => loadData("sales"));
  const [trades, setTrades] = useState(() => loadData("trades"));
  const [watchlist, setWatchlist] = useState(() => loadData("watchlist"));
  const [gradings, setGradings] = useState(() => loadData("gradings"));
  const [userName, setUserName] = useState(() => loadString("user", ""));
  const [shipFrom, setShipFrom] = useState(() => loadString("addr", ""));

  // Persist on change
  useEffect(() => { saveData("catalog", catalog); }, [catalog]);
  useEffect(() => { saveData("sales", sales); }, [sales]);
  useEffect(() => { saveData("trades", trades); }, [trades]);
  useEffect(() => { saveData("watchlist", watchlist); }, [watchlist]);
  useEffect(() => { saveData("gradings", gradings); }, [gradings]);
  useEffect(() => { if (userName) saveString("user", userName); }, [userName]);
  useEffect(() => { if (shipFrom) saveString("addr", shipFrom); }, [shipFrom]);

  // Online/offline detection
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
        <div className="fade" style={{ background: "#e5484d22", border: "1px solid #e5484d44", borderRadius: 10, padding: "6px 12px", marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--red)", textAlign: "center" }}>
          Offline &mdash; local features work, AI needs internet
        </div>
      )}

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 8px", borderBottom: "1px solid var(--brd)", marginBottom: 12 }}>
        <h1 style={{ fontSize: 19, fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
          <span className="gold">CardVault</span>
        </h1>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {userName && <span style={{ fontSize: 10, color: "var(--dim)" }}>{userName}</span>}
          <button className="btn-o" onClick={() => setView("cards")}>{catalog.filter((c) => c.status !== "sold").length} cards</button>
        </div>
      </header>

      {/* Views */}
      {view === "scan" && <ScanView catalog={catalog} setCatalog={setCatalog} onNavigate={setView} />}
      {view === "batch" && <BatchView setCatalog={setCatalog} />}
      {view === "cards" && <CatalogView catalog={catalog} setCatalog={setCatalog} sales={sales} setSales={setSales} userName={userName} />}
      {view === "sets" && <SetsView catalog={catalog} />}
      {view === "grade" && <GradeTracker gradings={gradings} setGradings={setGradings} />}
      {view === "watch" && <Watchlist watchlist={watchlist} setWatchlist={setWatchlist} />}
      {view === "trade" && <TradeTracker trades={trades} setTrades={setTrades} />}
      {view === "more" && (
        <Settings
          catalog={catalog} setCatalog={setCatalog}
          sales={sales} setSales={setSales}
          trades={trades} setTrades={setTrades}
          watchlist={watchlist} setWatchlist={setWatchlist}
          gradings={gradings} setGradings={setGradings}
          userName={userName} setUserName={setUserName}
          shipFrom={shipFrom} setShipFrom={setShipFrom}
        />
      )}

      {/* Navigation Bar */}
      <div className="nav-bar">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setView(t.v)} className="nav-btn" style={{ color: view === t.v ? "var(--acc)" : "var(--dim)" }}>
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
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
