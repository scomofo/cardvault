import { useState, useEffect } from "react";
import { useToast } from "./Toast";
import { PLATFORMS } from "../lib/constants";
import { useFeeModels } from "../hooks/useFeeModels";
import { condOf, fmtShort, uid } from "../lib/utils";
import { decisionsAPI, automationAPI, itemsAPI, salesAPI, ordersAPI, listingsAPI } from "../lib/api";
import { calculateGrade, gradeToTerm, generateConditionReport } from "../lib/grading";
import PriceChart from "./PriceChart";
import { aiGradePredict } from "../lib/ai";
import { IconBack, IconTrash, IconCheck, IconSearch, IconPlus, IconZap, IconShield, IconCopy, Spinner, Skeleton } from "./Icons";
import ProfitWarning from "./ProfitWarning";
import SoldComps from "./SoldComps";

export default function CardDetail({ detail, detailFrontImg, detailBackImg, catalog, setCatalog, sales, setSales, listings, setListings, setOrders, useServer, onBack }) {
  const toast = useToast();
  const { getFeeRate } = useFeeModels();
  const [gradePred, setGradePred] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [salePlatform, setSalePlatform] = useState("ebay");
  const [saleFees, setSaleFees] = useState("");
  const [saleShipping, setSaleShipping] = useState("");
  const [showQuickList, setShowQuickList] = useState(false);
  const [quickListPlatform, setQuickListPlatform] = useState("ebay");
  const [quickListPrice, setQuickListPrice] = useState("");
  const [quickListFormat, setQuickListFormat] = useState("fixed");
  const [decisions, setDecisions] = useState([]);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [autoIdPricing, setAutoIdPricing] = useState(false);
  const [autoIdResult, setAutoIdResult] = useState(null);
  const [autoGrading, setAutoGrading] = useState(null);
  const [autoDuplicates, setAutoDuplicates] = useState(null);
  const isListed = detail?.status === "listed" || (detail?.listedOn || []).length > 0;

  useEffect(() => {
    let cancelled = false;
    if (!detail?.id) {
      setDecisions([]);
      return undefined;
    }

    setDecisionLoading(true);
    decisionsAPI
      .evaluate({ subjectType: "inventory_item", subjectId: detail.id, persist: false })
      .then((result) => {
        if (!cancelled) setDecisions(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) setDecisions([]);
      })
      .finally(() => {
        if (!cancelled) setDecisionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.id, detail?.status, (detail?.listedOn || []).join("|")]);
  const toggleListed = (id, platform) => {
    setCatalog((p) => p.map((c) => {
      if (c.id !== id) return c;
      const lo = c.listedOn || [];
      const newLo = lo.includes(platform) ? lo.filter((x) => x !== platform) : [...lo, platform];
      return { ...c, listedOn: newLo, status: newLo.length > 0 ? "listed" : "inventory" };
    }));
  };

  const markSold = async (id) => {
    if (!salePrice) { toast.error("Enter sale price"); return; }
    const c = catalog.find((x) => x.id === id);
    if (!c) return;
    const price = parseFloat(salePrice);
    const fees = parseFloat(saleFees) || 0;
    const shippingCost = parseFloat(saleShipping) || 0;
    const costBasis = parseFloat(c.costBasis) || 0;
    const sale = {
      id: uid(), cardId: id, cardName: c.name, set: c.set,
      salePrice: price, costBasis,
      platform: salePlatform, fees, shippingCost,
      netProfit: price - costBasis - fees - shippingCost,
      date: new Date().toISOString(),
    };
    const updatedCard = { ...c, status: "sold", soldPrice: salePrice, soldPlatform: salePlatform };
    // Mirrors SalesFlow.completeSale: a sale without an order can never show
    // up under Orders for shipping/tracking, so create both together.
    const order = {
      id: uid(), saleId: sale.id, listingId: null, itemId: id,
      cardName: c.name, platform: salePlatform, salePrice: price,
      fees, shippingCharge: shippingCost, paymentStatus: "paid",
      fulfillmentStatus: "pending", soldAt: sale.date,
    };

    if (useServer) {
      try {
        await itemsAPI.create(updatedCard);
        await salesAPI.create(sale);
        await ordersAPI.create(order);
      } catch (error) {
        toast.error(`Mark sold failed: ${error.message}`);
        return;
      }
    }

    setSales((p) => [sale, ...p]);
    setOrders((p) => [order, ...p]);
    setCatalog((p) => p.map((x) => (x.id === id ? updatedCard : x)));
    toast.success("Marked as sold");
    setSalePrice(""); setSaleFees(""); setSaleShipping("");
  };

  const quickList = async (id) => {
    if (!quickListPrice) { toast.error("Enter a price"); return; }
    const c = catalog.find((x) => x.id === id);
    if (!c) return;
    const listing = {
      id: uid(), cardId: id, cardName: c.name, set: c.set, number: c.number,
      platform: quickListPlatform, format: quickListFormat,
      startPrice: parseFloat(quickListPrice),
      buyNowPrice: null, auctionEndDate: null,
      shipping: 4.99, currentBid: null,
      status: "active", notes: "", createdAt: new Date().toISOString(),
    };
    const updatedCard = { ...c, status: "listed", listedOn: [...(c.listedOn || []), quickListPlatform] };

    if (useServer) {
      // Persist explicitly, same ordering as SalesFlow.createListing —
      // listings POST 404s on a missing card_id, so the item must land
      // first rather than racing the debounced sync engine.
      await itemsAPI
        .create(updatedCard)
        .then(() => listingsAPI.create(listing))
        .catch(() => {});
    }

    setListings((p) => [listing, ...p]);
    setCatalog((p) => p.map((x) => x.id === id ? updatedCard : x));
    setDecisions((current) => current.filter((decision) => decision.decisionType !== "listing_readiness"));
    setShowQuickList(false);
    setQuickListPrice("");
    toast.success(`Listed ${c.name} on ${quickListPlatform} for ${fmtShort(quickListPrice)}`);
  };

  const doDelete = async () => {
    if (!window.confirm("Delete this card?")) return;
    await onBack(detail.id);
  };


  const runAutoIdentifyPrice = async (id) => {
    setAutoIdPricing(true);
    setAutoIdResult(null);
    try {
      const result = await automationAPI.identifyAndPrice(id, {});
      setAutoIdResult(result);
      toast.success("Auto identify + price complete");
    } catch (e) {
      toast.error("Auto ID failed: " + e.message);
    } finally {
      setAutoIdPricing(false);
    }
  };

  const runAutoGrading = async (id) => {
    try {
      const result = await automationAPI.grading({ itemId: id });
      setAutoGrading(result);
    } catch (e) {
      toast.error("Grading analysis failed: " + e.message);
    }
  };

  const runAutoDuplicates = async (id) => {
    try {
      const result = await automationAPI.duplicates({ itemId: id });
      setAutoDuplicates(result);
    } catch (e) {
      toast.error("Duplicate check failed: " + e.message);
    }
  };

  const doPredictGrade = async () => {
    if (!detailFrontImg) return;
    setPredicting(true); setGradePred(null);
    const r = await aiGradePredict(detailFrontImg);
    if (r) setGradePred(r); else toast.error("Grade prediction failed");
    setPredicting(false);
  };

  const quickListFeeRate = getFeeRate(quickListPlatform);

  return (
      <div className="slide-up">
        <button className="btn btn-ghost btn-sm mb-10" onClick={() => onBack(null)}>
          <IconBack size={14} /> Back
        </button>

        {detailFrontImg && (
          <div className="flex gap-10 justify-center mb-10">
            <img src={detailFrontImg} alt={`Front of ${detail.name}`} className="img-preview" style={{ height: 200, boxShadow: "var(--shadow-lg)" }} />
            {detailBackImg && <img src={detailBackImg} alt={`Back of ${detail.name}`} className="img-preview" style={{ height: 200, boxShadow: "var(--shadow-lg)" }} />}
          </div>
        )}

        <h2 className="gold text-center" style={{ fontSize: 24, fontWeight: 900, margin: "8px 0" }}>{detail.name}</h2>
        <div className="text-center text-sm text-dim mb-12">{[detail.set, detail.year, detail.number && `#${detail.number}`].filter(Boolean).join(" \u00b7 ")}</div>

        <div className="card-hero mb-10">
          <div className="stat-grid">
            <div className="stat-item">
              <div className="lbl">Condition</div>
              <span style={{ color: condOf(detail.condition).c, fontWeight: 700, fontSize: 15 }}>{condOf(detail.condition).l}</span>
            </div>
            <div className="stat-item">
              <div className="lbl">Value</div>
              <span className="gold stat-value">{fmtShort(detail.priceEstimate?.mid)}</span>
            </div>
            <div className="stat-item">
              <div className="lbl">Status</div>
              <span className={`badge ${detail.status === "sold" ? "badge-grn" : detail.status === "listed" ? "badge-acc" : "badge-dim"}`}>
                {detail.status || "inventory"}{detail.listedOn?.length > 0 && ` (${detail.listedOn.join(", ")})`}
              </span>
            </div>
            <div className="stat-item">
              <div className="lbl">Cost</div>
              <span style={{ fontSize: 15 }}>{detail.costBasis ? fmtShort(detail.costBasis) : "\u2014"}</span>
            </div>
          </div>
        </div>

        {detail.priceHistory?.length > 1 && <div className="card mb-10"><PriceChart data={detail.priceHistory} /></div>}

        <div className="card mb-10">
          <div className="flex justify-between items-center">
            <div className="lbl" style={{ margin: 0 }}>Decision Engine</div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDecisionLoading(true);
                decisionsAPI.evaluate({ subjectType: "inventory_item", subjectId: detail.id, persist: false })
                  .then((result) => setDecisions(Array.isArray(result) ? result : []))
                  .catch(() => toast.error("Decision refresh failed"))
                  .finally(() => setDecisionLoading(false));
              }}
            >
              <IconZap size={12} /> Refresh
            </button>
          </div>
          {decisionLoading ? (
            <div className="mt-8"><Skeleton h={52} /></div>
          ) : decisions.length === 0 ? (
            <div className="text-xs text-dim mt-8">No recommendations yet.</div>
          ) : (
            <div className="mt-8">
              {decisions
                .filter((decision) => !(isListed && decision.decisionType === "listing_readiness"))
                .slice(0, 4)
                .map((decision) => (
                <div key={`${decision.decisionType}-${decision.recommendation}`} className="card mb-6" style={{ padding: 10 }}>
                  <div className="flex justify-between items-center gap-8">
                    <strong className="text-xs" style={{ textTransform: "capitalize" }}>
                      {decision.recommendation.replace(/_/g, " ")}
                    </strong>
                    <span className="badge badge-acc">{Math.round((decision.confidence || 0) * 100)}%</span>
                  </div>
                  <div className="text-xxs text-dim mt-4">{decision.explanation}</div>
                  {decision.suggestedAction?.type && (
                    <div className="text-xxs fw-700 mt-4" style={{ color: "var(--acc)" }}>
                      Next: {decision.suggestedAction.type.replace(/_/g, " ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card mb-10">
          <div className="flex justify-between items-center">
            <div className="lbl" style={{ margin: 0 }}>Listed On</div>
            {detail.status !== "sold" && (
              <button className="btn btn-primary btn-sm" onClick={() => { setShowQuickList(!showQuickList); setQuickListPrice(detail.priceEstimate?.mid ? String(detail.priceEstimate.mid) : ""); }}>
                <IconPlus size={12} /> Quick List
              </button>
            )}
          </div>
          <div className="chip-row mt-6">
            {PLATFORMS.map((p) => (
              <button key={p.v} onClick={() => toggleListed(detail.id, p.v)}
                className={`chip ${(detail.listedOn || []).includes(p.v) ? "active" : ""}`}>
                {p.l}{(detail.listedOn || []).includes(p.v) ? " \u2713" : ""}
              </button>
            ))}
          </div>

          {/* Quick List form */}
          {showQuickList && detail.status !== "sold" && (
            <div className="fade mt-10" style={{ padding: 12, background: "var(--acc-bg)", borderRadius: "var(--radius)", border: "1px solid var(--acc-brd)" }}>
              <div className="form-grid mt-4">
                <label className="fld">
                  <span className="text-xxs text-dim">Platform</span>
                  <select className="inp" value={quickListPlatform} onChange={(e) => setQuickListPlatform(e.target.value)}>
                    {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </label>
                <label className="fld">
                  <span className="text-xxs text-dim">Price (CAD)</span>
                  <input className="inp fw-700" type="number" step="0.01" value={quickListPrice} onChange={(e) => setQuickListPrice(e.target.value)} autoFocus />
                </label>
              </div>
              {quickListPrice && (
                <div className="text-xxs text-dim mt-6">
                  Fees: {fmtShort(parseFloat(quickListPrice) * quickListFeeRate)} ({(quickListFeeRate * 100).toFixed(1)}%)
                  {" "}&middot; Net: {fmtShort(parseFloat(quickListPrice) - parseFloat(quickListPrice) * quickListFeeRate - 4.99 - (parseFloat(detail.costBasis) || 0))}
                </div>
              )}
              <SoldComps comps={autoIdResult?.pricing?.recommendations} />
              <ProfitWarning price={parseFloat(quickListPrice)} costBasis={parseFloat(detail.costBasis) || 0} feeRate={quickListFeeRate} shipping={4.99} />
              <div className="flex gap-8 mt-8">
                <button className="btn btn-primary btn-sm flex-1" onClick={() => quickList(detail.id)}>
                  <IconCheck size={12} /> Create Listing
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowQuickList(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {detail.frontImgId && (
          <div className="card mb-10">
            <div className="lbl">AI Grade Predictor</div>
            <button className="btn btn-primary btn-sm mt-6" onClick={doPredictGrade} disabled={predicting}>
              {predicting ? <Spinner size={14} /> : <IconShield size={14} />} Predict PSA Grade
            </button>
            {gradePred && (() => {
              const scores = {
                centering: parseFloat(gradePred.centering?.score) || 0,
                corners: parseFloat(gradePred.corners?.score) || 0,
                edges: parseFloat(gradePred.edges?.score) || 0,
                surface: parseFloat(gradePred.surface?.score) || 0,
              };
              const calc = calculateGrade(scores);
              const term = calc ? gradeToTerm(calc.final) : null;
              return (
                <div className="fade mt-10">
                  <div className="flex items-center gap-10 flex-wrap">
                    <span className="gold" style={{ fontSize: 32, fontWeight: 900 }}>PSA {gradePred.predictedGrade}</span>
                    <span className={`badge ${gradePred.confidence === "high" ? "badge-grn" : "badge-acc"}`}>{gradePred.confidence}</span>
                  </div>

                  {calc && (
                    <div className="glass mt-10" style={{ padding: 14, borderRadius: "var(--radius)" }}>
                      <div className="lbl mb-8">Calculated Grades</div>
                      <div className="form-grid-3">
                        {[["Floor", calc.floor], ["Weighted", calc.weighted], ["Final", calc.final]].map(([label, val]) => (
                          <div key={label} className="stat-item">
                            <div className="text-xxs text-dim">{label}</div>
                            <div style={{ fontSize: label === "Final" ? 22 : 20, fontWeight: label === "Final" ? 900 : 800, color: gradeToTerm(val).color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {term && (
                        <div className="text-center mt-8">
                          <span className="fw-700" style={{ fontSize: 14, color: term.color }}>{term.term}</span>
                          <span className="text-xxs text-dim" style={{ marginLeft: 8 }}>{term.action}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-grid mt-10">
                    {["centering", "corners", "edges", "surface"].map((k) => gradePred[k] && (
                      <div key={k} className="card" style={{ padding: 10 }}>
                        <div className="flex justify-between items-center">
                          <span className="text-xs fw-700" style={{ textTransform: "capitalize" }}>{k}</span>
                          <span className="fw-800" style={{ fontSize: 16, color: gradeToTerm(parseFloat(gradePred[k].score) || 0).color }}>{gradePred[k].score}</span>
                        </div>
                        <div className="text-xxs text-dim mt-4">{gradePred[k].notes}</div>
                        <div className="text-xxs text-dim mt-4">Weight: {k === "corners" || k === "surface" ? "30%" : "20%"}</div>
                      </div>
                    ))}
                  </div>
                  {gradePred.recommendation && <div className="text-sm text-acc fw-600 mt-10">{gradePred.recommendation}</div>}
                  {calc && (
                    <button className="btn btn-outline btn-sm btn-full mt-10" onClick={async () => {
                      const report = generateConditionReport(scores);
                      try { await navigator.clipboard.writeText(report); toast.success("Condition report copied"); }
                      catch { toast.error("Copy failed"); }
                    }}><IconCopy size={12} /> Copy eBay Condition Report</button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="card mb-10">
          <div className="lbl">Automation</div>
          <div className="form-grid-3 mt-6">
            <button className="btn btn-outline btn-sm" onClick={() => runAutoIdentifyPrice(detail.id)} disabled={autoIdPricing}>
              {autoIdPricing ? <Spinner size={12} /> : <IconZap size={12} />} ID + Price
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => runAutoGrading(detail.id)}>
              <IconShield size={12} /> Grading ROI
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => runAutoDuplicates(detail.id)}>
              <IconSearch size={12} /> Duplicates
            </button>
          </div>
          {autoIdResult && (
            <div className="fade mt-8">
              <div className="text-xs fw-700">ID Result: <span style={{ color: "var(--acc)" }}>{autoIdResult.identification?.result?.recommendation?.replace(/_/g, " ") || "complete"}</span></div>
              {autoIdResult.pricing?.recommendations?.[0] && (
                <div className="text-xs mt-4">Suggested: <span className="gold fw-700">{fmtShort(autoIdResult.pricing.recommendations[0].price)}</span> ({autoIdResult.pricing.recommendations[0].strategy})</div>
              )}
            </div>
          )}
          {autoGrading && (
            <div className="fade mt-8">
              {Array.isArray(autoGrading) && autoGrading.length > 0 ? (
                <div className="text-xs">
                  <span className="fw-700">{autoGrading[0].recommendation?.replace(/_/g, " ")}</span>
                  {autoGrading[0].estimatedRoi != null && <span className="text-dim"> — ROI: {Number(autoGrading[0].estimatedRoi).toFixed(0)}%</span>}
                </div>
              ) : (
                <div className="text-xs text-dim">No grading recommendation</div>
              )}
            </div>
          )}
          {autoDuplicates && (
            <div className="fade mt-8">
              {Array.isArray(autoDuplicates) && autoDuplicates.length > 0 ? (
                <div className="text-xs">{autoDuplicates.length} duplicate group(s) found — <span className="text-acc fw-700">{autoDuplicates[0].suggestedAction?.replace(/_/g, " ")}</span></div>
              ) : (
                <div className="text-xs text-dim">No duplicates found</div>
              )}
            </div>
          )}
        </div>

        {detail.status !== "sold" ? (
          <div className="card mb-10">
            <div className="lbl">Mark as Sold</div>
            <div className="form-grid mt-6">
              <input className="inp" type="number" step="0.01" placeholder="Sale price CAD" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              <select className="inp" value={salePlatform} onChange={(e) => setSalePlatform(e.target.value)}>
                {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <input className="inp" type="number" step="0.01" placeholder="Fees $" value={saleFees} onChange={(e) => setSaleFees(e.target.value)} />
              <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={saleShipping} onChange={(e) => setSaleShipping(e.target.value)} />
            </div>
            <button className="btn btn-success btn-sm mt-8" onClick={() => markSold(detail.id)}>
              <IconCheck size={14} /> Mark Sold
            </button>
          </div>
        ) : (
          <div className="card mb-10" style={{ borderColor: "var(--grn-brd)" }}>
            <span className="badge badge-grn" style={{ fontSize: 14, padding: "6px 14px" }}>
              <IconCheck size={14} /> SOLD{detail.soldPlatform ? ` on ${detail.soldPlatform}` : ""}{detail.soldPrice ? ` for ${fmtShort(detail.soldPrice)} CAD` : ""}
            </span>
          </div>
        )}

        <button className="btn btn-danger btn-sm" onClick={doDelete}><IconTrash size={14} /> Delete Card</button>
      </div>
  );
}
