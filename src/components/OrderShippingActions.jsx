import { Spinner } from "./Icons";

export default function OrderShippingActions({ order, busy, onPrepare, onDispatch }) {
  const fulfillment = order.fulfillmentStatus || order.fulfillment_status;
  const payment = order.paymentStatus || order.payment_status;
  const label = order.labelStatus || order.label_status;
  const rawUrl = order.labelUrl || order.label_url;
  let labelUrl = null;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (rawUrl && ["http:", "https:"].includes(parsed.protocol)) labelUrl = parsed.href;
  } catch { /* Unusable provider URL; never execute it. */ }
  if (["shipped", "delivered"].includes(fulfillment)) return null;
  if (payment !== "paid") return <div className="text-xs text-dim mt-8">Awaiting payment — shipping is not available yet.</div>;
  const needsReview = ["failed", "purchase_unknown", "purchasing"].includes(label);
  return (
    <div className="mt-8">
      {order.storageLocation && <div className="text-xs fw-700 mb-8">Pick from: {order.storageLocation}</div>}
      {needsReview && <p className="text-xs text-red">Check the provider’s purchase history before retrying. A timeout may still have resulted in a charge.</p>}
      <div className="flex gap-8 flex-wrap">
        {label === "purchased" && labelUrl && <a className="btn btn-outline btn-sm" href={labelUrl} target="_blank" rel="noopener noreferrer">Open purchased label</a>}
        {label !== "purchased" && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onPrepare(order.id, needsReview)}>{busy ? <Spinner size={12} /> : needsReview ? "Review and retry label" : "Prepare / buy label"}</button>}
        {!needsReview && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onDispatch(order.id)}>Confirm dispatched</button>}
      </div>
      <div className="text-xxs text-dim mt-6">Buying a label does not mark an order shipped. Confirm only after handing the package to the carrier.</div>
    </div>
  );
}
