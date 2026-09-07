import { useEffect, useRef, useState } from "react";
import { batchPublishAPI } from "../../lib/api";

const labels = { unchecked: "Not checked", checking: "Checking", ready: "Ready for approval", approved: "Approved, not sent", publishing: "Publishing — do not retry", live: "Confirmed listing", rejected: "Needs correction", stale: "Check again", unknown: "Outcome uncertain — review eBay" };
const currency = (value) => `CAD ${Number(value).toFixed(2)}`;

export default function BatchPublishPanel({ listings, useServer, onNavigate }) {
  const [batch, setBatch] = useState(null), [recent, setRecent] = useState([]), [policies, setPolicies] = useState(null);
  const [selectedDrafts, setSelectedDrafts] = useState([]), [selectedRows, setSelectedRows] = useState([]);
  const [config, setConfig] = useState({ postalCode: "", sport: "", manufacturer: "", fulfillmentPolicyId: "", paymentPolicyId: "", returnPolicyId: "" });
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false);
  const running = useRef(false), stop = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => {
    if (!useServer) return;
    let cancelled = false;
    batchPublishAPI.recent().then((rows) => { if (!cancelled) setRecent(rows); }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [useServer]);
  const apply = (next) => {
    if (!mounted.current) return;
    setBatch(next); setConfirmed(false);
    setSelectedRows((ids) => ids.filter((id) => next.rows.some((row) => row.id === id && row.status === "ready")));
  };
  async function task(label, work) {
    if (running.current) return;
    running.current = true; stop.current = false; setBusy(label); setError("");
    try { await work(); }
    catch (err) { if (mounted.current) setError(`${err.message} Refresh the saved results before retrying; a lost response is not proof that nothing happened.`); }
    finally { running.current = false; if (mounted.current) setBusy(""); }
  }
  async function checkDrafts() {
    const next = await batchPublishAPI.create({ listingIds: selectedDrafts, config });
    apply(next);
    const rows = await batchPublishAPI.recent(); if (mounted.current) setRecent(rows);
    for (const row of next.rows) {
      if (stop.current) break;
      apply(await batchPublishAPI.check(next.id, row.id));
    }
  }
  async function process(id) {
    let next = await batchPublishAPI.get(id); apply(next);
    while (!stop.current && next.rows.some((row) => row.status === "approved")) {
      next = await batchPublishAPI.next(id); apply(next);
    }
  }
  const toggle = (setter, id, checked) => setter((ids) => checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id));
  const drafts = listings.filter((listing) => listing.platform === "ebay" && listing.format === "fixed" && ["draft", "ready"].includes(listing.status));
  const ready = batch?.rows.filter((row) => row.status === "ready" && selectedRows.includes(row.id)) || [];
  const approved = batch?.rows.filter((row) => row.status === "approved").length || 0;
  const blocked = Boolean(busy) || !useServer;
  return <details className="card batch-publication">
    <summary><strong>Check and publish saved drafts</strong></summary>
    <p className="batch-help">eBay Canada · raw sports-card singles · fixed price. Checking uploads the two photos and verifies the definition; it does not publish a listing. Publication requires a separate approval.</p>
    {!useServer && <p role="alert">Reconnect to the server and sync your drafts before publishing.</p>}
    <p role="status">{busy || (batch ? `Publication batch saved on the server · ${batch.environment}` : "Choose drafts or resume a saved publication batch")}</p>
    {error && <p role="alert" className="batch-error">{error}</p>}
    <fieldset disabled={blocked} className="batch-fields">
      <div className="batch-toolbar"><button className="btn btn-outline" onClick={() => task("Loading eBay policies…", async () => { const data = await batchPublishAPI.policies(); if (mounted.current) setPolicies(data); })}>Load eBay policies</button>
        <label>Resume saved batch<select className="inp" value={batch?.id || ""} onChange={(event) => { const id = event.target.value; if (id) task("Loading saved results…", async () => { apply(await batchPublishAPI.get(id)); setSelectedRows([]); }); }}><option value="">Choose a batch</option>{recent.map((row) => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString()} · {row.environment} · {row.id.slice(0, 8)}</option>)}</select></label>
      </div>
      {policies && <><h3>New check batch · {policies.environment}</h3><div className="batch-form-grid">
        {[["fulfillmentPolicyId", "fulfillmentPolicies", "Shipping policy"], ["paymentPolicyId", "paymentPolicies", "Payment policy"], ["returnPolicyId", "returnPolicies", "Return policy"]].map(([key, collection, label]) => <label key={key}>{label}<select className="inp" value={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.value }))}><option value="">Choose a saved policy</option>{(policies[collection] || []).map((policy) => <option key={policy[key]} value={policy[key]}>{policy.name} ({policy[key]})</option>)}</select></label>)}
        {[["postalCode", "Ship-from postal code"], ["sport", "Sport for cards with no saved sport"], ["manufacturer", "Manufacturer for cards with no saved manufacturer"]].map(([key, label]) => <label key={key}>{label}<input className="inp" maxLength={120} value={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
      </div><p className="batch-help">Use a domestic single-service flat-rate CAD shipping policy. Its buyer charge must match each draft. Separate mixed sports/manufacturers into groups where the saved cards lack those details.</p>
      <div className="batch-draft-selector">{drafts.map((listing) => <label className="batch-check" key={listing.id}><input type="checkbox" checked={selectedDrafts.includes(listing.id)} onChange={(event) => toggle(setSelectedDrafts, listing.id, event.target.checked)} />{listing.listingTitle || listing.cardName} · {currency(listing.startPrice)} + {currency(listing.shipping)} shipping</label>)}</div>
      <button className="btn btn-primary" disabled={!selectedDrafts.length || selectedDrafts.length > 25 || Object.values(config).some((value) => !value.trim())} onClick={() => task("Checking drafts with eBay…", checkDrafts)}>Check {selectedDrafts.length} selected drafts (maximum 25)</button></>}
    </fieldset>
    {batch && <>
      <div className="batch-toolbar"><strong>{batch.rows.filter((row) => row.status === "live").length} confirmed · {batch.rows.filter((row) => row.status === "ready").length} ready · {batch.rows.filter((row) => ["unknown", "rejected", "stale"].includes(row.status)).length} need attention</strong><button className="btn btn-outline" disabled={blocked} onClick={() => task("Refreshing results…", async () => apply(await batchPublishAPI.get(batch.id)))}>Refresh saved results</button></div>
      <p className="batch-help">Ship from {batch.config.postalCode} · fallback sport: {batch.config.sport} · fallback manufacturer: {batch.config.manufacturer}. Draft and policy changes invalidate approval.</p>
      {batch.rows.map((row) => <article className="card" key={row.id}>
        <div className="batch-toolbar"><label className="batch-check"><input type="checkbox" disabled={blocked || row.status !== "ready"} checked={selectedRows.includes(row.id)} onChange={(event) => { toggle(setSelectedRows, row.id, event.target.checked); setConfirmed(false); }} /><strong>{row.snapshot?.title || listings.find((listing) => listing.id === row.listingId)?.cardName || row.listingId}</strong></label><span className="badge badge-dim">{labels[row.status] || row.status}</span></div>
        {row.snapshot && <><div className="batch-toolbar">{(row.snapshot.pictureUrls || []).map((url, index) => <img key={url} className="batch-photo" src={url} alt={index ? "Checked back photo" : "Checked front photo"} />)}</div><p>{currency(row.snapshot.price)} + {currency(row.snapshot.shipping)} buyer shipping · raw {row.snapshot.condition.replace(/_/g, " ")}</p><details><summary>Exact checked description and policies</summary><p style={{ whiteSpace: "pre-wrap" }}>{row.snapshot.description}</p><p>Shipping: {row.snapshot.policies.fulfillment.name} · payment: {row.snapshot.policies.payment.name} · returns: {row.snapshot.policies.returns.name}</p></details></>}
        {row.result?.fees?.length > 0 && <p className="batch-help">Estimated listing fees: {row.result.fees.filter((fee) => fee.amount !== 0).map((fee) => `${fee.name}: ${fee.currency} ${fee.amount.toFixed(2)}`).join(" · ") || "No non-zero fees returned"}. Excludes sale-dependent fees; may change at publication.</p>}
        {row.result?.messages?.map((message, index) => <p key={index} className="batch-help">{message.severity}: {message.message} ({message.code})</p>)}
        {row.error && <p className="batch-warning">{row.error}</p>}
        {row.externalId && <p>eBay item ID: {row.externalId}</p>}
        <div className="batch-toolbar">{["unchecked", "checking", "ready", "rejected", "stale"].includes(row.status) && <button className="btn btn-outline" disabled={blocked} onClick={() => task("Checking this draft…", async () => apply(await batchPublishAPI.check(batch.id, row.id)))}>Check this draft again</button>}<button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => onNavigate?.({ view: "sales", focus: { type: "listing", id: row.listingId } })}>Open in Sales</button></div>
      </article>)}
      <label className="batch-check"><input type="checkbox" disabled={blocked || !ready.length} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed these {ready.length} selected definitions, photos, prices and business policies. Publish them to eBay {batch.environment}.</label>
      <div className="batch-toolbar"><button className="btn btn-primary" disabled={blocked || !confirmed || !ready.length} onClick={() => task("Publishing approved drafts…", async () => { const id = batch.id; apply(await batchPublishAPI.approve(id, { confirmed: true, environment: batch.environment, rows: ready.map(({ id: rowId, proof }) => ({ id: rowId, proof })) })); await process(id); })}>Approve and publish {ready.length} to {batch.environment}</button>
      {approved > 0 && <><button className="btn btn-outline" disabled={blocked} onClick={() => task("Resuming previously approved drafts…", () => process(batch.id))}>Resume {approved} already approved</button><button className="btn btn-ghost" disabled={blocked} onClick={() => task("Cancelling unprocessed approvals…", async () => apply(await batchPublishAPI.cancel(batch.id)))}>Cancel unprocessed approvals</button></>}
      {busy && <button className="btn btn-outline" onClick={() => { stop.current = true; }}>Pause after current request</button>}</div>
      <p className="batch-help">Closing this screen does not cancel an in-flight request. Refresh saved results, then resume only unprocessed approvals. Uncertain outcomes never retry from this batch; check Seller Hub and use the review controls in Sales.</p>
    </>}
  </details>;
}
