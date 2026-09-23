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
import EbaySellingSetup from "./EbaySellingSetup";
import { checkedEbayPublishRequest, formatCheckedAmount, freshEbayCheck } from "../lib/ebayReviewState";
import "../styles/seller.css";

export default function DraftReview({ listing, card = {}, onClose }) {
  const { catalog, listings, setCatalog, setListings, useServer } = useData();
  const key = `draft_review_${listing.id}`;
  const [form, setForm] = useState(() => loadData(key, { ...draftReviewValues(listing, card), frontImgId: card.frontImgId || null, backImgId: card.backImgId || null }));
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [setup, setSetup] = useState({ ready: false, connected: false });
  const [check, setCheck] = useState(null);
  const [checkedPhotos, setCheckedPhotos] = useState({});
  const [now, setNow] = useState(Date.now);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ catalog, listings });
  latest.current = { catalog, listings };
  const { frontImgId, backImgId } = form;
  const issues = draftContentIssues(form, { ...card, condition: form.condition });
  const photosAvailable = Boolean(photos.front && photos.back);
  const freshCheck = freshEbayCheck(check, setup.environment, now);
  const checkedPhotosAvailable = check?.review?.pictureUrls?.length === 2 && checkedPhotos[`${check.id}:0`] && checkedPhotos[`${check.id}:1`];
  const working = busy || setup.busy;

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
    if (!check) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [check]);

  const invalidate = () => {
    setCheck(null); setCheckedPhotos({}); setConfirmed(false); setMessage(""); setError("");
  };

  const edit = (field, value) => {
    setForm((previous) => changeDraftReviewField(previous, field, value));
    invalidate();
    setError("");
    setMessage("");
  };

  const upload = async (side, file) => {
    if (!file || inFlight.current || working) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choose a JPEG, PNG or WebP photo smaller than 8 MB."); return;
    }
    inFlight.current = true; setBusy(true); setError(""); invalidate();
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

  const save = async (runCheck = false) => {
    if (inFlight.current || working || issues.length || (runCheck && (!useServer || !photosAvailable || !setup.ready || !setup.connected))) return;
    inFlight.current = true; setBusy(true); setError(""); invalidate();
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
      if (runCheck) {
        setMessage("Draft saved. Uploading the reviewed photos and checking with eBay; nothing will be listed yet…");
        const result = await listingsAPI.checkEbay(listing.id);
        if (!mounted.current) return;
        setCheck(result); setNow(Date.now()); setCheckedPhotos({});
        setMessage(result.ready ? "eBay check passed. Review the checked details below before approving publication." : "Draft saved, but eBay found issues. Nothing was published.");
      }
      if (mounted.current) setConfirmed(false);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  const publish = async () => {
    if (inFlight.current || working || !useServer || !setup.ready || !setup.connected || !checkedPhotosAvailable) return;
    let request;
    try { request = checkedEbayPublishRequest({ check, environment: setup.environment, confirmed, listingId: listing.id }); }
    catch (failure) { invalidate(); setError(failure.message); return; }
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); setConfirmed(false);
    try {
      // Publish the checked server snapshot, never save edited fields in this action.
      const channel = await marketplacesAPI.publish(request);
      setListings((previous) => previous.map((entry) => entry.id === listing.id ? applyChannelToListing(entry, channel) : entry));
      const summary = summarizePublishOutcome(channel, { marketplace: "ebay", label: "eBay", listingId: listing.id });
      if (mounted.current) setMessage(summary.message);
    } catch (failure) {
      if (mounted.current) setError(`${failure.message} Check the refreshed listing status before trying again.`);
      // Read authoritative state after a timeout; never repeat a create request here.
      await listingsAPI.list().then((rows) => {
        const current = rows.find((entry) => entry.id === listing.id);
        if (current) setListings((previous) => previous.map((entry) => entry.id === current.id ? current : entry));
      }).catch(() => {});
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setCheck(null); setCheckedPhotos({}); }
    }
  };

  return <section className="draft-review mt-12" aria-label={`Review listing for ${card.name || listing.cardName}`} aria-busy={working}>
    <h3>Review your listing</h3>
    <div className="draft-photos">
      {["front", "back"].map((side) => <div key={side}>
        {photos[side] ? <img src={photos[side]} alt={`Card ${side}`} onError={() => setPhotos((previous) => ({ ...previous, [side]: null }))} /> : <div className="draft-photo-missing">{side === "front" ? "Front photo required" : "Back photo required for eBay check"}</div>}
        <label>{side === "front" ? "Front" : "Back"} photo
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={working} onChange={(event) => { upload(side, event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>)}
    </div>
    <label>Listing title <span className="seller-note">{form.listingTitle.length}/80 characters</span><input className="inp" value={form.listingTitle} maxLength={80} disabled={working} onChange={(event) => edit("listingTitle", event.target.value)} /></label>
    <label>Description<textarea className="inp" rows={7} value={form.listingDescription} maxLength={30000} disabled={working} onChange={(event) => edit("listingDescription", event.target.value)} /></label>
    <div className="form-grid">
      <label>Asking price · CAD<input className="inp" type="number" min="0.01" step="0.01" value={form.startPrice} disabled={working} onChange={(event) => edit("startPrice", event.target.value)} /></label>
      <label>Shipping charged to buyer · CAD<input className="inp" type="number" min="0" step="0.01" value={form.shipping} disabled={working} onChange={(event) => edit("shipping", event.target.value)} /><span className="seller-note">Must match your selected shipping policy.</span></label>
      <label>Inspected condition<select className="inp" value={form.condition} disabled={working} onChange={(event) => edit("condition", event.target.value)}><option value="">Choose condition</option>{CONDITIONS.map((condition) => <option key={condition.v} value={condition.v}>{condition.l}</option>)}</select></label>
    </div>
    <p className="seller-note">eBay condition: Ungraded · {ungradedCardCondition(form.condition)?.label || "Choose a condition"}. A condition estimate is not a professional grade.</p>
    <EbaySellingSetup useServer={useServer} disabled={busy} onChange={invalidate} onState={setSetup} />
    {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    {!useServer && <p className="seller-note">You can save on this device. Connect to the CardVault server to check and publish.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="text-red" role="alert">{error}</p>}
    <div className="flex gap-8 flex-wrap mt-12">
      <button className="btn btn-outline" disabled={working || issues.length > 0} onClick={() => save(false)}>Save changes</button>
      <button className="btn btn-primary" disabled={working || !useServer || !photosAvailable || issues.length > 0 || !setup.ready || !setup.connected} onClick={() => save(true)}>{busy ? <Spinner size={16} /> : null} Save &amp; check with eBay</button>
      <button className="btn btn-ghost" disabled={working} onClick={onClose}>Close review</button>
    </div>
    <p className="seller-note">Checking does not publish. You approve the checked version in a separate step.</p>
    {check && <section className="ebay-check-result" aria-label="eBay checked listing">
      <h3>{check.ready ? "Review the eBay-checked version" : "eBay check needs attention"}</h3>
      <p><strong>{check.environment === "sandbox" ? "Sandbox — test listing" : "Production — real listing"}</strong></p>
      {check.messages?.length > 0 && <ul>{check.messages.map((entry, index) => <li key={`${entry.code}-${index}`}><strong>{entry.severity || "Notice"}:</strong> {entry.message}</li>)}</ul>}
      {check.review && <>
        <div className="draft-photos">{check.review.pictureUrls?.map((url, index) => <img key={`${check.id}-${index}`} src={url} alt={`eBay-checked ${index === 0 ? "front" : "back"} photo`} onLoad={() => setCheckedPhotos((previous) => ({ ...previous, [`${check.id}:${index}`]: true }))} onError={() => { setCheckedPhotos((previous) => ({ ...previous, [`${check.id}:${index}`]: false })); setConfirmed(false); }} />)}</div>
        {!checkedPhotosAvailable && <p className="seller-note">Both checked photos must load before approval. If they cannot load, check your connection and run the check again.</p>}
        <dl className="ebay-checked-details">
          <dt>Title</dt><dd>{check.review.title}</dd>
          <dt>Description</dt><dd className="ebay-checked-description">{check.review.description}</dd>
          <dt>Asking price</dt><dd>{formatCheckedAmount(check.review.price)}</dd>
          <dt>Policy shipping</dt><dd>{formatCheckedAmount(check.review.shipping)}</dd>
          <dt>Condition</dt><dd>Ungraded · {ungradedCardCondition(check.review.condition)?.label || check.review.condition}</dd>
          {check.review.sport && <><dt>Sport</dt><dd>{check.review.sport}</dd></>}
          {check.review.manufacturer && <><dt>Manufacturer</dt><dd>{check.review.manufacturer}</dd></>}
          <dt>Ship from</dt><dd>{check.review.postalCode}, Canada</dd>
          <dt>Shipping policy</dt><dd>{check.review.policyNames?.fulfillment}</dd>
          <dt>Payment policy</dt><dd>{check.review.policyNames?.payment}</dd>
          <dt>Return policy</dt><dd>{check.review.policyNames?.returns}</dd>
        </dl>
      </>}
      {check.fees?.length > 0 && <><h4>eBay listing-fee estimates</h4><ul>{check.fees.map((fee, index) => <li key={`${fee.name}-${index}`}>{fee.name}: {formatCheckedAmount(fee.amount, fee.currency)}</li>)}</ul></>}
      <p className="seller-note">Listing-fee estimates are not total selling fees or expected profit. A passed check does not guarantee eBay will accept publication.</p>
      {freshCheck ? <p className="seller-note">Check expires at {new Date(check.expiresAt).toLocaleTimeString()}. Changing the draft or selling defaults requires another check.</p> : <p className="seller-note">This check cannot be approved. Resolve any issues and run Save &amp; check with eBay again.</p>}
      <label className="seller-card-select"><input type="checkbox" checked={confirmed && freshCheck} disabled={working || !freshCheck || !checkedPhotosAvailable} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed these exact photos, details, prices and policy names. {check.environment === "sandbox" ? "Publish this test listing to eBay Sandbox." : "Publish this real listing to eBay Production; applicable fees may be charged."}</span></label>
      <button className="btn btn-primary mt-12" disabled={working || !useServer || !confirmed || !freshCheck || !checkedPhotosAvailable || !setup.ready || !setup.connected} onClick={publish}>Publish checked listing</button>
    </section>}
  </section>;
}
