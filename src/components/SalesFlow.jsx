import { useEffect, useState, useMemo } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { PLATFORMS } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { actionQueueAPI, marketplacesAPI } from "../lib/api";
import { requestNotificationPermission, canNotify, sendNotification, scheduleAuctionNotification, cancelNotificationTimer } from "../lib/notifications";
import { IconPlus, IconBell, IconCheck, IconX, Spinner } from "./Icons";
import EbayExport from "./EbayExport";

const TABS = ["active", "completed", "purchases"];

const PLATFORM_FEES = {
  ebay: 0.1312, tcgplayer: 0.1089, mercari: 0.10, facebook: 0,
  collx: 0.10, poshmark: 0.20, comc: 0.10, alt: 0.10, goldin: 0.15, shopify: 0.029,
};

export { PLATFORM_FEES };

export default function SalesFlow() {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, listings, setListings, purchases, setPurchases, shipFrom } = useData();
  const [tab, setTab] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(canNotify());
  const [actionQueue, setActionQueue] = useState([]);
  const [busyListingId, setBusyListingId] = useState(null);

  const [showEbayExport, setShowEbayExport] = useState(false);

  // Inline sale confirmation (replaces window.prompt)
  const [sellingId, setSellingId] = useState(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sellTracking, setSellTracking] = useState("");

  // Reprice state
  const [repricingId, setRepricingId] = useState(null);
  const [repriceVal, setRepriceVal] = useState("");

  const [newListing, setNewListing] = useState({
    cardId: "", platform: "ebay", format: "fixed", startPrice: "", buyNowPrice: "",
    auctionEndDate: "", shipping: "4.99", notes: "",
  });
  const [newPurchase, setNewPurchase] = useState({
    name: "", set: "", platform: "ebay", price: "", shipping: "", seller: "", date: "", notes: "",
  });

  const activeListings = useMemo(() => listings.filter((l) => l.status === "active"), [listings]);
  const completedListings = useMemo(() => listings.filter((l) => l.status === "sold" || l.status === "ended"), [listings]);
  const urgentCount = useMemo(() => {
    const soon = Date.now() + 60 * 60 * 1000;
    return activeListings.filter((l) => l.format === "auction" && l.auctionEndDate && new Date(l.auctionEndDate).getTime() <= soon).length;
  }, [activeListings]);
  const unlistedCards = useMemo(() => catalog.filter((c) => c.status === "inventory" && c.name), [catalog]);

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    setNotifEnabled(ok);
    if (ok) toast.success("Notifications enabled"); else toast.error("Notification permission denied");
  };

  const createListing = () => {
    const card = catalog.find((c) => c.id === newListing.cardId);
    if (!card) { toast.error("Select a card"); return; }
    if (!newListing.startPrice) { toast.error("Enter a price"); return; }
    const listing = {
      id: uid(), cardId: card.id, cardName: card.name, set: card.set, number: card.number,
      platform: newListing.platform, format: newListing.format,
      startPrice: parseFloat(newListing.startPrice),
      buyNowPrice: newListing.format === "auction" ? parseFloat(newListing.buyNowPrice) || null : null,
      auctionEndDate: newListing.format === "auction" ? newListing.auctionEndDate : null,
      shipping: parseFloat(newListing.shipping) || 0,
      currentBid: newListing.format === "auction" ? parseFloat(newListing.startPrice) : null,
      status: "active", notes: newListing.notes, createdAt: new Date().toISOString(),
    };
    setListings((p) => [listing, ...p]);
    setCatalog((p) => p.map((c) => c.id === card.id ? { ...c, status: "listed", listedOn: [...(c.listedOn || []), newListing.platform] } : c));
    if (listing.format === "auction" && listing.auctionEndDate) scheduleAuctionNotification(listing);
    setShowCreate(false);
    setNewListing({ cardId: "", platform: "ebay", format: "fixed", startPrice: "", buyNowPrice: "", auctionEndDate: "", shipping: "4.99", notes: "" });
    toast.success(`Listed: ${card.name}`);
  };

  const completeSale = (listingId, salePrice, trackingNumber) => {
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return;
    const price = parseFloat(salePrice) || listing.startPrice;
    const feeRate = PLATFORM_FEES[listing.platform] || 0;
    const fees = Math.round(price * feeRate * 100) / 100;
    const card = catalog.find((c) => c.id === listing.cardId);
    const costBasis = parseFloat(card?.costBasis) || 0;
    const netProfit = price - costBasis - fees - listing.shipping;
    const sale = {
      id: uid(), cardId: listing.cardId, cardName: listing.cardName, set: listing.set,
      salePrice: price, costBasis, platform: listing.platform, fees,
      shippingCost: listing.shipping, netProfit, date: new Date().toISOString(), listingId: listing.id,
      ...(trackingNumber ? { trackingNumber } : {}),
    };
    setSales((p) => [sale, ...p]);
    setListings((p) => p.map((l) => l.id === listingId ? { ...l, status: "sold", soldPrice: price, soldDate: new Date().toISOString(), trackingNumber: trackingNumber || null } : l));
    setCatalog((p) => p.map((c) => c.id === listing.cardId ? { ...c, status: "sold", soldPrice: price, soldPlatform: listing.platform } : c));
    cancelNotificationTimer(listingId);
    setSellingId(null);
    setSellPrice("");
    setSellTracking("");
    sendNotification("Card sold!", `${listing.cardName} sold for ${fmtShort(price)} on ${listing.platform}. Net: ${fmtShort(netProfit)}`);
    toast.success(`Sold: ${listing.cardName} for ${fmtShort(price)} (net ${fmtShort(netProfit)})`);
  };

  const repriceListing = (listingId) => {
    const newPrice = parseFloat(repriceVal);
    if (!newPrice || isNaN(newPrice)) { toast.error("Enter a valid price"); return; }
    setListings((p) => p.map((l) => {
      if (l.id !== listingId) return l;
      const history = l.priceChanges || [];
      return {
        ...l,
        startPrice: newPrice,
        currentBid: l.format === "auction" ? l.currentBid : null,
        priceChanges: [...history, { from: l.startPrice, to: newPrice, date: new Date().toISOString() }],
      };
    }));
    setRepricingId(null);
    setRepriceVal("");
    toast.success(`Repriced to ${fmtShort(newPrice)}`);
  };

  const endListing = (listingId) => {
    if (!window.confirm("End this listing?")) return;
    setListings((p) => p.map((l) => l.id === listingId ? { ...l, status: "ended", endedDate: new Date().toISOString() } : l));
    const listing = listings.find((l) => l.id === listingId);
    if (listing) {
      setCatalog((p) => p.map((c) => {
        if (c.id !== listing.cardId) return c;
        const lo = (c.listedOn || []).filter((x) => x !== listing.platform);
        return { ...c, listedOn: lo, status: lo.length > 0 ? "listed" : "inventory" };
      }));
      cancelNotificationTimer(listingId);
    }
    toast.info("Listing ended");
  };

  const logPurchase = () => {
    if (!newPurchase.name) { toast.error("Enter card name"); return; }
    if (!newPurchase.price) { toast.error("Enter price"); return; }
    const purchase = {
      id: uid(), ...newPurchase, price: parseFloat(newPurchase.price),
      shipping: parseFloat(newPurchase.shipping) || 0,
      totalCost: parseFloat(newPurchase.price) + (parseFloat(newPurchase.shipping) || 0),
      date: newPurchase.date || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(),
    };
    setPurchases((p) => [purchase, ...p]);
    setShowBuy(false);
    setNewPurchase({ name: "", set: "", platform: "ebay", price: "", shipping: "", seller: "", date: "", notes: "" });
    toast.success(`Purchase logged: ${purchase.name}`);
  };

  const timeLeft = (dateStr) => {
    if (!dateStr) return null;
    const ms = new Date(dateStr).getTime() - Date.now();
    if (ms <= 0) return "Ended";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const totalActive = useMemo(() => activeListings.reduce((s, l) => s + (l.startPrice || 0), 0), [activeListings]);
  const totalPurchases = useMemo(() => purchases.reduce((s, p) => s + p.totalCost, 0), [purchases]);

  useEffect(() => {
    actionQueueAPI.list().then(setActionQueue).catch(() => setActionQueue([]));
  }, [catalog.length, listings.length, sales.length]);

  const publishListing = async (listingId, marketplace = "ebay") => {
    try {
      setBusyListingId(listingId);
      const channel = await marketplacesAPI.publish({ listingId, marketplace });
      setListings((prev) =>
        prev.map((listing) =>
          listing.id === listingId
            ? {
                ...listing,
                publishStatus: channel.status,
                externalListingId: channel.external_listing_id,
                lastSyncAt: channel.last_sync_at,
              }
            : listing,
        ),
      );
      toast.success(`Published to ${marketplace}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyListingId(null);
    }
  };

  const syncListing = async (listingId, marketplace = "ebay") => {
    try {
      setBusyListingId(listingId);
      await marketplacesAPI.sync({ marketplace, listingId });
      toast.success(`Synced ${marketplace} status`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyListingId(null);
    }
  };

  const crosspost = async (listingId) => {
    try {
      setBusyListingId(listingId);
      await marketplacesAPI.crosspost({ listingId, marketplaces: ["ebay", "comc", "shopify"] });
      toast.success("Cross-post plan created");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyListingId(null);
    }
  };

  return (
    <div className="fade">
      <div className="flex items-center justify-between mb-12">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Sales</h1>
        {!notifEnabled && (
          <button className="btn btn-outline btn-sm" onClick={enableNotifications}><IconBell size={12} /> Notify</button>
        )}
      </div>

      <div className="card-hero mb-12">
        <div className="stat-grid">
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Active</div>
            <div className="stat-value gold">{activeListings.length}</div>
            <div className="stat-sub">{fmtShort(totalActive)}</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Sold</div>
            <div className="stat-value text-grn">{completedListings.filter((l) => l.status === "sold").length}</div>
            <div className="stat-sub">{fmtShort(sales.reduce((s, x) => s + x.netProfit, 0))} net</div>
          </div>
          <div className="stat-item">
            <div className="lbl" style={{ margin: 0 }}>Bought</div>
            <div className="stat-value text-acc">{purchases.length}</div>
            <div className="stat-sub">{fmtShort(totalPurchases)} spent</div>
          </div>
          {urgentCount > 0 && (
            <div className="stat-item">
              <div className="lbl" style={{ margin: 0, color: "var(--red)" }}>Ending</div>
              <div className="stat-value text-red">{urgentCount}</div>
              <div className="stat-sub" style={{ color: "var(--red)" }}>&lt; 1 hour</div>
            </div>
          )}
        </div>
      </div>

      {actionQueue.length > 0 && (
        <div className="card mb-12">
          <div className="lbl">Action Queue</div>
          {actionQueue.slice(0, 4).map((entry) => (
            <div key={`${entry.subjectType}-${entry.subjectId}`} className="flex justify-between items-center mt-8">
              <div>
                <div className="text-xs fw-700">{entry.queue.replace(/_/g, " ")}</div>
                <div className="text-xxs text-dim">{entry.label}</div>
              </div>
              <span className="badge badge-acc">{entry.priorityScore}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-8 mb-12">
        <button className="btn btn-primary flex-1" onClick={() => setShowCreate(!showCreate)}><IconPlus size={14} /> New Listing</button>
        <button className="btn btn-outline flex-1" onClick={() => setShowBuy(!showBuy)}><IconPlus size={14} /> Log Purchase</button>
      </div>
      <div className="mb-12">
        <button className="btn btn-ghost btn-full" onClick={() => setShowEbayExport(!showEbayExport)}>
          {showEbayExport ? "Hide" : "Export to eBay CSV"}
        </button>
      </div>
      {showEbayExport && <EbayExport />}

      {showCreate && (
        <div className="card-elevated fade mb-12">
          <div className="lbl">Create Listing</div>
          <select className="inp mt-6" value={newListing.cardId} onChange={(e) => setNewListing((p) => ({ ...p, cardId: e.target.value }))}>
            <option value="">Select card...</option>
            {unlistedCards.map((c) => <option key={c.id} value={c.id}>{c.name} {c.set && `- ${c.set}`} {c.number && `#${c.number}`}</option>)}
          </select>
          <div className="form-grid mt-8">
            <select className="inp" value={newListing.platform} onChange={(e) => setNewListing((p) => ({ ...p, platform: e.target.value }))}>
              {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <select className="inp" value={newListing.format} onChange={(e) => setNewListing((p) => ({ ...p, format: e.target.value }))}>
              <option value="fixed">Buy It Now</option>
              <option value="auction">Auction</option>
            </select>
            <input className="inp" type="number" step="0.01" placeholder={newListing.format === "auction" ? "Start bid $" : "Price $"} value={newListing.startPrice} onChange={(e) => setNewListing((p) => ({ ...p, startPrice: e.target.value }))} />
            <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={newListing.shipping} onChange={(e) => setNewListing((p) => ({ ...p, shipping: e.target.value }))} />
            {newListing.format === "auction" && (
              <>
                <input className="inp" type="number" step="0.01" placeholder="Buy Now $ (optional)" value={newListing.buyNowPrice} onChange={(e) => setNewListing((p) => ({ ...p, buyNowPrice: e.target.value }))} />
                <input className="inp" type="datetime-local" value={newListing.auctionEndDate} onChange={(e) => setNewListing((p) => ({ ...p, auctionEndDate: e.target.value }))} />
              </>
            )}
          </div>
          {newListing.startPrice && (
            <div className="text-xs text-dim mt-8">
              Est. fees: {fmtShort(parseFloat(newListing.startPrice) * (PLATFORM_FEES[newListing.platform] || 0))} ({((PLATFORM_FEES[newListing.platform] || 0) * 100).toFixed(1)}%)
              {" "}&middot; Net: {fmtShort(parseFloat(newListing.startPrice) - parseFloat(newListing.startPrice) * (PLATFORM_FEES[newListing.platform] || 0) - (parseFloat(newListing.shipping) || 0))}
            </div>
          )}
          <button className="btn btn-primary btn-full mt-8" onClick={createListing}>Create Listing</button>
        </div>
      )}

      {showBuy && (
        <div className="card-elevated fade mb-12">
          <div className="lbl">Log Purchase</div>
          <div className="form-grid mt-6">
            <input className="inp" placeholder="Card name *" value={newPurchase.name} onChange={(e) => setNewPurchase((p) => ({ ...p, name: e.target.value }))} />
            <input className="inp" placeholder="Set" value={newPurchase.set} onChange={(e) => setNewPurchase((p) => ({ ...p, set: e.target.value }))} />
            <select className="inp" value={newPurchase.platform} onChange={(e) => setNewPurchase((p) => ({ ...p, platform: e.target.value }))}>
              {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <input className="inp" placeholder="Seller" value={newPurchase.seller} onChange={(e) => setNewPurchase((p) => ({ ...p, seller: e.target.value }))} />
            <input className="inp" type="number" step="0.01" placeholder="Price $ *" value={newPurchase.price} onChange={(e) => setNewPurchase((p) => ({ ...p, price: e.target.value }))} />
            <input className="inp" type="number" step="0.01" placeholder="Shipping $" value={newPurchase.shipping} onChange={(e) => setNewPurchase((p) => ({ ...p, shipping: e.target.value }))} />
            <input className="inp" type="date" value={newPurchase.date} onChange={(e) => setNewPurchase((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full mt-8" onClick={logPurchase}>Log Purchase</button>
        </div>
      )}

      <div className="chip-row mb-10">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`chip flex-1 text-center ${tab === t ? "active" : ""}`} style={{ textTransform: "capitalize" }}>
            {t}{t === "active" && activeListings.length > 0 ? ` (${activeListings.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "active" && (
        <>
          {activeListings.length === 0 && (
            <div className="card empty-state" style={{ padding: 32 }}>
              <div className="empty-desc">No active listings &mdash; create one above</div>
            </div>
          )}
          {activeListings.map((l) => {
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
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => publishListing(l.id, l.platform || "ebay")}>
                        {busyListingId === l.id ? <Spinner size={12} /> : "Publish"}
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => syncListing(l.id, l.platform || "ebay")}>
                        Sync
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busyListingId === l.id} onClick={() => crosspost(l.id)}>
                        Crosspost
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => { setSellingId(l.id); setSellPrice(String(l.currentBid || l.startPrice)); setRepricingId(null); }}>
                        <IconCheck size={12} /> Sold
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setRepricingId(l.id); setRepriceVal(String(l.startPrice)); setSellingId(null); }}>
                        Reprice
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => endListing(l.id)}><IconX size={12} /></button>
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
                    <div className="flex gap-8 mt-8">
                      <button className="btn btn-success btn-sm flex-1" onClick={() => completeSale(l.id, sellPrice, sellTracking)}>
                        <IconCheck size={12} /> Confirm Sale
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setSellingId(null); setSellPrice(""); setSellTracking(""); }}>Cancel</button>
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
                      <button className="btn btn-primary btn-sm" onClick={() => repriceListing(l.id)}>Update</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setRepricingId(null); setRepriceVal(""); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "completed" && (
        <>
          {completedListings.length === 0 && (
            <div className="card empty-state" style={{ padding: 32 }}>
              <div className="empty-desc">No completed listings yet</div>
            </div>
          )}
          {completedListings.map((l) => (
            <div key={l.id} className="card mb-8" style={{ borderColor: l.status === "sold" ? "var(--grn-brd)" : undefined }}>
              <div className="flex justify-between">
                <div>
                  <strong className="text-sm">{l.cardName}</strong>
                  <div className="text-xxs text-dim">{PLATFORMS.find((p) => p.v === l.platform)?.l}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {l.status === "sold"
                    ? <span className="fw-800 text-grn" style={{ fontSize: 16 }}>{fmtShort(l.soldPrice)}</span>
                    : <span className="badge badge-dim">Unsold</span>
                  }
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "purchases" && (
        <>
          {purchases.length === 0 && (
            <div className="card empty-state" style={{ padding: 32 }}>
              <div className="empty-desc">No purchases logged &mdash; log one above</div>
            </div>
          )}
          {purchases.map((p) => (
            <div key={p.id} className="card mb-8">
              <div className="flex justify-between">
                <div>
                  <strong className="text-sm">{p.name}</strong>
                  <div className="text-xxs text-dim">{p.set} &middot; {PLATFORMS.find((x) => x.v === p.platform)?.l} {p.seller && `from ${p.seller}`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="fw-800 text-acc" style={{ fontSize: 16 }}>{fmtShort(p.totalCost)}</div>
                  <div className="text-xxs text-dim">{p.date}</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
