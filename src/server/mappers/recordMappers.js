export function json(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function toCamel(row, map) {
  if (!row) return row;

  const output = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = map[key] || key;
    if (
      ["listedOn", "priceEstimate", "priceHistory", "itemSpecifics", "shippingProfile", "metadata"].includes(camelKey) &&
      typeof value === "string"
    ) {
      try {
        output[camelKey] = JSON.parse(value);
      } catch {
        output[camelKey] = value;
      }
    } else {
      output[camelKey] = value;
    }
  }

  return output;
}

export function toCamelArray(rows, map) {
  return (rows || []).map((row) => toCamel(row, map));
}

export function toSnake(body) {
  if (!body) return body;

  const output = { ...body };
  if ("cardSet" in output) {
    output.card_set = output.cardSet;
    delete output.cardSet;
  }
  if ("set" in output && !("card_set" in output)) {
    output.card_set = output.set;
  }
  if ("cardNumber" in output) {
    output.card_number = output.cardNumber;
    delete output.cardNumber;
  }
  if ("number" in output && !("card_number" in output)) {
    output.card_number = output.number;
  }
  if ("costBasis" in output) {
    output.cost_basis = output.costBasis;
    delete output.costBasis;
  }
  if ("listedOn" in output) {
    output.listed_on = output.listedOn;
    delete output.listedOn;
  }
  if ("frontImgId" in output) {
    output.front_img_id = output.frontImgId;
    delete output.frontImgId;
  }
  if ("backImgId" in output) {
    output.back_img_id = output.backImgId;
    delete output.backImgId;
  }
  if ("priceEstimate" in output) {
    output.price_estimate = output.priceEstimate;
    delete output.priceEstimate;
  }
  if ("priceHistory" in output) {
    output.price_history = output.priceHistory;
    delete output.priceHistory;
  }
  if ("parallelId" in output) {
    output.parallel_id = output.parallelId;
    delete output.parallelId;
  }
  if ("intakeBatchId" in output) {
    output.intake_batch_id = output.intakeBatchId;
    delete output.intakeBatchId;
  }
  if ("purchaseId" in output) {
    output.purchase_id = output.purchaseId;
    delete output.purchaseId;
  }
  if ("playerName" in output) {
    output.player_name = output.playerName;
    delete output.playerName;
  }
  if ("storageLocation" in output) {
    output.storage_location = output.storageLocation;
    delete output.storageLocation;
  }
  if ("acquisitionDate" in output) {
    output.acquisition_date = output.acquisitionDate;
    delete output.acquisitionDate;
  }
  if ("acquisitionSource" in output) {
    output.acquisition_source = output.acquisitionSource;
    delete output.acquisitionSource;
  }
  if ("listingStatus" in output) {
    output.listing_status = output.listingStatus;
    delete output.listingStatus;
  }
  if ("saleStatus" in output) {
    output.sale_status = output.saleStatus;
    delete output.saleStatus;
  }
  if ("marketPrice" in output) {
    output.market_price = output.marketPrice;
    delete output.marketPrice;
  }
  if ("suggestedListingPrice" in output) {
    output.suggested_listing_price = output.suggestedListingPrice;
    delete output.suggestedListingPrice;
  }
  if ("minAcceptablePrice" in output) {
    output.min_acceptable_price = output.minAcceptablePrice;
    delete output.minAcceptablePrice;
  }
  if ("lastCompPrice" in output) {
    output.last_comp_price = output.lastCompPrice;
    delete output.lastCompPrice;
  }
  if ("averageCompPrice" in output) {
    output.average_comp_price = output.averageCompPrice;
    delete output.averageCompPrice;
  }
  if ("psa9Price" in output) {
    output.psa9_price = output.psa9Price;
    delete output.psa9Price;
  }
  if ("psa10Price" in output) {
    output.psa10_price = output.psa10Price;
    delete output.psa10Price;
  }
  if ("profitRealized" in output) {
    output.profit_realized = output.profitRealized;
    delete output.profitRealized;
  }
  if ("soldAt" in output) {
    output.sold_at = output.soldAt;
    delete output.soldAt;
  }
  if ("gradingCandidate" in output) {
    output.grading_candidate = output.gradingCandidate;
    delete output.gradingCandidate;
  }
  if ("cardId" in output) {
    output.card_id = output.cardId;
    delete output.cardId;
  }
  if ("externalListingId" in output) {
    output.external_listing_id = output.externalListingId;
    delete output.externalListingId;
  }
  if ("cardName" in output) {
    output.card_name = output.cardName;
    delete output.cardName;
  }
  if ("listingTitle" in output) {
    output.listing_title = output.listingTitle;
    delete output.listingTitle;
  }
  if ("listingDescription" in output) {
    output.listing_description = output.listingDescription;
    delete output.listingDescription;
  }
  if ("categoryPath" in output) {
    output.category_path = output.categoryPath;
    delete output.categoryPath;
  }
  if ("itemSpecifics" in output) {
    output.item_specifics = output.itemSpecifics;
    delete output.itemSpecifics;
  }
  if ("shippingProfile" in output) {
    output.shipping_profile = output.shippingProfile;
    delete output.shippingProfile;
  }
  if ("imageCount" in output) {
    output.image_count = output.imageCount;
    delete output.imageCount;
  }
  if ("automationState" in output) {
    output.automation_state = output.automationState;
    delete output.automationState;
  }
  if ("pricingStrategy" in output) {
    output.pricing_strategy = output.pricingStrategy;
    delete output.pricingStrategy;
  }
  if ("startPrice" in output) {
    output.start_price = output.startPrice;
    delete output.startPrice;
  }
  if ("buyNowPrice" in output) {
    output.buy_now_price = output.buyNowPrice;
    delete output.buyNowPrice;
  }
  if ("auctionEndDate" in output) {
    output.auction_end_date = output.auctionEndDate;
    delete output.auctionEndDate;
  }
  if ("currentBid" in output) {
    output.current_bid = output.currentBid;
    delete output.currentBid;
  }
  if ("soldPrice" in output) {
    output.sold_price = output.soldPrice;
    delete output.soldPrice;
  }
  if ("soldDate" in output) {
    output.sold_date = output.soldDate;
    delete output.soldDate;
  }
  if ("shippingWeightOz" in output) {
    output.shipping_weight_oz = output.shippingWeightOz;
    delete output.shippingWeightOz;
  }
  if ("exportBatchId" in output) {
    output.export_batch_id = output.exportBatchId;
    delete output.exportBatchId;
  }
  if ("orderId" in output) {
    output.order_id = output.orderId;
    delete output.orderId;
  }
  if ("salePrice" in output) {
    output.sale_price = output.salePrice;
    delete output.salePrice;
  }
  if ("buyerHandle" in output) {
    output.buyer_handle = output.buyerHandle;
    delete output.buyerHandle;
  }
  if ("shippingCost" in output) {
    output.shipping_cost = output.shippingCost;
    delete output.shippingCost;
  }
  if ("packagingCost" in output) {
    output.packaging_cost = output.packagingCost;
    delete output.packagingCost;
  }
  if ("gradingCost" in output) {
    output.grading_cost = output.gradingCost;
    delete output.gradingCost;
  }
  if ("taxCollected" in output) {
    output.tax_collected = output.taxCollected;
    delete output.taxCollected;
  }
  if ("payoutAmount" in output) {
    output.payout_amount = output.payoutAmount;
    delete output.payoutAmount;
  }
  if ("netProfit" in output) {
    output.net_profit = output.netProfit;
    delete output.netProfit;
  }
  if ("listingId" in output) {
    output.listing_id = output.listingId;
    delete output.listingId;
  }

  return output;
}
