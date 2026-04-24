import {
  sendValidationError,
  validateArray,
  validateNumberLike,
  validateRequestShape,
  validateStringLike,
} from "./common.js";

function validateFields(validators) {
  for (const validator of validators) {
    const error = validator();
    if (error) return error;
  }
  return null;
}

export function validateItemPayload(req, res, next) {
  const body = req.body;
  const rootError = validateRequestShape(body);
  if (rootError) return sendValidationError(res, rootError);

  const error = validateFields([
    () => validateStringLike(body.id, "id"),
    () => validateStringLike(body.name, "name"),
    () => validateStringLike(body.playerName ?? body.player_name, "playerName"),
    () => validateStringLike(body.manufacturer, "manufacturer"),
    () => validateStringLike(body.sport, "sport"),
    () => validateStringLike(body.team, "team"),
    () => validateStringLike(body.set, "set"),
    () => validateStringLike(body.card_set, "card_set"),
    () => validateStringLike(body.number, "number"),
    () => validateStringLike(body.card_number, "card_number"),
    () =>
      validateStringLike(
        body.gradingDecision ?? body.grading_decision,
        "gradingDecision",
      ),
    () =>
      validateStringLike(
        body.storageLocation ?? body.storage_location,
        "storageLocation",
      ),
    () => validateNumberLike(body.costBasis, "costBasis"),
    () => validateNumberLike(body.cost_basis, "cost_basis"),
    () => validateNumberLike(body.marketPrice ?? body.market_price, "marketPrice"),
    () =>
      validateNumberLike(
        body.suggestedListingPrice ?? body.suggested_listing_price,
        "suggestedListingPrice",
      ),
    () =>
      validateNumberLike(
        body.minAcceptablePrice ?? body.min_acceptable_price,
        "minAcceptablePrice",
      ),
    () => validateNumberLike(body.lastCompPrice ?? body.last_comp_price, "lastCompPrice"),
    () =>
      validateNumberLike(
        body.averageCompPrice ?? body.average_comp_price,
        "averageCompPrice",
      ),
    () => validateNumberLike(body.psa9Price ?? body.psa9_price, "psa9Price"),
    () => validateNumberLike(body.psa10Price ?? body.psa10_price, "psa10Price"),
    () => validateNumberLike(body.profitRealized ?? body.profit_realized, "profitRealized"),
    () => validateArray(body.listedOn, "listedOn"),
    () => validateArray(body.listed_on, "listed_on"),
    () => validateArray(body.priceHistory, "priceHistory"),
    () => validateArray(body.price_history, "price_history"),
  ]);

  if (error) return sendValidationError(res, error);
  if (!body.name && !body.card_name) return sendValidationError(res, "name required");
  next();
}

export function validateSalePayload(req, res, next) {
  const body = req.body;
  const rootError = validateRequestShape(body);
  if (rootError) return sendValidationError(res, rootError);

  const salePrice = body.salePrice ?? body.sale_price;
  const error =
    validateFields([
      () => validateNumberLike(salePrice, "salePrice"),
      () => validateNumberLike(body.costBasis ?? body.cost_basis, "costBasis"),
      () =>
        validateNumberLike(
          body.shippingCost ?? body.shipping_cost,
          "shippingCost",
        ),
      () =>
        validateNumberLike(
          body.packagingCost ?? body.packaging_cost,
          "packagingCost",
        ),
      () =>
        validateNumberLike(
          body.gradingCost ?? body.grading_cost,
          "gradingCost",
        ),
      () =>
        validateNumberLike(
          body.taxCollected ?? body.tax_collected,
          "taxCollected",
        ),
      () =>
        validateNumberLike(
          body.payoutAmount ?? body.payout_amount,
          "payoutAmount",
        ),
      () => validateNumberLike(body.netProfit ?? body.net_profit, "netProfit"),
    ]) || ((salePrice == null || salePrice === "") && !body.orderId && !body.order_id
      ? "sale_price required"
      : null)
    || (!body.cardId && !body.card_id && !body.listingId && !body.listing_id
      && !body.orderId && !body.order_id
      ? "card_id, listing_id, or order_id required"
      : null);

  if (error) return sendValidationError(res, error);
  next();
}

export function validateListingPayload(req, res, next) {
  const body = req.body;
  const rootError = validateRequestShape(body);
  if (rootError) return sendValidationError(res, rootError);

  const error =
    validateFields([
      () => validateStringLike(body.id, "id"),
      () =>
        validateNumberLike(body.startPrice ?? body.start_price, "startPrice"),
      () =>
        validateNumberLike(
          body.buyNowPrice ?? body.buy_now_price,
          "buyNowPrice",
        ),
      () => validateNumberLike(body.shipping, "shipping"),
      () =>
        validateNumberLike(
          body.shippingWeightOz ?? body.shipping_weight_oz,
          "shippingWeightOz",
        ),
      () =>
        validateNumberLike(body.currentBid ?? body.current_bid, "currentBid"),
      () => validateNumberLike(body.soldPrice ?? body.sold_price, "soldPrice"),
    ]) || (!body.platform ? "platform required" : null)
    || (!body.cardId && !body.card_id ? "card_id required" : null);

  if (error) return sendValidationError(res, error);
  next();
}

export function validateSettingsPayload(req, res, next) {
  const error = validateRequestShape(req.body);
  if (error) return sendValidationError(res, error);
  next();
}

export function validateMigrationPayload(req, res, next) {
  const body = req.body;
  const rootError = validateRequestShape(body);
  if (rootError) return sendValidationError(res, rootError);

  const collections = [
    "catalog",
    "items",
    "sales",
    "orders",
    "listings",
    "trades",
    "watchlist",
    "gradings",
    "purchases",
  ];

  for (const key of collections) {
    const error = validateArray(body[key], key);
    if (error) return sendValidationError(res, error);
  }

  if (body.settings != null && typeof body.settings !== "object") {
    return sendValidationError(res, "settings must be an object");
  }

  next();
}
