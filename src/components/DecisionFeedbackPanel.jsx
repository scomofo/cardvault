import { useEffect, useState } from "react";
import { decisionsAPI } from "../lib/api";
import { useToast } from "./Toast";
import { Skeleton, Spinner } from "./Icons";

function formatDecisionType(type) {
  return type.replace(/_decision$/, "").replace(/_/g, " ");
}

function confidenceLabel(pct) {
  if (pct >= 0.8) return "high";
  if (pct >= 0.6) return "med";
  return "low";
}

export default function DecisionFeedbackPanel() {
  const toast = useToast();
  const [decisions, setDecisions] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [pending, setPending] = useState({});

  async function refresh() {
    try {
      const [openRows, cal] = await Promise.all([
        decisionsAPI.list({ status: "open" }),
        decisionsAPI.calibration().catch(() => null),
      ]);
      setDecisions(Array.isArray(openRows) ? openRows : []);
      setCalibration(cal);
    } catch (error) {
      toast.error("Failed to load decisions: " + error.message);
      setDecisions([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function submit(decision, payload, successLabel) {
    setPending((prev) => ({ ...prev, [decision.id]: true }));
    try {
      await decisionsAPI.feedback(decision.id, payload);
      setDecisions((prev) => (prev || []).filter((d) => d.id !== decision.id));
      toast.success(`Decision ${successLabel}`);
    } catch (error) {
      toast.error("Feedback failed: " + error.message);
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[decision.id];
        return next;
      });
    }
  }

  if (decisions === null) {
    return (
      <div className="card mb-12">
        <div className="lbl">Pending Decisions</div>
        <Skeleton h={80} />
      </div>
    );
  }

  return (
    <div className="card mb-12">
      <div className="flex justify-between items-center">
        <div className="lbl" style={{ margin: 0 }}>Pending Decisions</div>
        <button
          className="btn btn-outline btn-sm"
          onClick={refresh}
          style={{ fontSize: 11 }}
        >
          Refresh
        </button>
      </div>

      {calibration && Object.keys(calibration).length > 0 && (
        <div className="text-xxs text-dim mt-4" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(calibration)
            .filter(([, v]) => v && v.sampleSize > 0)
            .map(([type, v]) => (
              <span key={type}>
                {formatDecisionType(type)}: {v.confidence != null ? `${(v.confidence * 100).toFixed(0)}% (n=${v.sampleSize})` : `learning (n=${v.sampleSize})`}
              </span>
            ))}
          {Object.values(calibration).every((v) => !v || v.sampleSize === 0) && (
            <span>No feedback collected yet — accept/override decisions to train calibration.</span>
          )}
        </div>
      )}

      {decisions.length === 0 ? (
        <div className="text-xs text-dim mt-6">No open decisions.</div>
      ) : (
        decisions.slice(0, 10).map((decision) => {
          const confidencePct = Number(decision.confidence || 0);
          const busy = !!pending[decision.id];
          return (
            <div
              key={decision.id}
              className="mt-8"
              style={{ padding: 10, border: "1px solid var(--brd)", borderRadius: 6 }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs fw-700">
                    {formatDecisionType(decision.decision_type)} → {decision.recommendation}
                  </div>
                  <div className="text-xxs text-dim mt-2">
                    {decision.subject_type} · confidence {(confidencePct * 100).toFixed(0)}% ({confidenceLabel(confidencePct)})
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => submit(decision, { accepted: true, userResponse: "accepted" }, "accepted")}
                    style={{ background: "var(--grn)", color: "var(--bg)", fontSize: 11 }}
                  >
                    {busy ? <Spinner size={10} /> : "Accept"}
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt("Override reason? (optional)") || "";
                      submit(
                        decision,
                        { overridden: true, userResponse: "overridden", overrideReason: reason },
                        "overridden",
                      );
                    }}
                    style={{ fontSize: 11 }}
                  >
                    Override
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={busy}
                    onClick={() => submit(decision, { userResponse: "dismissed" }, "dismissed")}
                    style={{ fontSize: 11, borderColor: "var(--red)", color: "var(--red)" }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              {decision.explanation && (
                <div className="text-xxs text-dim mt-6">{decision.explanation}</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
