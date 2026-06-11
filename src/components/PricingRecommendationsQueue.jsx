import { useEffect, useMemo, useState } from "react";
import { pricingRecommendationsAPI } from "../lib/api";
import { useData } from "../lib/DataContext";
import { IconCheck, IconDollar, IconX, Spinner } from "./Icons";

const STRATEGY_LABELS = {
  quick_sale: "Quick Sale",
  market: "Market",
  premium: "Premium",
};

const CONFIDENCE_BADGES = {
  high: "badge-grn",
  medium: "badge-acc",
  low: "badge-dim",
};

function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDollars(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function groupByItem(recommendations) {
  return recommendations.reduce((groups, rec) => {
    const key = rec.itemId || rec.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
    return groups;
  }, new Map());
}

export default function PricingRecommendationsQueue() {
  const dataContext = useData();
  const useServer = Boolean(dataContext?.useServer);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState({});
  const [applied, setApplied] = useState({});

  useEffect(() => {
    if (!useServer) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    pricingRecommendationsAPI
      .list()
      .then((rows) => {
        if (!cancelled) {
          setRecommendations(Array.isArray(rows) ? rows : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [useServer]);

  const groupedRecommendations = useMemo(
    () => Array.from(groupByItem(recommendations).entries()),
    [recommendations],
  );

  const setPendingFor = (id, value) => {
    setPending((current) => ({ ...current, [id]: value }));
  };

  const handleApply = async (rec) => {
    setPendingFor(rec.id, "apply");
    setError("");
    try {
      await pricingRecommendationsAPI.apply(rec.id);
      setApplied((current) => ({ ...current, [rec.id]: true }));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingFor(rec.id, "");
    }
  };

  const handleDismiss = async (rec) => {
    setPendingFor(rec.id, "dismiss");
    setError("");
    try {
      await pricingRecommendationsAPI.dismiss(rec.id);
      setRecommendations((current) => current.filter((entry) => entry.id !== rec.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingFor(rec.id, "");
    }
  };

  if (!useServer) return null;
  if (loading) {
    return (
      <div className="card mb-12">
        <div className="flex items-center gap-8">
          <Spinner size={14} />
          <div className="lbl" style={{ margin: 0 }}>Pricing Recommendations</div>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0 && !error) return null;

  return (
    <div className="card mb-12">
      <div className="flex justify-between items-center gap-10 flex-wrap">
        <div>
          <div className="lbl" style={{ margin: 0 }}>Pricing Recommendations</div>
          <div className="text-xxs text-dim mt-4">Review current repricing suggestions</div>
        </div>
        <span className="badge badge-blue">{recommendations.length} open</span>
      </div>

      {error && (
        <div className="text-xs mt-10" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}

      {groupedRecommendations.map(([itemId, recs]) => {
        const item = recs[0] || {};
        return (
          <div
            key={itemId}
            style={{
              borderTop: "1px solid var(--brd)",
              marginTop: 12,
              paddingTop: 12,
            }}
          >
            <div className="flex justify-between gap-10 flex-wrap">
              <div style={{ minWidth: 0, flex: "1 1 210px" }}>
                <div className="text-sm fw-800 truncate">{item.itemName || "Unknown item"}</div>
                <div className="text-xxs text-dim mt-4">
                  {[item.itemSet, item.condition && titleCase(item.condition)]
                    .filter(Boolean)
                    .join(" | ")}
                </div>
              </div>
              <div className="text-xxs text-dim" style={{ textAlign: "right" }}>
                <div>Current</div>
                <div className="fw-800 text-sm" style={{ color: "var(--tx)" }}>
                  {formatDollars(item.suggestedListingPrice)}
                </div>
              </div>
            </div>

            {recs.map((rec) => {
              const isPending = Boolean(pending[rec.id]);
              const isApplied = Boolean(applied[rec.id]);
              const confidenceClass = CONFIDENCE_BADGES[rec.confidence] || "badge-dim";
              const label = `${STRATEGY_LABELS[rec.strategy] || titleCase(rec.strategy)} recommendation`;

              return (
                <div
                  key={rec.id}
                  className="mt-10 flex items-center gap-10 flex-wrap"
                  style={{
                    alignItems: "stretch",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid var(--brd)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 10px",
                      minHeight: 64,
                      flex: "0 1 128px",
                    }}
                  >
                    <div className="flex items-center gap-6 text-xs fw-800">
                      <IconDollar size={13} />
                      {formatCents(rec.recommendedPriceCents)}
                    </div>
                    <div className="text-xxs text-dim mt-4">
                      Floor {formatCents(rec.minimumAcceptablePriceCents)}
                    </div>
                  </div>

                  <div style={{ minWidth: 160, flex: "1 1 220px" }}>
                    <div className="flex items-center gap-6 flex-wrap">
                      <span className="badge badge-purple">
                        {STRATEGY_LABELS[rec.strategy] || titleCase(rec.strategy)}
                      </span>
                      <span className={`badge ${confidenceClass}`}>
                        {titleCase(rec.confidence || "unknown")}
                      </span>
                      {isApplied && <span className="badge badge-grn">Applied</span>}
                    </div>
                    {rec.explanation && (
                      <div className="text-xxs text-dim mt-6">{rec.explanation}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-6" style={{ marginLeft: "auto" }}>
                    <button
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={() => handleApply(rec)}
                      disabled={isPending || isApplied}
                    >
                      {pending[rec.id] === "apply" ? <Spinner size={12} color="#0e1117" /> : <IconCheck size={13} />}
                      {isApplied ? "Applied" : "Apply"}
                    </button>
                    <button
                      aria-label={`Dismiss ${label}`}
                      className="btn btn-sm btn-ghost btn-icon"
                      type="button"
                      onClick={() => handleDismiss(rec)}
                      disabled={isPending}
                      title={`Dismiss ${label}`}
                    >
                      {pending[rec.id] === "dismiss" ? <Spinner size={12} /> : <IconX size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
