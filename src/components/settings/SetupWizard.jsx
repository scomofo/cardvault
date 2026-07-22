import { useCallback, useEffect, useState } from "react";
import { useData } from "../../lib/DataContext";
import { apiPath } from "../../lib/apiBase";
import { shippingProvidersAPI } from "../../lib/api";
import { deriveSetupProgress } from "../../lib/setupState";
import { loadString, saveString } from "../../lib/storage";
import { IconCheck } from "../Icons";
import ApiKeySection from "./ApiKeySection";
import EbayConnectionSection from "./EbayConnectionSection";
import ShippingProviderConnectionsSection from "./ShippingProviderConnectionsSection";

const DISMISS_KEY = "setupGuideDismissed";

const STEP_SECTIONS = {
  ai: ApiKeySection,
  ebay: EbayConnectionSection,
  shipping: ShippingProviderConnectionsSection,
};

export default function SetupWizard() {
  const { useServer } = useData();
  const [dismissed, setDismissed] = useState(() => loadString(DISMISS_KEY, "") === "1");
  const [statuses, setStatuses] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  const refresh = useCallback(async () => {
    const [ai, ebay, shipping] = await Promise.all([
      fetch(apiPath("/ai/status")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(apiPath("/ebay/status")).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      shippingProvidersAPI.connections().catch(() => null),
    ]);
    setStatuses({ ai, ebay, shipping });
  }, []);

  useEffect(() => {
    if (useServer && !dismissed) refresh();
  }, [useServer, dismissed, refresh]);

  if (!useServer || dismissed || !statuses) return null;

  const progress = deriveSetupProgress(statuses);
  if (progress.complete) return null;

  const activeKey = expandedKey || progress.nextKey;

  const dismiss = () => {
    saveString(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="card-hero mb-12">
      <div className="flex justify-between items-center mb-8">
        <div className="lbl" style={{ margin: 0 }}>
          Get Set Up ({progress.steps.length - progress.remaining}/{progress.steps.length})
        </div>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--dim)" }} onClick={dismiss}>
          Skip for now
        </button>
      </div>
      {progress.steps.map((step, index) => {
        const Section = STEP_SECTIONS[step.key];
        const isActive = step.key === activeKey;
        return (
          <div key={step.key} className="mb-8">
            <button
              className="flex items-center gap-8"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%" }}
              onClick={() => setExpandedKey(step.key === expandedKey ? null : step.key)}
            >
              <span
                className={`badge ${step.done ? "badge-grn" : "badge-dim"}`}
                style={{ minWidth: 22, justifyContent: "center" }}
              >
                {step.done ? <IconCheck size={10} /> : index + 1}
              </span>
              <span>
                <span className="text-xs fw-700" style={{ display: "block" }}>{step.title}</span>
                <span className="text-xxs text-dim">{step.description}</span>
              </span>
            </button>
            {isActive && (
              <div className="mt-8">
                <Section onStatusChange={refresh} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
