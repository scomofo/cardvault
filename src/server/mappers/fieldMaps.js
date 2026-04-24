export const ITEM_FIELD_MAP = {
  intake_batch_id: "intakeBatchId",
  purchase_id: "purchaseId",
  player_name: "playerName",
  manufacturer: "manufacturer",
  sport: "sport",
  team: "team",
  card_set: "set",
  card_number: "number",
  storage_location: "storageLocation",
  cost_basis: "costBasis",
  acquisition_date: "acquisitionDate",
  acquisition_source: "acquisitionSource",
  listing_status: "listingStatus",
  sale_status: "saleStatus",
  listed_on: "listedOn",
  front_img_id: "frontImgId",
  back_img_id: "backImgId",
  front_img_phash: "frontImgPhash",
  price_estimate: "priceEstimate",
  price_history: "priceHistory",
  market_price: "marketPrice",
  suggested_listing_price: "suggestedListingPrice",
  min_acceptable_price: "minAcceptablePrice",
  last_comp_price: "lastCompPrice",
  average_comp_price: "averageCompPrice",
  psa9_price: "psa9Price",
  psa10_price: "psa10Price",
  profit_realized: "profitRealized",
  sold_at: "soldAt",
  parallel_id: "parallelId",
  created_at: "createdAt",
  updated_at: "updatedAt",
  grading_candidate: "gradingCandidate",
  projected_grade: "projectedGrade",
  vault_status: "vaultStatus",
  condition_report: "conditionReport",
  cv_centering_lr: "cvCenteringLr",
  cv_centering_tb: "cvCenteringTb",
  cv_centering_score: "cvCenteringScore",
  cv_processed: "cvProcessed",
  ebay_centering: "ebayCentering",
  ebay_corner_sharpness: "ebayCornerSharpness",
  ebay_edge_chipping: "ebayEdgeChipping",
};

export const SALE_FIELD_MAP = {
  card_id: "cardId",
  order_id: "orderId",
  card_name: "cardName",
  card_set: "cardSet",
  sale_price: "salePrice",
  cost_basis: "costBasis",
  fees: "fees",
  platform: "platform",
  buyer_handle: "buyerHandle",
  shipping_cost: "shippingCost",
  packaging_cost: "packagingCost",
  grading_cost: "gradingCost",
  tax_collected: "taxCollected",
  payout_amount: "payoutAmount",
  net_profit: "netProfit",
  listing_id: "listingId",
  date: "date",
};

export const PURCHASE_FIELD_MAP = {
  card_set: "cardSet",
  total_cost: "totalCost",
  created_at: "createdAt",
};

export const MARKETPLACE_CONNECTION_FIELD_MAP = {
  account_label: "accountLabel",
  auth_status: "authStatus",
  token_expires_at: "tokenExpiresAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

export const TRADE_FIELD_MAP = {
  gave_value: "gaveValue",
  received_value: "receivedValue",
  created_at: "createdAt",
};

export const WATCHLIST_FIELD_MAP = {
  card_set: "cardSet",
  card_number: "cardNumber",
  target_price: "targetPrice",
  current_price: "currentPrice",
  price_history: "priceHistory",
  created_at: "createdAt",
};

export const GRADING_FIELD_MAP = {
  card_name: "cardName",
  card_set: "cardSet",
  card_number: "cardNumber",
  date_sent: "dateSent",
  pre_value: "preValue",
  cert_number: "certNumber",
  post_value: "postValue",
  created_at: "createdAt",
};

export const LEAGUE_FIELD_MAP = {
  sport_type: "sportType",
  created_at: "createdAt",
};

export const MANUFACTURER_FIELD_MAP = {
  licensing_status: "licensingStatus",
  created_at: "createdAt",
};

export const TEAM_FIELD_MAP = {
  league_id: "leagueId",
  league_name: "leagueName",
  created_at: "createdAt",
};

export const CARD_SET_FIELD_MAP = {
  manufacturer_id: "manufacturerId",
  manufacturer_name: "manufacturerName",
  set_name: "setName",
  parent_set_id: "parentSetId",
  sport_type: "sportType",
  release_date: "releaseDate",
  created_at: "createdAt",
};

export const PLAYER_FIELD_MAP = {
  first_name: "firstName",
  last_name: "lastName",
  team_id: "teamId",
  team_name: "teamName",
  is_rookie: "isRookie",
  created_at: "createdAt",
};

export const CARD_REF_FIELD_MAP = {
  set_id: "setId",
  player_id: "playerId",
  first_name: "firstName",
  last_name: "lastName",
  card_number: "cardNumber",
  is_base: "isBase",
  is_rookie: "isRookie",
  has_autograph: "hasAutograph",
  is_memorabilia: "isMemorabilia",
  is_short_print: "isShortPrint",
  error_type: "errorType",
  created_at: "createdAt",
};

export const PARALLEL_FIELD_MAP = {
  card_id: "cardId",
  variation_name: "variationName",
  print_run: "printRun",
  is_1of1: "is1of1",
  created_at: "createdAt",
};

export const ORDER_FIELD_MAP = {
  sale_id: "saleId",
  listing_id: "listingId",
  item_id: "itemId",
  external_order_id: "externalOrderId",
  buyer_handle: "buyerHandle",
  sale_price: "salePrice",
  shipping_charge: "shippingCharge",
  tax_collected: "taxCollected",
  destination_country: "destinationCountry",
  destination_postal_code: "destinationPostalCode",
  payment_status: "paymentStatus",
  fulfillment_status: "fulfillmentStatus",
  sold_at: "soldAt",
  created_at: "createdAt",
  shipment_id: "shipmentId",
  tracking_number: "trackingNumber",
  label_url: "labelUrl",
  shipment_status: "shipmentStatus",
  service_level: "serviceLevel",
  shipped_at: "shippedAt",
};

export const LISTING_FIELD_MAP = {
  card_id: "cardId",
  external_listing_id: "externalListingId",
  card_name: "cardName",
  card_set: "cardSet",
  card_number: "cardNumber",
  listing_title: "listingTitle",
  listing_description: "listingDescription",
  category_path: "categoryPath",
  item_specifics: "itemSpecifics",
  shipping_profile: "shippingProfile",
  image_count: "imageCount",
  automation_state: "automationState",
  pricing_strategy: "pricingStrategy",
  publish_status: "publishStatus",
  start_price: "startPrice",
  buy_now_price: "buyNowPrice",
  auction_end_date: "auctionEndDate",
  shipping_weight_oz: "shippingWeightOz",
  export_batch_id: "exportBatchId",
  current_bid: "currentBid",
  sold_price: "soldPrice",
  sold_date: "soldDate",
  created_at: "createdAt",
};
