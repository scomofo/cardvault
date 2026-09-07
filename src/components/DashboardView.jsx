import { useEffect, useState } from "react";
import { dashboardAPI, automationAPI } from "../lib/api";
import { loadDashboardState } from "../lib/dashboardState";
import { navigationTargetForQueue } from "../lib/search/searchNavigation";
import { fmtShort } from "../lib/utils";
import { Skeleton, Spinner, IconZap, IconChevron } from "./Icons";
import AlertQueue from "./AlertQueue";
import DecisionFeedbackPanel from "./DecisionFeedbackPanel";
import PricingRecommendationsQueue from "./PricingRecommendationsQueue";
import SetupWizard from "./settings/SetupWizard";

function MiniList({ title, rows, formatter = (value) => value }) {
  return (
    <div className="card">
      <div className="lbl">{title}</div>
      {(rows || []).length === 0 ? (
        <div className="text-xs text-dim mt-6">No data yet</div>
      ) : (
        rows.slice(0, 5).map((row) => (
          <div key={`${title}-${row.label}`} className="flex justify-between items-center mt-8">
            <span className="text-xs">{row.label}</span>
            <span className="fw-800">{formatter(row.value)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function DashboardView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRunning, setAutoRunning] = useState({});
  const [autoResults, setAutoResults] = useState({});
  const refreshDashboard = async () => {
    const result = await loadDashboardState(dashboardAPI);
    setData(result);
    return result;
  };

  const runAutomation = async (key, fn) => {
    setAutoRunning((p) => ({ ...p, [key]: true }));
    try {
      const result = await fn();
      await refreshDashboard().catch(() => {});
      setAutoResults((p) => ({ ...p, [key]: result }));
    } catch (e) {
      setAutoResults((p) => ({ ...p, [key]: { error: e.message } }));
    } finally {
      setAutoRunning((p) => ({ ...p, [key]: false }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadDashboardState(dashboardAPI)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="fade">
        <h1 className="page-title">Dashboard</h1>
        <Skeleton h={120} />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const performance = data?.performance || {};
  const actionQueue = data?.actionQueue || [];
  const nextAction = actionQueue[0];
  const nextActionTarget = nextAction ? navigationTargetForQueue(nextAction.queue, nextAction) : null;

  return (
    <div className="fade">
      <h1 className="page-title">Dashboard</h1>

      <div className="card mb-12">
        <div className="fw-800">Turn a stack of cards into reviewed drafts</div>
        <p className="text-xs text-dim">Capture photos, use existing inventory, or resume an unfinished selling batch.</p>
        <button className="btn btn-primary" onClick={() => onNavigate?.("sell")}>Start / resume selling batch</button>
      </div>
      <SetupWizard />

      {nextAction && (
        <div className="card-hero mb-12" style={{ borderColor: "var(--acc-brd)" }}>
          <div className="flex justify-between items-center">
            <div>
              <div className="lbl" style={{ margin: 0 }}>Next Best Action</div>
              <div className="fw-800 mt-4">{nextAction.item}</div>
              <div className="text-xxs text-dim mt-4">
                {nextAction.queue.replace(/_/g, " ")} — {nextAction.reason}
              </div>
            </div>
            {nextActionTarget.view !== "dashboard" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onNavigate?.(nextActionTarget)}
              >
                {(nextAction.suggestedAction || "open").replace(/_/g, " ")} <IconChevron size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card-hero mb-12">
        <div className="stat-grid">
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Inventory</div>
            <div className="stat-value gold">{fmtShort(kpis.totalInventoryValue)}</div>
            <div className="stat-sub">{kpis.unlistedInventoryCount || 0} unlisted</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Monthly Profit</div>
            <div className="stat-value text-grn">{fmtShort(kpis.monthlyProfit)}</div>
            <div className="stat-sub">{fmtShort(kpis.monthlySales)} sales</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Ship Now</div>
            <div className="stat-value text-acc">{kpis.ordersToShip || 0}</div>
            <div className="stat-sub">{kpis.ordersAwaitingPayment || 0} awaiting payment</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Stale</div>
            <div className="stat-value text-red">{kpis.staleInventoryCount || 0}</div>
            <div className="stat-sub">{kpis.deadInventoryCount || 0} dead inventory</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Turnover</div>
            <div className="stat-value">{Number(kpis.inventoryTurnoverDays || 0).toFixed(1)}d</div>
            <div className="stat-sub">{fmtShort(kpis.cashTiedUp)} tied up</div>
          </div>
        </div>
      </div>

      <DecisionFeedbackPanel />

      <AlertQueue onRepricingRun={refreshDashboard} />

      <PricingRecommendationsQueue />

      <div className="card mb-12">
        <div className="lbl">Action Queue</div>
        {actionQueue.length === 0 ? (
          <div className="text-xs text-dim mt-6">No queued actions yet</div>
        ) : (
          actionQueue.slice(0, 8).map((entry) => {
            const target = navigationTargetForQueue(entry.queue, entry);
            const clickable = target.view !== "dashboard";
            return (
              <div
                key={`${entry.subjectType}-${entry.subjectId}-${entry.queue}`}
                className="flex justify-between items-center mt-8"
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                style={clickable ? { cursor: "pointer" } : undefined}
                onClick={clickable ? () => onNavigate?.(target) : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.(target); } } : undefined}
              >
                <div>
                  <div className="text-xs fw-700">{entry.queue.replace(/_/g, " ")}</div>
                  <div className="text-xxs text-dim">{entry.reason}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="fw-800">{entry.item}</div>
                  <div className="text-xxs text-dim">{entry.priorityScore}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="form-grid mb-12">
        <MiniList title="Top Profit Players" rows={performance.topProfitPlayers} formatter={fmtShort} />
        <MiniList title="Top Profit Sets" rows={performance.topProfitSets} formatter={fmtShort} />
      </div>

      <div className="form-grid mb-12">
        <MiniList title="Best Marketplaces" rows={performance.bestMarketplaces} formatter={fmtShort} />
        <MiniList title="Worst Marketplaces" rows={performance.worstMarketplaces} formatter={fmtShort} />
      </div>

      <div className="form-grid">
        <MiniList title="Fastest Selling" rows={performance.fastestSellingInventory} formatter={(value) => `${value}d`} />
        <MiniList title="Highest ROI Acquisitions" rows={performance.highestRoiAcquisitions} formatter={(value) => `${Number(value || 0).toFixed(1)}%`} />
      </div>


      <div className="card mb-12">
        <div className="flex justify-between items-center">
          <div className="lbl" style={{ margin: 0 }}>Automation</div>
          <IconZap size={16} style={{ color: "var(--acc)" }} />
        </div>
        <div className="text-xxs text-dim mt-4 mb-8">Run backend automation workflows on your inventory</div>
        <div className="form-grid">
          {[
            { key: "repricing", label: "Aging Repricing", desc: "Reprice stale inventory", fn: () => automationAPI.agingRepricing({}) },
            { key: "duplicates", label: "Find Duplicates", desc: "Detect duplicate cards", fn: () => automationAPI.duplicates() },
            { key: "listings", label: "Generate Listings", desc: "Auto-create listing drafts", fn: () => automationAPI.generateListings({}) },
            { key: "trends", label: "Market Trends", desc: "Analyze price trends", fn: () => automationAPI.marketTrends() },
            { key: "bundles", label: "Bundle Suggestions", desc: "Group items into lots", fn: () => automationAPI.bundles() },
            { key: "grading", label: "Grading ROI", desc: "Find grading candidates", fn: () => automationAPI.grading() },
            { key: "cashflow", label: "Cashflow Analysis", desc: "Inventory turnover & ROI", fn: () => automationAPI.cashflow() },
          ].map(({ key, label, desc, fn }) => (
            <button
              key={key}
              className="card-interactive"
              style={{ padding: "10px 14px", textAlign: "left", border: "1px solid var(--brd)", cursor: "pointer" }}
              onClick={() => runAutomation(key, fn)}
              disabled={autoRunning[key]}
            >
              <div className="flex items-center gap-6">
                {autoRunning[key] ? <Spinner size={12} /> : <IconZap size={12} />}
                <span className="text-xs fw-700">{label}</span>
              </div>
              <div className="text-xxs text-dim mt-4">{desc}</div>
              {autoResults[key] && !autoResults[key].error && (
                <div className="text-xxs mt-4" style={{ color: "var(--grn)" }}>
                  {autoResults[key].summary || autoResults[key].message || (Array.isArray(autoResults[key]) ? autoResults[key].length + " results" : "Done")}
                </div>
              )}
              {autoResults[key]?.error && (
                <div className="text-xxs mt-4" style={{ color: "var(--red)" }}>{autoResults[key].error}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid mt-12">
        <MiniList title="ROI By Source" rows={performance.roiBySource} formatter={(value) => `${Number(value || 0).toFixed(1)}%`} />
        <MiniList title="ROI By Category" rows={performance.roiByCategory} formatter={(value) => `${Number(value || 0).toFixed(1)}%`} />
      </div>
    </div>
  );
}
