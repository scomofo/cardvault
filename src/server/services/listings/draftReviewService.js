import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { readImageFile, isValidImageId } from "../imageStore.js";
import { draftContentIssues, ungradedCardCondition } from "../../../lib/listingContent.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = "EBAY_PREPARATION_FAILED";
  throw error;
}

export function assertDraftEditable(listing) {
  if (!listing) fail("Listing not found", 404);
  const channels = all("SELECT * FROM listing_channels WHERE listing_id = ?", [listing.id]);
  const uncertain = ["publishing", "publish_unknown", "needs_review"];
  const realId = listing.external_listing_id && listing.external_listing_id !== `${listing.platform}-${listing.id.slice(0, 12)}`;
  const lockedChannel = channels.some((channel) => {
    const stubId = `${channel.marketplace}-${listing.id.slice(0, 12)}`;
    return uncertain.includes(channel.status) || (channel.external_listing_id && channel.external_listing_id !== stubId)
      || !["draft", "failed", "active"].includes(channel.status);
  });
  if (realId || lockedChannel || uncertain.includes(listing.publish_status) || ["sold", "ended"].includes(listing.status)) {
    fail("This listing is live, finished, or needs publication review. Refresh Sales before editing.", 409);
  }
}

export function ebayPublishReadiness(listing) {
  const item = listing?.card_id && get("SELECT * FROM user_items WHERE id = ?", [listing.card_id]);
  const issues = draftContentIssues(listing || {}, item || {});
  if (!item) issues.push("The linked card is missing.");
  if (item?.status === "sold" || item?.sale_status === "sold") issues.push("This card is already sold.");
  if (item?.type && item.type !== "sports") issues.push("Automatic eBay publication currently supports sports-card singles. Use the matching category in eBay for this card.");
  const photos = {};
  for (const side of ["front", "back"]) {
    const id = item?.[`${side}_img_id`];
    photos[side] = Boolean(id && readImageFile(id));
    if (id && !photos[side]) issues.push(`The ${side} photo is unavailable on the server. Upload it again.`);
  }
  if (!item?.front_img_id) issues.push("Add a front photo before publishing.");
  return { ready: issues.length === 0, issues, photos };
}

export function assertEbayPublishReady(listing) {
  const readiness = ebayPublishReadiness(listing);
  if (!readiness.ready) fail(readiness.issues.join(" "));
  return readiness;
}

export function saveDraftReview(listingId, values) {
  return runInImmediateTransaction(() => {
    const listing = get("SELECT * FROM listings WHERE id = ?", [listingId]);
    assertDraftEditable(listing);
    const item = get("SELECT * FROM user_items WHERE id = ?", [listing.card_id]);
    if (!item || item.status === "sold" || item.sale_status === "sold") fail("The linked card is missing or sold.", 409);
    const condition = ungradedCardCondition(values.condition);
    if (typeof values.listingTitle !== "string" || typeof values.listingDescription !== "string" || values.listingDescription.length > 30000) fail("Enter a title and description (up to 30,000 characters).");
    const reviewed = { ...listing, listing_title: values.listingTitle.trim(), listing_description: values.listingDescription.trim(), start_price: values.startPrice, shipping: values.shipping };
    const issues = draftContentIssues(reviewed, { ...item, condition: condition?.value });
    if (issues.length) fail(issues.join(" "));
    const imageIds = {};
    for (const side of ["front", "back"]) {
      const key = `${side}ImgId`;
      imageIds[side] = values[key] === undefined ? item[`${side}_img_id`] : values[key];
      if (imageIds[side] && (!isValidImageId(imageIds[side]) || !readImageFile(imageIds[side]))) fail(`Upload the ${side} photo before saving.`);
    }
    run("UPDATE user_items SET condition=?, front_img_id=?, back_img_id=?, updated_at=datetime('now') WHERE id=?", [condition.value, imageIds.front || null, imageIds.back || null, item.id]);
    run("UPDATE listings SET listing_title=?, listing_description=?, start_price=?, shipping=? WHERE id=?", [reviewed.listing_title, reviewed.listing_description, Number(Number(values.startPrice).toFixed(2)), Number(Number(values.shipping).toFixed(2)), listing.id]);
    return { listing: get("SELECT * FROM listings WHERE id = ?", [listing.id]), item: get("SELECT * FROM user_items WHERE id = ?", [item.id]) };
  });
}
