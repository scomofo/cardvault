import { useEffect, useRef, useState } from "react";
import { useData } from "../lib/DataContext";
import { itemsAPI, listingsAPI } from "../lib/api";
import { isDraftSaveRunning, subscribeDraftSave, listingPreparationIssue, proposedListingPrice, saveReviewedListingDrafts } from "../lib/sellerWorkflow";
import { loadData, saveData, loadString, saveString } from "../lib/storage";
import { CONDITIONS } from "../lib/constants";
import { uid } from "../lib/utils";
import { Spinner } from "./Icons";

export default function DraftPreparation({ cards, onNavigate, onWorkStarted }) {
  const { catalog, listings, orders, setCatalog, setListings, useServer } = useData();
  const [restored] = useState(() => loadData("seller_preparation", {}));
  const [selected, setSelected] = useState(new Set(restored.selected || []));
  const [prices, setPrices] = useState(restored.prices || {});
  const [conditions, setConditions] = useState(restored.conditions || {});
  const [shipping, setShipping] = useState(() => loadString("seller_draft_shipping", "4.99"));
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(isDraftSaveRunning);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const ids = useRef(new Map(loadData("seller_draft_ids", [])));
  const saving = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ catalog, listings });
  latest.current = { catalog, listings };
  const priceFor = (card) => prices[card.id] ?? proposedListingPrice(card);
  const reviewedCard = (card) => ({ ...card, condition: conditions[card.id] ?? card.condition });
  const selectedCards = cards.filter((card) => selected.has(card.id));
  const validCards = cards.filter((card) => !listingPreparationIssue(reviewedCard(card), priceFor(card)));
  const invalid = selectedCards.some((card) => listingPreparationIssue(reviewedCard(card), priceFor(card)));

  useEffect(() => {
    mounted.current = true;
    setBusy(isDraftSaveRunning());
    const unsubscribe = subscribeDraftSave(setBusy);
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!saveData("seller_preparation", { selected: [...selected], prices, conditions })) setError("Your draft edits could not be saved on this device. Keep this screen open.");
  }, [selected, prices, conditions]);

  const edit = (fn) => {
    onWorkStarted();
    setReviewed(false);
    setError("");
    fn();
  };

  const save = async () => {
    if (saving.current || isDraftSaveRunning() || !reviewed || invalid || selectedCards.length === 0) return;
    saving.current = true;
    setBusy(true);
    setError("");
    onWorkStarted();
    try {
      const next = await saveReviewedListingDrafts({
        selections: selectedCards.map((card) => ({ cardId: card.id, price: priceFor(card), condition: reviewedCard(card).condition })),
        catalog, listings, orders, shipping, ids: ids.current, idFactory: uid, useServer, itemsAPI, listingsAPI,
        shouldContinue: () => mounted.current,
        persistIds: (entries) => { if (!saveData("seller_draft_ids", entries)) throw new Error("Cannot save retry information on this device. Free some storage before saving drafts."); },
        onSaved: (listing, card) => {
          if (!mounted.current) throw new Error("Return to Prepare cards to recover this draft.");
          const nextCatalog = latest.current.catalog.map((entry) => entry.id === card.id ? { ...entry, condition: card.condition } : entry);
          const nextListings = [listing, ...latest.current.listings.filter((entry) => entry.id !== listing.id)];
          if (!saveData("catalog", nextCatalog) || !saveData("listings", nextListings)) {
            throw new Error(useServer ? "Draft reached the server, but this device could not save it. Free storage and retry to recover the same draft." : "Draft could not be saved on this device. Free storage and retry.");
          }
          latest.current = { catalog: nextCatalog, listings: nextListings };
          setCatalog(nextCatalog);
          setListings(nextListings);
        },
      });
      if (!mounted.current) return;
      setResult(next);
      setSelected(new Set(next.failed.map((entry) => entry.cardId)));
      setReviewed(false);
      // Only persist a valid, successfully used preference.
      if (next.saved.length) saveString("seller_draft_shipping", shipping);
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  return (
    <section className="seller-preparation" aria-label="Prepare eBay drafts" aria-busy={busy}>
      <p>Prepare eBay Buy It Now drafts together. Asking prices start from saved estimates; check the exact card, condition and price before saving.</p>
      {result && <div className="seller-result" role="status">
        <strong>{result.saved.length} draft{result.saved.length === 1 ? "" : "s"} saved{!useServer && " on this device"}.</strong> {result.failed.length > 0 && `${result.failed.length} still need attention.`}
        {result.saved.length > 0 && <button className="btn btn-outline" onClick={() => onNavigate({ view: "sales", focus: { type: "listing", id: result.saved[0].id } })}>Review saved drafts</button>}
      </div>}
      {error && <p role="alert" className="text-red">{error}</p>}
      {cards.length === 0 ? <p>No cards waiting for a draft. Scan another batch or review your saved drafts.</p> : <>
        <div className="seller-batch-controls">
          <label>Shipping per listing · CAD
            <input className="inp" type="number" min="0" step="0.01" value={shipping} disabled={busy} onChange={(event) => edit(() => setShipping(event.target.value))} />
          </label>
          <button className="btn btn-outline" disabled={busy || !validCards.length} onClick={() => edit(() => setSelected(new Set(validCards.map((card) => card.id))))}>Select cards with price &amp; condition</button>
          {selected.size > 0 && <button className="btn btn-ghost" disabled={busy} onClick={() => edit(() => setSelected(new Set()))}>Clear selection</button>}
        </div>
        <p className="seller-note">Shipping starts at your last saved amount. Check it for this batch. Price estimates are unverified.</p>
        <div className="seller-card-list">
          {cards.map((card) => {
            const issue = listingPreparationIssue(reviewedCard(card), priceFor(card));
            const failure = result?.failed.find((entry) => entry.cardId === card.id);
            return <div className="seller-prepare-row" key={card.id}>
              <label className="seller-card-select">
                <input type="checkbox" checked={selected.has(card.id)} disabled={busy} onChange={(event) => edit(() => setSelected((previous) => {
                  const next = new Set(previous);
                  if (event.target.checked) next.add(card.id); else next.delete(card.id);
                  return next;
                }))} />
                <span><strong>{card.name || "Unidentified card"}</strong><span className="seller-note">{[card.year, card.set, card.number && `#${card.number}`, card.parallel].filter(Boolean).join(" · ")}</span></span>
              </label>
              <label className="seller-price">Asking price · CAD
                <input className="inp" aria-label={`Asking price for ${card.name || "unidentified card"}`} type="number" min="0.01" step="0.01" placeholder="Set price" value={priceFor(card)} disabled={busy} onChange={(event) => edit(() => setPrices((previous) => ({ ...previous, [card.id]: event.target.value })))} />
              </label>
              <label>Inspected condition
                <select className="inp" aria-label={`Condition for ${card.name || "unidentified card"}`} value={reviewedCard(card).condition || ""} disabled={busy} onChange={(event) => edit(() => setConditions((previous) => ({ ...previous, [card.id]: event.target.value })))}>
                  <option value="">Choose condition</option>
                  {CONDITIONS.map((condition) => <option key={condition.v} value={condition.v}>{condition.l}</option>)}
                </select>
              </label>
              <button className="btn btn-ghost" disabled={busy} onClick={() => onNavigate({ view: "cards", focus: { type: "card", id: card.id } })}>Review card</button>
              {(issue || failure) && <div className="seller-row-issue">{issue || failure.error}</div>}
            </div>;
          })}
        </div>
        <div className="seller-save-bar">
          <label className="seller-card-select">
            <input type="checkbox" checked={reviewed} disabled={busy || !selectedCards.length || invalid} onChange={(event) => setReviewed(event.target.checked)} />
            <span>I checked the selected cards, conditions, asking prices and shipping.</span>
          </label>
          <button className="btn btn-primary" disabled={busy || !reviewed || !selectedCards.length || invalid} onClick={save}>
            {busy && <Spinner size={16} />} {busy ? "Saving drafts…" : `Save ${selectedCards.length} draft${selectedCards.length === 1 ? "" : "s"}`}
          </button>
          <span className="seller-note">Drafts are reviewed and published from Sales.</span>
        </div>
      </>}
    </section>
  );
}
