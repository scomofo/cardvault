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
      ["listedOn", "priceEstimate", "priceHistory"].includes(camelKey) &&
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
  if ("cardNumber" in output) {
    output.card_number = output.cardNumber;
    delete output.cardNumber;
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
  if ("cardId" in output) {
    output.card_id = output.cardId;
    delete output.cardId;
  }
  if ("cardName" in output) {
    output.card_name = output.cardName;
    delete output.cardName;
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
  if ("salePrice" in output) {
    output.sale_price = output.salePrice;
    delete output.salePrice;
  }
  if ("shippingCost" in output) {
    output.shipping_cost = output.shippingCost;
    delete output.shippingCost;
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
