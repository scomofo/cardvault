import { useEffect, useState } from "react";
import { dashboardAPI, automationAPI } from "../lib/api";
import { fmtShort } from "../lib/utils";
import { Skeleton, Spinner, IconZap } from "./Icons";

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

export default function DashboardView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRunning, setAutoRunning] = useState({});
  const [autoResults, setAutoResults] = useState({});

  const runAutomation = async (key, fn) => {
    setAutoRunning((p) => ({ ...p, [key]: true }));
    try {
      const result = await fn();
      setAutoResults((p) => ({ ...p, [key]: result }));
    } catch (e) {
      setAutoResults((p) => ({ ...p, [key]: { error: e.message } }));
    } finally {
      setAutoRunning((p) => ({ ...p, [key]: false }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    dashboardAPI
      .get()
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

  return (
    <div className="fade">
      <h1 className="page-title">Dashboard</h1>

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

      <div className="card mb-12">
        <div className="lbl">Action Queue</div>
        {actionQueue.length === 0 ? (
          <div className="text-xs text-dim mt-6">No queued actions yet</div>
        ) : (
          actionQueue.slice(0, 8).map((entry) => (
            <div key={`${entry.subjectType}-${entry.subjectId}-${entry.queue}`} className="flex justify-between items-center mt-8">
              <div>
                <div className="text-xs fw-700">{entry.queue.replace(/_/g, " ")}</div>
                <div className="text-xxs text-dim">{entry.reason}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="fw-800">{entry.item}</div>
                <div className="text-xxs text-dim">{entry.priorityScore}</div>
              </div>
            </div>
          ))
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
