import { useState, useEffect, useCallback } from "react";
import { alertsAPI, automationAPI } from "../lib/api";
import { fmtShort } from "../lib/utils";
import { Spinner } from "./Icons";

const ALERT_LABELS = {
  repricing: "Repricing needed",
  dead_inventory: "Dead inventory",
  price_drop_suggestion: "Price drop",
  price_trend_up: "Price trending up",
  liquidate: "Liquidate",
  bundle_or_clearance: "Bundle / clearance",
  review: "Review",
};

const SEVERITY_STYLE = {
  high: { cls: "badge-red", color: "var(--red-brd)" },
  medium: { cls: "badge-acc", color: "var(--acc-brd)" },
  low: { cls: "badge-dim", color: undefined },
};

const ACTION_DESC = {
  mark_clearance: "Price clearance",
  bundle_suggestion: "Bundle with similar cards",
  auction_conversion_suggestion: "Switch to auction",
  price_drop_suggestion: "Drop price",
  review_inventory: "Review pricing",
  review_alert: "Review",
};

export default function AlertQueue({ onRepricingRun }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    alertsAPI.list("open")
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id) => {
    await alertsAPI.update(id, { status: "resolved" }).catch(() => {});
    setAlerts((p) => p.filter((a) => a.id !== id));
  };

  const dismissAll = async () => {
    if (!window.confirm("Dismiss all open alerts?")) return;
    await alertsAPI.dismissAll().catch(() => {});
    setAlerts([]);
  };

  const runRepricing = async () => {
    setRunning(true);
    try {
      await automationAPI.agingRepricing({});
      await load();
      onRepricingRun?.();
    } catch { /* ignore */ }
    setRunning(false);
  };

  if (loading) return <div className="card mb-12"><div className="text-xs text-dim mt-6"><Spinner size={12} /></div></div>;

  return (
    <div className="card mb-12">
      <div className="flex justify-between items-center mb-4">
        <div className="lbl" style={{ margin: 0 }}>Repricing Queue</div>
        <div className="flex gap-6 items-center">
          {alerts.length > 0 && (
            <span className="badge badge-acc">{alerts.length}</span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={runRepricing} disabled={running}>
            {running ? <Spinner size={12} /> : "Run repricing"}
          </button>
          {alerts.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--dim)", fontSize: 11 }} onClick={dismissAll}>
              Dismiss all
            </button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-xs text-dim mt-6">No open alerts — run repricing to check for stale inventory.</div>
      ) : (
        alerts.slice(0, 15).map((alert) => {
          const sev = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;
          return (
            <div
              key={alert.id}
              className="flex items-center gap-8 mt-8 pb-8"
              style={{ borderBottom: "1px solid var(--brd)" }}
            >
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-6 mb-2">
                  <span className={`badge ${sev.cls}`} style={{ fontSize: 10 }}>
                    {alert.severity}
                  </span>
                  <span className="text-xs fw-700 truncate">{alert.itemName || alert.itemId}</span>
                </div>
                <div className="text-xxs text-dim truncate">
                  {ALERT_LABELS[alert.alertType] || alert.alertType}
                  {alert.suggestedAction ? ` · ${ACTION_DESC[alert.suggestedAction] || alert.suggestedAction.replace(/_/g, " ")}` : ""}
                </div>
                {alert.explanation && (
                  <div className="text-xxs text-dim mt-2 truncate">{alert.explanation}</div>
                )}
              </div>
              {alert.suggestedListingPrice > 0 && (
                <span className="text-xs fw-700 gold">{fmtShort(alert.suggestedListingPrice)}</span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--dim)", fontSize: 11, padding: "2px 8px" }}
                onClick={() => dismiss(alert.id)}
              >
                Dismiss
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
