import { useEffect, useRef, useState } from "react";
import { useData } from "../lib/DataContext";
import { itemsAPI, listingsAPI, imagesAPI, marketplacesAPI } from "../lib/api";
import { saveDraftReviewWithRecovery } from "../lib/draftReview";
import { draftReviewValues, draftContentIssues, ungradedCardCondition, changeDraftReviewField } from "../lib/listingContent";
import { applyChannelToListing, summarizePublishOutcome } from "../lib/scanPublish";
import { loadData, saveData, loadImage, saveImage } from "../lib/storage";
import { CONDITIONS } from "../lib/constants";
import { uid } from "../lib/utils";
import { Spinner } from "./Icons";
import "../styles/seller.css";

export default function DraftReview({ listing, card = {}, onClose }) {
  const { catalog, listings, setCatalog, setListings, useServer } = useData();
  const key = `draft_review_${listing.id}`;
  const [form, setForm] = useState(() => loadData(key, { ...draftReviewValues(listing, card), frontImgId: card.frontImgId || null, backImgId: card.backImgId || null }));
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ catalog, listings });
  latest.current = { catalog, listings };
  const { frontImgId, backImgId } = form;
  const issues = draftContentIssues(form, { ...card, condition: form.condition });
  const photosAvailable = Boolean(photos.front) && (!form.backImgId || Boolean(photos.back));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!saveData(key, form)) setError("Your edits could not be saved on this device. Free storage before continuing.");
  }, [key, form]);
  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];
    for (const [side, id] of [["front", frontImgId], ["back", backImgId]]) {
      setPhotos((previous) => ({ ...previous, [side]: null }));
      if (!id) continue;
      loadImage(id).catch(() => null).then(async (data) => {
        let source = data;
        if (!source && useServer) {
          const blob = await imagesAPI.read(id);
          if (cancelled) return;
          source = URL.createObjectURL(blob);
          objectUrls.push(source);
        }
        if (!cancelled) setPhotos((previous) => ({ ...previous, [side]: source }));
      }).catch(() => {});
    }
    return () => { cancelled = true; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [frontImgId, backImgId, useServer]);
  useEffect(() => {
    let cancelled = false;
    if (useServer) listingsAPI.readiness(listing.id).then((result) => { if (!cancelled) setReadiness(result); }).catch(() => {});
    return () => { cancelled = true; };
  }, [listing.id, useServer]);

  const edit = (field, value) => {
    setForm((previous) => changeDraftReviewField(previous, field, value));
    setConfirmed(false);
    setError("");
    setMessage("");
  };

  const upload = async (side, file) => {
    if (!file || inFlight.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choose a JPEG, PNG or WebP photo smaller than 8 MB."); return;
    }
    inFlight.current = true; setBusy(true); setError(""); setConfirmed(false);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read the photo")); reader.readAsDataURL(file);
      });
      const id = `img_${uid()}_${side}`;
      await saveImage(id, dataUrl);
      if (useServer) await imagesAPI.upload(id, dataUrl);
      if (mounted.current) edit(`${side}ImgId`, id);
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  const save = async (publish = false) => {
    if (inFlight.current || issues.length || (publish && (!confirmed || !useServer || !photosAvailable))) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    let submitted = false;
    try {
      let saved;
      if (useServer) {
        // Restore any locally cached photos to the server before linking them.
        for (const id of [form.frontImgId, form.backImgId].filter(Boolean)) {
          const data = await loadImage(id).catch(() => null);
          if (data) await imagesAPI.upload(id, data);
        }
        saved = await saveDraftReviewWithRecovery({ listing, card, values: form, listingsAPI, itemsAPI });
      } else {
        saved = { listing: { ...listing, listingTitle: form.listingTitle.trim(), listingDescription: form.listingDescription.trim(), startPrice: Number(form.startPrice), shipping: Number(form.shipping) }, item: { ...card, condition: form.condition, frontImgId: form.frontImgId, backImgId: form.backImgId } };
      }
      if (!mounted.current) return;
      const nextCatalog = latest.current.catalog.map((entry) => entry.id === saved.item.id ? saved.item : entry);
      const nextListings = latest.current.listings.map((entry) => entry.id === saved.listing.id ? saved.listing : entry);
      if (!saveData("catalog", nextCatalog) || !saveData("listings", nextListings)) throw new Error(useServer ? "Saved to the server, but this device could not save a copy. Free storage before publishing." : "Could not save the draft on this device. Free storage and retry.");
      setCatalog((previous) => previous.map((entry) => entry.id === saved.item.id ? saved.item : entry));
      setListings((previous) => previous.map((entry) => entry.id === saved.listing.id ? saved.listing : entry));
      if (!mounted.current) return;
      setMessage("Draft changes saved.");
      if (useServer) {
        const checked = await listingsAPI.readiness(listing.id);
        if (!mounted.current) return;
        setReadiness(checked);
        if (publish) {
          if (!checked.connected) throw new Error("Connect eBay in Settings before publishing. Your draft is saved.");
          if (!checked.ready) throw new Error(checked.issues.join(" "));
          submitted = true;
          const channel = await marketplacesAPI.publish({ listingId: listing.id, marketplace: "ebay" });
          setListings((previous) => previous.map((entry) => entry.id === listing.id ? applyChannelToListing(entry, channel) : entry));
          const summary = summarizePublishOutcome(channel, { marketplace: "ebay", label: "eBay", listingId: listing.id });
          if (mounted.current) setMessage(summary.message);
        }
      }
      if (mounted.current) setConfirmed(false);
    } catch (failure) {
      if (mounted.current) setError(submitted ? `${failure.message} Refresh the listing status before retrying.` : failure.message);
      if (submitted) {
        // Read authoritative state after a timeout; never retry a create here.
        await listingsAPI.list().then((rows) => {
          const current = rows.find((entry) => entry.id === listing.id);
          if (current) setListings((previous) => previous.map((entry) => entry.id === current.id ? current : entry));
        }).catch(() => {});
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  return <section className="draft-review mt-12" aria-label={`Review listing for ${card.name || listing.cardName}`} aria-busy={busy}>
    <h3>Review your listing</h3>
    <div className="draft-photos">
      {["front", "back"].map((side) => <div key={side}>
        {photos[side] ? <img src={photos[side]} alt={`Card ${side}`} onError={() => setPhotos((previous) => ({ ...previous, [side]: null }))} /> : <div className="draft-photo-missing">{side === "front" ? "Front photo required" : "Add a back photo"}</div>}
        <label>{side === "front" ? "Front" : "Back"} photo
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => { upload(side, event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>)}
    </div>
    <label>Listing title <span className="seller-note">{form.listingTitle.length}/80 characters</span><input className="inp" value={form.listingTitle} maxLength={80} disabled={busy} onChange={(event) => edit("listingTitle", event.target.value)} /></label>
    <label>Description<textarea className="inp" rows={7} value={form.listingDescription} maxLength={30000} disabled={busy} onChange={(event) => edit("listingDescription", event.target.value)} /></label>
    <div className="form-grid">
      <label>Asking price · CAD<input className="inp" type="number" min="0.01" step="0.01" value={form.startPrice} disabled={busy} onChange={(event) => edit("startPrice", event.target.value)} /></label>
      <label>Shipping charged to buyer · CAD<input className="inp" type="number" min="0" step="0.01" value={form.shipping} disabled={busy} onChange={(event) => edit("shipping", event.target.value)} /></label>
      <label>Inspected condition<select className="inp" value={form.condition} disabled={busy} onChange={(event) => edit("condition", event.target.value)}><option value="">Choose condition</option>{CONDITIONS.map((condition) => <option key={condition.v} value={condition.v}>{condition.l}</option>)}</select></label>
    </div>
    <p className="seller-note">eBay condition: Ungraded · {ungradedCardCondition(form.condition)?.label || "Choose a condition"}. A condition estimate is not a professional grade.</p>
    <p className="seller-note">Current eBay settings: sports-card single, CAD, Canada, 3-day handling, 30-day returns with buyer-paid return postage. Shipping uses the app’s standard international flat-rate service.</p>
    {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    {!useServer && <p className="seller-note">You can save on this device. Connect to the CardVault server to publish.</p>}
    {readiness && !readiness.connected && <p className="seller-note">Connect eBay in Settings to publish.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="text-red" role="alert">{error}</p>}
    <label className="seller-card-select"><input type="checkbox" checked={confirmed} disabled={busy || issues.length > 0 || !photosAvailable} onChange={(event) => setConfirmed(event.target.checked)} /><span>I checked the photos, listing details, prices and sale terms.</span></label>
    <div className="flex gap-8 flex-wrap mt-12">
      <button className="btn btn-outline" disabled={busy || issues.length > 0} onClick={() => save(false)}>Save changes</button>
      <button className="btn btn-primary" disabled={busy || !confirmed || !useServer || !photosAvailable || issues.length > 0 || readiness?.connected === false} onClick={() => save(true)}>{busy ? <Spinner size={16} /> : null} Save &amp; publish to eBay</button>
      <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Close review</button>
    </div>
  </section>;
}
