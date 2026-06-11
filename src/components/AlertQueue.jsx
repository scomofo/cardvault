import { useCallback, useEffect, useState } from "react";
import { alertsAPI, automationAPI } from "../lib/api";
import { useData } from "../lib/DataContext";
import { fmtShort } from "../lib/utils";
import { IconCheck, IconRefresh, Spinner } from "./Icons";

const ALERT_LABELS = {
  repricing: "Repricing needed",
  dead_inventory: "Dead inventory",
  price_drop_suggestion: "Price drop",
  price_trend_up: "Price trending up",
  liquidate: "Liquidate",
  bundle_or_clearance: "Bundle or clearance",
  review: "Review",
};

const ACTION_LABELS = {
  mark_clearance: "Price clearance",
  bundle_suggestion: "Bundle with similar cards",
  auction_conversion_suggestion: "Switch to auction",
  price_drop_suggestion: "Drop price",
  review_inventory: "Review pricing",
  review_alert: "Review",
};

const SEVERITY_BADGES = {
  high: "badge-red",
  medium: "badge-acc",
  low: "badge-dim",
};

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AlertQueue({ onRepricingRun }) {
  const dataContext = useData();
  const useServer = Boolean(dataContext?.useServer);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!useServer) return;
    setLoading(true);
    setError("");
    try {
      const rows = await alertsAPI.list({ status: "open" });
      setAlerts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setAlerts([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [useServer]);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id) => {
    setError("");
    try {
      await alertsAPI.update(id, { status: "resolved" });
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const dismissAll = async () => {
    setError("");
    try {
      await alertsAPI.dismissAll();
      setAlerts([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const runRepricing = async () => {
    setRunning(true);
    setError("");
    try {
      await automationAPI.agingRepricing({});
      await load();
      onRepricingRun?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  if (!useServer) return null;

  return (
    <div className="card mb-12">
      <div className="flex justify-between items-center gap-10 flex-wrap">
        <div>
          <div className="lbl" style={{ margin: 0 }}>Repricing Queue</div>
          <div className="text-xxs text-dim mt-4">Open market alerts from repricing checks</div>
        </div>
        <div className="flex gap-6 items-center flex-wrap">
          {alerts.length > 0 && <span className="badge badge-acc">{alerts.length} open</span>}
          <button className="btn btn-ghost btn-sm" type="button" onClick={runRepricing} disabled={running || loading}>
            {running ? <Spinner size={12} /> : <IconRefresh size={13} />}
            Refresh
          </button>
          {alerts.length > 0 && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={dismissAll}>
              <IconCheck size={13} />
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs mt-10" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-8 text-xs text-dim mt-10">
          <Spinner size={12} />
          Loading alerts
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-xs text-dim mt-10">No open alerts</div>
      ) : (
        alerts.slice(0, 15).map((alert) => {
          const severityClass = SEVERITY_BADGES[alert.severity] || "badge-dim";
          const action = ACTION_LABELS[alert.suggestedAction] || titleCase(alert.suggestedAction);
          return (
            <div
              key={alert.id}
              className="flex items-center gap-8 mt-10"
              style={{ borderTop: "1px solid var(--brd)", paddingTop: 10 }}
            >
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-6 flex-wrap">
                  <span className={`badge ${severityClass}`}>{titleCase(alert.severity)}</span>
                  <span className="text-xs fw-800 truncate">{alert.itemName || alert.itemId}</span>
                </div>
                <div className="text-xxs text-dim mt-4">
                  {ALERT_LABELS[alert.alertType] || titleCase(alert.alertType)}
                  {action ? ` | ${action}` : ""}
                </div>
                {alert.explanation && (
                  <div className="text-xxs text-dim mt-4 truncate">{alert.explanation}</div>
                )}
              </div>
              {Number(alert.suggestedListingPrice) > 0 && (
                <span className="text-xs fw-800 gold">{fmtShort(alert.suggestedListingPrice)}</span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => dismiss(alert.id)}
              >
                <IconCheck size={13} />
                Resolve
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
