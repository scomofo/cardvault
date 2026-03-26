import { useState, useMemo } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { PLATFORMS } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { requestNotificationPermission, canNotify, sendNotification, scheduleAuctionNotification, cancelNotificationTimer } from "../lib/notifications";
import { IconPlus, IconBell, IconCheck, IconX, Spinner } from "./Icons";
import EbayExport from "./EbayExport";

const TABS = ["active", "completed", "purchases"];

const PLATFORM_FEES = {
  ebay: 0.1312, tcgplayer: 0.1089, mercari: 0.10, facebook: 0,
  collx: 0.10, poshmark: 0.20, comc: 0.10, alt: 0.10, goldin: 0.15, shopify: 0.029,
};

export default function SalesFlow() {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, listings, setListings, purchases, setPurchases, shipFrom } = useData();
  const [tab, setTab] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(canNotify());

  const [showEbayExport, setShowEbayExport] = useState(false);

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

  const completeSale = (listingId, salePrice) => {
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
    };
    setSales((p) => [sale, ...p]);
    setListings((p) => p.map((l) => l.id === listingId ? { ...l, status: "sold", soldPrice: price, soldDate: new Date().toISOString() } : l));
    setCatalog((p) => p.map((c) => c.id === listing.cardId ? { ...c, status: "sold", soldPrice: price, soldPlatform: listing.platform } : c));
    cancelNotificationTimer(listingId);
    sendNotification("Card sold!", `${listing.cardName} sold for ${fmtShort(price)} on ${listing.platform}. Net: ${fmtShort(netProfit)}`);
    toast.success(`Sold: ${listing.cardName} for ${fmtShort(price)}`);
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
            return (
              <div key={l.id} className="card mb-8" style={{ borderColor: isUrgent ? "var(--red-brd)" : tl === "Ended" ? "var(--acc-brd)" : undefined }}>
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
                  <div className="flex-1" />
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    const price = prompt("Sale price (CAD):", l.currentBid || l.startPrice);
                    if (price && !isNaN(parseFloat(price))) completeSale(l.id, price);
                  }}><IconCheck size={12} /> Sold</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => endListing(l.id)}><IconX size={12} /></button>
                </div>
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
