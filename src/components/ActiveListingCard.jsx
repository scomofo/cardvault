import { PLATFORMS } from "../lib/constants";
import { fmtShort } from "../lib/utils";
import { IconCheck, IconX, Spinner } from "./Icons";
import { PLATFORM_FEES } from "./SalesFlow";
import ProfitWarning from "./ProfitWarning";

export default function ActiveListingCard({ listing: l, catalog, busyListingId, sellingId, sellPrice, setSellPrice, sellTracking, setSellTracking, repricingId, repriceVal, setRepriceVal, onPublish, onSync, onCrosspost, onSell, onStartSell, onReprice, onStartReprice, onEndListing, onCancelSell, onCancelReprice, timeLeft }) {
  const tl = l.format === "auction" ? timeLeft(l.auctionEndDate) : null;
  const isUrgent = tl && !tl.includes("d") && !tl.includes("Ended") && parseInt(tl) < 60;
  const isSelling = sellingId === l.id;
  const isRepricing = repricingId === l.id;
  const feeRate = PLATFORM_FEES[l.platform] || 0;
  const previewNet = sellPrice ? (parseFloat(sellPrice) - (parseFloat(catalog.find((c) => c.id === l.cardId)?.costBasis) || 0) - Math.round(parseFloat(sellPrice) * feeRate * 100) / 100 - (l.shipping || 0)) : null;

  return (
              <div key={l.id} className="card mb-8" style={{ borderColor: isSelling ? "var(--grn-brd)" : isUrgent ? "var(--red-brd)" : tl === "Ended" ? "var(--acc-brd)" : undefined }}>
                <div className="flex justify-between" style={{ alignItems: "start" }}>
                  <div>
                    <strong className="text-sm">{l.cardName}</strong>
                    <div className="text-xxs text-dim">{l.set} {l.number && `#${l.number}`}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="gold fw-800" style={{ fontSize: 18 }}>{fmtShort(l.currentBid || l.startPrice)}</div>
                    <div className="text-xxs text-dim">{PLATFORMS.find((p) => p.v === l.platform)?.l || l.platform}</div>
                  </div>
                </div>

                <div className="flex gap-6 items-center mt-8">
                  <span className={`badge ${l.format === "auction" ? "badge-acc" : "badge-grn"}`}>
                    {l.format === "auction" ? "Auction" : "BIN"}
                  </span>
                  {tl && (
                    <span className={`text-xxs fw-700 ${isUrgent ? "text-red" : tl === "Ended" ? "text-acc" : "text-dim"}`}>
                      {tl === "Ended" ? "Auction ended" : `Ends in ${tl}`}
                    </span>
                  )}
                  {l.publishStatus && (
                    <span className="badge badge-dim">{l.publishStatus}</span>
                  )}
                  {l.priceChanges?.length > 0 && (
                    <span className="text-xxs text-dim">{l.priceChanges.length} reprice{l.priceChanges.length > 1 ? "s" : ""}</span>
                  )}
                  <div className="flex-1" />
                  {!isSelling && !isRepricing && (
                    <>
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => onPublish(l.id, l.platform || "ebay")}>
                        {busyListingId === l.id ? <Spinner size={12} /> : "Publish"}
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => onSync(l.id, l.platform || "ebay")}>
                        Sync
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => onCrosspost(l.id)}>
                        Crosspost
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => onStartSell(l.id)}>
                        <IconCheck size={12} /> Sold
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => onStartReprice(l.id)}>
                        Reprice
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => onEndListing(l.id)}><IconX size={12} /></button>
                    </>
                  )}
                </div>

                {/* Inline sale confirmation */}
                {isSelling && (
                  <div className="fade mt-10" style={{ padding: 12, background: "var(--grn-bg)", borderRadius: "var(--radius)", border: "1px solid var(--grn-brd)" }}>
                    <div className="lbl" style={{ color: "var(--grn)" }}>Confirm Sale</div>
                    <div className="form-grid mt-6">
                      <label className="fld">
                        <span className="text-xxs text-dim">Sale Price (CAD)</span>
                        <input className="inp fw-800" type="number" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} autoFocus style={{ fontSize: 18 }} />
                      </label>
                      <label className="fld">
                        <span className="text-xxs text-dim">Tracking # (optional)</span>
                        <input className="inp" placeholder="CP123456789CA" value={sellTracking} onChange={(e) => setSellTracking(e.target.value)} />
                      </label>
                    </div>
                    {previewNet != null && (
                      <div className="flex justify-between items-center mt-8 text-xs">
                        <span className="text-dim">
                          Fees: {fmtShort(parseFloat(sellPrice) * feeRate)} ({(feeRate * 100).toFixed(1)}%)
                          {" "}&middot; Ship: {fmtShort(l.shipping || 0)}
                        </span>
                        <span className="fw-800" style={{ fontSize: 15, color: previewNet >= 0 ? "var(--grn)" : "var(--red)" }}>
                          Net: {previewNet >= 0 ? "+" : ""}{fmtShort(previewNet)}
                        </span>
                      </div>
                    )}
                    {previewNet != null && previewNet < 0 && <ProfitWarning price={parseFloat(sellPrice)} costBasis={parseFloat(catalog.find((c) => c.id === l.cardId)?.costBasis) || 0} feeRate={feeRate} shipping={l.shipping || 0} />}
                    <div className="flex gap-8 mt-8">
                      <button className="btn btn-success btn-sm flex-1" onClick={() => onSell(l.id, sellPrice, sellTracking)}>
                        <IconCheck size={12} /> Confirm Sale
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={onCancelSell}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Inline reprice */}
                {isRepricing && (
                  <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
                    <div className="lbl">Reprice</div>
                    <div className="flex gap-8 items-center mt-6">
                      <span className="text-xxs text-dim" style={{ textDecoration: "line-through" }}>{fmtShort(l.startPrice)}</span>
                      <span className="text-xs">&rarr;</span>
                      <input className="inp fw-700" type="number" step="0.01" value={repriceVal} onChange={(e) => setRepriceVal(e.target.value)} autoFocus style={{ maxWidth: 120 }} />
                      <button className="btn btn-primary btn-sm" onClick={() => onReprice(l.id)}>Update</button>
                      <ProfitWarning price={parseFloat(repriceVal)} costBasis={parseFloat(catalog.find((c) => c.id === l.cardId)?.costBasis) || 0} feeRate={feeRate} shipping={l.shipping || 0} />
                      <button className="btn btn-ghost btn-sm" onClick={onCancelReprice}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
  );
}