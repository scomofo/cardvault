import { useState, useMemo, useEffect } from "react";
import { useToast } from "./Toast";
import { useData } from "../lib/DataContext";
import { PLATFORMS } from "../lib/constants";
import { uid, fmtShort } from "../lib/utils";
import { requestNotificationPermission, canNotify, sendNotification, scheduleAuctionNotification, cancelNotificationTimer } from "../lib/notifications";

const TABS = ["active", "completed", "purchases"];

// Platform fee estimates (%)
const PLATFORM_FEES = {
  ebay: 0.1312, // eBay 13.12% (12.55% FVF + 0.30 insertion avg)
  tcgplayer: 0.1089, // TCGplayer 10.89%
  mercari: 0.10,
  facebook: 0,
  collx: 0.10,
  poshmark: 0.20,
  comc: 0.10,
  alt: 0.10,
  goldin: 0.15,
  shopify: 0.029,
};

export default function SalesFlow() {
  const toast = useToast();
  const { catalog, setCatalog, sales, setSales, listings, setListings, purchases, setPurchases, shipFrom } = useData();
  const [tab, setTab] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(canNotify());

  // Create listing form
  const [newListing, setNewListing] = useState({
    cardId: "", platform: "ebay", format: "fixed", startPrice: "", buyNowPrice: "",
    auctionEndDate: "", shipping: "4.99", notes: "",
  });

  // Purchase form
  const [newPurchase, setNewPurchase] = useState({
    name: "", set: "", platform: "ebay", price: "", shipping: "", seller: "", date: "", notes: "",
  });

  const activeListings = useMemo(() => listings.filter((l) => l.status === "active"), [listings]);
  const completedListings = useMemo(() => listings.filter((l) => l.status === "sold" || l.status === "ended"), [listings]);

  // Count auctions ending within 1 hour
  const urgentCount = useMemo(() => {
    const soon = Date.now() + 60 * 60 * 1000;
    return activeListings.filter((l) => l.format === "auction" && l.auctionEndDate && new Date(l.auctionEndDate).getTime() <= soon).length;
  }, [activeListings]);

  // Unlisted cards available for listing
  const unlistedCards = useMemo(() => catalog.filter((c) => c.status === "inventory" && c.name), [catalog]);

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    setNotifEnabled(ok);
    if (ok) toast.success("Notifications enabled");
    else toast.error("Notification permission denied");
  };

  const createListing = () => {
    const card = catalog.find((c) => c.id === newListing.cardId);
    if (!card) { toast.error("Select a card"); return; }
    if (!newListing.startPrice) { toast.error("Enter a price"); return; }

    const listing = {
      id: uid(),
      cardId: card.id,
      cardName: card.name,
      set: card.set,
      number: card.number,
      platform: newListing.platform,
      format: newListing.format,
      startPrice: parseFloat(newListing.startPrice),
      buyNowPrice: newListing.format === "auction" ? parseFloat(newListing.buyNowPrice) || null : null,
      auctionEndDate: newListing.format === "auction" ? newListing.auctionEndDate : null,
      shipping: parseFloat(newListing.shipping) || 0,
      currentBid: newListing.format === "auction" ? parseFloat(newListing.startPrice) : null,
      status: "active",
      notes: newListing.notes,
      createdAt: new Date().toISOString(),
    };

    setListings((p) => [listing, ...p]);
    setCatalog((p) => p.map((c) => c.id === card.id ? { ...c, status: "listed", listedOn: [...(c.listedOn || []), newListing.platform] } : c));

    if (listing.format === "auction" && listing.auctionEndDate) {
      scheduleAuctionNotification(listing);
    }

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
      shippingCost: listing.shipping, netProfit, date: new Date().toISOString(),
      listingId: listing.id,
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
      id: uid(), ...newPurchase,
      price: parseFloat(newPurchase.price),
      shipping: parseFloat(newPurchase.shipping) || 0,
      totalCost: parseFloat(newPurchase.price) + (parseFloat(newPurchase.shipping) || 0),
      date: newPurchase.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Sales Flow</h2>
        {!notifEnabled && (
          <button className="btn-o" style={{ fontSize: 11, padding: "5px 10px" }} onClick={enableNotifications}>Enable Notifications</button>
        )}
      </div>

      {/* Summary */}
      <div className="card card-glow" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <div>
            <div className="lbl" style={{ margin: 0 }}>Active</div>
            <div className="gold" style={{ fontSize: 22, fontWeight: 900 }}>{activeListings.length}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{fmtShort(totalActive)}</div>
          </div>
          <div>
            <div className="lbl" style={{ margin: 0 }}>Sold</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--grn)" }}>{completedListings.filter((l) => l.status === "sold").length}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{fmtShort(sales.reduce((s, x) => s + x.netProfit, 0))} net</div>
          </div>
          <div>
            <div className="lbl" style={{ margin: 0 }}>Bought</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--acc)" }}>{purchases.length}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{fmtShort(totalPurchases)} spent</div>
          </div>
          {urgentCount > 0 && (
            <div>
              <div className="lbl" style={{ margin: 0, color: "var(--red)" }}>Ending Soon</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--red)" }}>{urgentCount}</div>
              <div style={{ fontSize: 11, color: "var(--red)" }}>&lt; 1 hour</div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn-a" style={{ flex: 1 }} onClick={() => setShowCreate(!showCreate)}>+ New Listing</button>
        <button className="btn-o" style={{ flex: 1 }} onClick={() => setShowBuy(!showBuy)}>+ Log Purchase</button>
      </div>

      {/* Create listing form */}
      {showCreate && (
        <div className="card fade" style={{ marginBottom: 12 }}>
          <div className="lbl">Create Listing</div>
          <select className="inp" style={{ marginTop: 6 }} value={newListing.cardId} onChange={(e) => setNewListing((p) => ({ ...p, cardId: e.target.value }))}>
            <option value="">Select card...</option>
            {unlistedCards.map((c) => (
              <option key={c.id} value={c.id}>{c.name} {c.set && `- ${c.set}`} {c.number && `#${c.number}`}</option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
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
          {/* Fee estimate */}
          {newListing.startPrice && (
            <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 8 }}>
              Est. fees: {fmtShort(parseFloat(newListing.startPrice) * (PLATFORM_FEES[newListing.platform] || 0))} ({((PLATFORM_FEES[newListing.platform] || 0) * 100).toFixed(1)}%)
              {" "}&middot; Net: {fmtShort(parseFloat(newListing.startPrice) - parseFloat(newListing.startPrice) * (PLATFORM_FEES[newListing.platform] || 0) - (parseFloat(newListing.shipping) || 0))}
            </div>
          )}
          <button className="btn-a" style={{ marginTop: 8, width: "100%" }} onClick={createListing}>Create Listing</button>
        </div>
      )}

      {/* Purchase form */}
      {showBuy && (
        <div className="card fade" style={{ marginBottom: 12 }}>
          <div className="lbl">Log Purchase</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
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
          <button className="btn-a" style={{ marginTop: 8, width: "100%" }} onClick={logPurchase}>Log Purchase</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="chip" style={{
            flex: 1, textAlign: "center", textTransform: "capitalize",
            borderColor: tab === t ? "var(--acc)" : "var(--brd)",
            color: tab === t ? "var(--acc)" : "var(--dim)",
            background: tab === t ? "#d4a01712" : "transparent",
          }}>{t}{t === "active" && activeListings.length > 0 ? ` (${activeListings.length})` : ""}</button>
        ))}
      </div>

      {/* Active listings */}
      {tab === "active" && (
        <>
          {activeListings.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}>
              No active listings — create one above
            </div>
          )}
          {activeListings.map((l) => {
            const tl = l.format === "auction" ? timeLeft(l.auctionEndDate) : null;
            const isUrgent = tl && !tl.includes("d") && !tl.includes("Ended") && parseInt(tl) < 60;
            return (
              <div key={l.id} className="card" style={{ marginBottom: 8, borderColor: isUrgent ? "var(--red)" : tl === "Ended" ? "var(--acc)" : "var(--brd)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{l.cardName}</strong>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>{l.set} {l.number && `#${l.number}`}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="gold" style={{ fontSize: 18, fontWeight: 800 }}>{fmtShort(l.currentBid || l.startPrice)}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{PLATFORMS.find((p) => p.v === l.platform)?.l || l.platform}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: l.format === "auction" ? "var(--acc)" : "var(--grn)", background: l.format === "auction" ? "#d4a01718" : "#30a46c18", padding: "2px 8px", borderRadius: 5 }}>
                    {l.format === "auction" ? "Auction" : "BIN"}
                  </span>
                  {tl && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: isUrgent ? "var(--red)" : tl === "Ended" ? "var(--acc)" : "var(--dim)" }}>
                      {tl === "Ended" ? "Auction ended" : `Ends in ${tl}`}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="btn-a" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => {
                    const price = prompt("Sale price (CAD):", l.currentBid || l.startPrice);
                    if (price) completeSale(l.id, price);
                  }}>Mark Sold</button>
                  <button className="btn-g" style={{ padding: "5px 8px", fontSize: 10, color: "var(--red)" }} onClick={() => endListing(l.id)}>End</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Completed */}
      {tab === "completed" && (
        <>
          {completedListings.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}>
              No completed listings yet
            </div>
          )}
          {completedListings.map((l) => (
            <div key={l.id} className="card" style={{ marginBottom: 8, borderColor: l.status === "sold" ? "var(--grn)" : "var(--brd)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{l.cardName}</strong>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{PLATFORMS.find((p) => p.v === l.platform)?.l}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {l.status === "sold" ? (
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--grn)" }}>{fmtShort(l.soldPrice)}</span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--dim)" }}>Unsold</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Purchases */}
      {tab === "purchases" && (
        <>
          {purchases.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}>
              No purchases logged — log one above
            </div>
          )}
          {purchases.map((p) => (
            <div key={p.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{p.name}</strong>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{p.set} &middot; {PLATFORMS.find((x) => x.v === p.platform)?.l} {p.seller && `from ${p.seller}`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--acc)" }}>{fmtShort(p.totalCost)}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)" }}>{p.date}</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
