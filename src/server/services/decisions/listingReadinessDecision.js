import { DECISION_TYPES } from "./decisionTypes.js";
import { action, buildExplanation } from "./explanationBuilder.js";

export function listingReadinessDecision(context) {
  if (context.subjectType !== "inventory_item") return null;

  const item = context.item;
  const listing = context.latestListing;
  const hasImages = Boolean(item?.front_img_id);
  const hasPrice = Number(item?.suggested_listing_price || item?.market_price || 0) > 0 || Number(listing?.start_price || 0) > 0;
  const hasTitle = Boolean(listing?.listing_title);
  const hasDescription = Boolean(listing?.listing_description);
  const hasSpecifics = Boolean(listing?.item_specifics);
  const hasCondition = Boolean(item?.condition);
  const hasShippingProfile = Boolean(listing?.shipping_profile);

  const ready = hasImages && hasPrice && hasTitle && hasDescription && hasSpecifics && hasCondition && hasShippingProfile;

  return {
    decisionType: DECISION_TYPES.LISTING_READINESS,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation: ready ? "publish_ready" : hasPrice ? "draft_ready" : "missing_required_fields",
    confidence: ready ? 0.92 : 0.66,
    explanation: ready
      ? "Listing has images, price, title, description, and item specifics."
      : buildExplanation([
          !hasImages ? "Images are missing." : null,
          !hasPrice ? "A price has not been assigned." : null,
          !hasTitle ? "Title is missing." : null,
          !hasDescription ? "Description is missing." : null,
          !hasSpecifics ? "Item specifics are missing." : null,
          !hasCondition ? "Condition is missing." : null,
          !hasShippingProfile ? "Shipping profile is missing." : null,
        ]),
    suggestedAction: ready
      ? action("publish_listing")
      : hasPrice
        ? action("save_draft")
        : action("open_listing_editor"),
    inputsUsed: { hasImages, hasPrice, hasTitle, hasDescription, hasSpecifics, hasCondition, hasShippingProfile },
    createdAt: new Date().toISOString(),
  };
}
