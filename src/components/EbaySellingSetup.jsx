import { useEffect, useRef, useState } from "react";
import { ebaySellingAPI } from "../lib/api";
import { sellingSetupComplete } from "../lib/ebayReviewState";

const EMPTY_CONFIG = { fulfillmentPolicyId: "", paymentPolicyId: "", returnPolicyId: "", postalCode: "", sport: "", manufacturer: "" };
const POLICY_FIELDS = [
  ["fulfillmentPolicyId", "fulfillmentPolicies", "Shipping policy"],
  ["paymentPolicyId", "paymentPolicies", "Payment policy"],
  ["returnPolicyId", "returnPolicies", "Return policy"],
];

export default function EbaySellingSetup({ useServer, disabled, onChange, onState }) {
  const [setup, setSetup] = useState(null);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [policies, setPolicies] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const callbacks = useRef({ onChange, onState });
  callbacks.current = { onChange, onState };
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setSetup(null); setBusy(false); setError("");
    if (useServer) {
      setBusy(true);
      ebaySellingAPI.setup().then((result) => {
        if (cancelled) return;
        setSetup(result); setConfig({ ...EMPTY_CONFIG, ...result.config }); setDirty(false); setExpanded(!result.config);
      }).catch((failure) => { if (!cancelled) setError(failure.message); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }
    return () => { cancelled = true; };
  }, [useServer, loadAttempt]);
  useEffect(() => {
    callbacks.current.onState({ connected: Boolean(setup?.connected), environment: setup?.environment,
      ready: !dirty && !busy && sellingSetupComplete(setup?.config), busy });
  }, [setup, dirty, busy]);

  const edit = (field, value) => {
    setConfig((previous) => ({ ...previous, [field]: value })); setDirty(true);
    setMessage(""); setError(""); callbacks.current.onChange();
  };
  const act = async (action) => {
    if (inFlight.current || disabled || !useServer) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); callbacks.current.onChange();
    try {
      if (action === "load") {
        const result = await ebaySellingAPI.policies();
        if (!mounted.current) return;
        setPolicies(result);
        if (result.environment !== setup?.environment) {
          setSetup(null); setDirty(true);
          throw new Error("The eBay environment changed. Close and reopen this review before continuing.");
        }
        setMessage("Loaded your account’s policies. Choose the policies you want and save your defaults.");
      } else {
        const result = await ebaySellingAPI.saveSetup(config);
        if (!mounted.current) return;
        setSetup(result); setConfig({ ...EMPTY_CONFIG, ...result.config }); setDirty(false); setExpanded(false);
        setMessage("Selling defaults saved for future drafts.");
      }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  return <fieldset className="ebay-selling-setup" disabled={disabled || busy || !useServer}>
    <legend>Remembered eBay selling defaults</legend>
    <p className="seller-note">Sports-card singles · CAD · Canada. Shipping charges, handling and returns follow your selected eBay policies. Load policies only when you want to connect to eBay and refresh them.</p>
    {setup && <p className="seller-note">Account: {setup.environment === "sandbox" ? "Sandbox — test listings only" : "Production — real listings"}{!setup.connected ? " · Connect eBay in Settings" : ""}</p>}
    {setup?.config && <p className="seller-note">Saved: ship from {setup.config.postalCode} · {setup.config.sport} · {setup.config.manufacturer}. Your selected policies are checked before approval.</p>}
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>{setup?.config ? "View or change selling defaults" : "Set up your selling defaults"}</summary>
    {!setup && error && <button type="button" className="btn btn-outline" onClick={() => { callbacks.current.onChange(); setLoadAttempt((previous) => previous + 1); }}>Retry loading saved settings</button>}
    <button type="button" className="btn btn-outline" disabled={!setup?.connected} onClick={() => act("load")}>Load my eBay policies</button>
    <div className="form-grid">
      {POLICY_FIELDS.map(([field, collection, label]) => {
        const choices = policies?.[collection] || [];
        const savedNotLoaded = config[field] && !choices.some((policy) => String(policy[field]) === config[field]);
        return <label key={field}>{label}<select className="inp" value={config[field]} onChange={(event) => edit(field, event.target.value)}>
          <option value="">Load policies and choose</option>
          {savedNotLoaded && <option value={config[field]}>Saved policy · {config[field]}</option>}
          {choices.map((policy) => <option key={policy[field]} value={policy[field]}>{policy.name || policy[field]}</option>)}
        </select></label>;
      })}
      <label>Ship-from postal code<input className="inp" autoComplete="postal-code" maxLength={10} value={config.postalCode} onChange={(event) => edit("postalCode", event.target.value)} /></label>
      <label>Default sport<input className="inp" maxLength={100} value={config.sport} placeholder="For example, Ice Hockey" onChange={(event) => edit("sport", event.target.value)} /></label>
      <label>Default manufacturer<input className="inp" maxLength={100} value={config.manufacturer} placeholder="For example, Upper Deck" onChange={(event) => edit("manufacturer", event.target.value)} /></label>
    </div>
    <p className="seller-note">Use sport and manufacturer defaults only when they accurately describe this card.</p>
    <button type="button" className="btn btn-outline" disabled={!sellingSetupComplete(config) || !setup?.connected} onClick={() => act("save")}>Save selling defaults</button>
    </details>
    {dirty && <p className="seller-note">Save these changes before checking the listing.</p>}
    {busy && <p role="status">Loading eBay selling settings…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="text-red" role="alert">{error}</p>}
  </fieldset>;
}
