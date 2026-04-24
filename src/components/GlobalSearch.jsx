import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useData } from "../lib/DataContext";
import { condOf, fmtShort } from "../lib/utils";
import { matchScore, shouldOpenGlobalSearch } from "../lib/search/globalSearch";
import { IconSearch, IconX } from "./Icons";

const MAX_RESULTS = 20;

export default function GlobalSearch({ onNavigate }) {
  const { catalog, sales, orders, listings, purchases, watchlist, trades } = useData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Keyboard shortcut: Ctrl+K or / to open
  useEffect(() => {
    const handler = (e) => {
      if (shouldOpenGlobalSearch(e)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const all = [];

    // Cards
    catalog.forEach((c) => {
      const s = matchScore(c, query);
      if (s > 0) all.push({ type: "card", item: c, score: s });
    });

    // Sales
    sales.forEach((s) => {
      const sc = matchScore({ name: s.cardName, set: s.cardSet || s.set, platform: s.platform }, query);
      if (sc > 0) all.push({ type: "sale", item: s, score: sc });
    });

    // Orders
    orders.forEach((o) => {
      const sc = matchScore({
        name: o.cardName || o.card_name || o.externalOrderId || o.external_order_id || "Order",
        set: o.cardSet || o.card_set,
        platform: o.platform,
        seller: o.buyerHandle || o.buyer_handle,
        number: o.externalOrderId || o.external_order_id || o.id,
      }, query);
      if (sc > 0) all.push({ type: "order", item: o, score: sc });
    });

    // Listings
    listings.forEach((l) => {
      const sc = matchScore({ name: l.cardName, set: l.cardSet || l.set, number: l.cardNumber, platform: l.platform }, query);
      if (sc > 0) all.push({ type: "listing", item: l, score: sc });
    });

    // Purchases
    purchases.forEach((p) => {
      const sc = matchScore(p, query);
      if (sc > 0) all.push({ type: "purchase", item: p, score: sc });
    });

    // Watchlist
    watchlist.forEach((w) => {
      const sc = matchScore(w, query);
      if (sc > 0) all.push({ type: "watch", item: w, score: sc });
    });

    // Trades
    trades.forEach((t) => {
      const sc = matchScore({
        name: t.partner,
        partner: t.partner,
        gave: t.gave,
        received: t.received,
        notes: t.notes,
      }, query);
      if (sc > 0) all.push({ type: "trade", item: t, score: sc });
    });

    all.sort((a, b) => b.score - a.score);
    return all.slice(0, MAX_RESULTS);
  }, [query, catalog, sales, orders, listings, purchases, watchlist, trades]);

  const handleSelect = useCallback((result) => {
    setOpen(false);
    setQuery("");
    switch (result.type) {
      case "card":
        onNavigate("cards");
        break;
      case "sale":
      case "order":
      case "listing":
        onNavigate("sales");
        break;
      case "purchase":
        onNavigate("sales");
        break;
      case "watch":
      case "trade":
        onNavigate("tools");
        break;
    }
  }, [onNavigate]);

  const typeLabel = { card: "Card", sale: "Sale", order: "Order", listing: "Listing", purchase: "Purchase", watch: "Watchlist", trade: "Trade" };
  const typeColor = { card: "var(--acc)", sale: "var(--grn)", order: "var(--gold)", listing: "var(--blue)", purchase: "var(--orange)", watch: "var(--purple)", trade: "var(--teal)" };

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        style={{ gap: 5, padding: "6px 10px" }}
        title="Search (Ctrl+K)"
      >
        <IconSearch size={14} />
        <span className="text-xxs text-dim" style={{ letterSpacing: ".5px" }}>Ctrl+K</span>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(10,9,8,.7)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      animation: "fadeIn .15s ease",
    }}>
      <div ref={panelRef} style={{
        position: "absolute",
        top: "12%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(92vw, 520px)",
        background: "var(--s1)",
        border: "1px solid var(--brd2)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        overflow: "hidden",
        animation: "slideDown .2s var(--ease-out)",
      }}>
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--brd)",
        }}>
          <IconSearch size={18} style={{ color: "var(--acc)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards, sales, listings, watchlist..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--tx)", fontSize: 15, fontFamily: "var(--font-body)",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ color: "var(--dim)", background: "none", border: "none", padding: 4 }}>
              <IconX size={14} />
            </button>
          )}
          <kbd style={{
            fontSize: 10, padding: "2px 6px", background: "var(--s3)",
            border: "1px solid var(--brd)", borderRadius: 2, color: "var(--dim)",
            fontFamily: "var(--font-mono)",
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {query && results.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              No results for "{query}"
            </div>
          )}

          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.item.id}-${i}`}
              onClick={() => handleSelect(r)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "10px 16px", textAlign: "left",
                background: "transparent", border: "none",
                borderBottom: "1px solid var(--brd)",
                color: "var(--tx)", cursor: "pointer",
                transition: "background .15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--s2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {/* Type badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: ".8px",
                textTransform: "uppercase", color: typeColor[r.type],
                background: typeColor[r.type] + "15",
                padding: "2px 7px", borderRadius: 2,
                minWidth: 52, textAlign: "center",
                fontFamily: "var(--font-display)",
              }}>
                {typeLabel[r.type]}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.type === "card" && r.item.name}
                  {r.type === "sale" && r.item.cardName}
                  {r.type === "order" && (r.item.cardName || r.item.card_name || r.item.externalOrderId || r.item.external_order_id || "Order")}
                  {r.type === "listing" && r.item.cardName}
                  {r.type === "purchase" && r.item.name}
                  {r.type === "watch" && r.item.name}
                  {r.type === "trade" && `Trade with ${r.item.partner}`}
                </div>
                <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                  {r.type === "card" && [r.item.set, r.item.number && `#${r.item.number}`, condOf(r.item.condition).s].filter(Boolean).join(" \u00b7 ")}
                  {r.type === "sale" && `${r.item.platform} \u00b7 ${fmtShort(r.item.salePrice)}`}
                  {r.type === "order" && [r.item.platform, r.item.fulfillmentStatus || r.item.fulfillment_status, r.item.buyerHandle || r.item.buyer_handle].filter(Boolean).join(" \u00b7 ")}
                  {r.type === "listing" && `${r.item.platform} \u00b7 ${r.item.status}`}
                  {r.type === "purchase" && `${r.item.platform} \u00b7 ${fmtShort(r.item.totalCost || r.item.price)}`}
                  {r.type === "watch" && [r.item.set || r.item.cardSet, r.item.targetPrice && `Target: ${fmtShort(r.item.targetPrice)}`].filter(Boolean).join(" \u00b7 ")}
                  {r.type === "trade" && [r.item.gave, r.item.received].filter(Boolean).join(" \u2194 ")}
                </div>
              </div>

              {/* Value */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {r.type === "card" && r.item.priceEstimate?.mid && (
                  <span className="gold fw-700" style={{ fontSize: 14 }}>{fmtShort(r.item.priceEstimate.mid)}</span>
                )}
                {r.type === "card" && r.item.status && (
                  <div style={{ fontSize: 9, color: r.item.status === "sold" ? "var(--grn)" : "var(--dim)", marginTop: 2 }}>
                    {r.item.status}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {!query && (
          <div style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", borderTop: "1px solid var(--brd)" }}>
            Search across your entire collection — cards, sales, orders, listings, purchases, watchlist, and trades
          </div>
        )}
      </div>
    </div>
  );
}

