import { get, run } from "../../database.js";
import { generateListingDrafts } from "../listings/listingGenerator.js";

function buildShippingProfile(item, destinationCountry = "CA") {
  const isCanada = destinationCountry === "CA";
  return {
    originCountry: "CA",
    destinationCountry,
    service: isCanada ? "Canada Post Tracked Packet" : "Canada Post Tracked Packet USA",
    cost: isCanada ? 4.99 : 8.99,
    combinedShipping: true,
    returnPolicy: "30 day returns accepted",
  };
}

export function automateListingGeneration({
  itemIds,
  platform = "ebay",
  pricingStrategy = "market",
  format = "fixed",
} = {}) {
  const result = generateListingDrafts({ itemIds, platform, pricingStrategy, format });

  const drafts = result.drafts.map((draft) => {
    const item = get(`SELECT * FROM user_items WHERE id = ?`, [draft.card_id]);
    const imageCount = Number(Boolean(item?.front_img_id)) + Number(Boolean(item?.back_img_id));
    const shippingProfile = buildShippingProfile(item);
    const hasCondition = Boolean(item?.condition);
    const ready =
      Boolean(draft.listing_title) &&
      Number(draft.start_price || 0) > 0 &&
      hasCondition &&
      imageCount >= 1 &&
      Boolean(draft.category_path) &&
      Boolean(shippingProfile.service);

    run(
      `UPDATE listings
       SET shipping_profile = ?,
           image_count = ?,
           automation_state = ?,
           status = ?
       WHERE id = ?`,
      [
        JSON.stringify(shippingProfile),
        imageCount,
        ready ? "publish_ready" : "draft_ready",
        ready ? "ready" : "draft",
        draft.id,
      ],
    );

    return get(`SELECT * FROM listings WHERE id = ?`, [draft.id]);
  });

  return {
    batchId: result.batchId,
    drafts,
    summary: {
      publishReady: drafts.filter((draft) => draft.automation_state === "publish_ready").length,
      draftOnly: drafts.filter((draft) => draft.automation_state !== "publish_ready").length,
    },
  };
}
