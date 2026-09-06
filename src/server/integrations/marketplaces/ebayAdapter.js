import { REVIEWED_DEFINITION } from "../../services/batchPublish/reviewedDefinition.js";
import { MarketplaceAdapter } from "./marketplaceAdapter.js";
import { get } from "../../database.js";
import { readImageFile } from "../../services/imageStore.js";
import { getEbayStatus } from "../ebay/ebayAuth.js";
import { addItem, addFixedPriceItem, reviseItem, endItem, getOrders, uploadSiteHostedPictures } from "../ebay/ebayClient.js";
import { listingToTradingXml } from "../ebay/ebayMapper.js";

// Upload the item's stored front/back images to eBay Picture Services.
// Per-image failures are tolerated — a listing without one photo is still
// better than a failed publish.
async function collectPictureUrls(item) {
  const urls = [];
  for (const imageId of [item.front_img_id, item.back_img_id]) {
    if (!imageId) continue;
    const stored = readImageFile(imageId);
    if (!stored) continue;
    try {
      const url = await uploadSiteHostedPictures(stored.buffer, stored.mime);
      if (url) urls.push(url);
    } catch {
      // non-fatal: continue with whatever uploaded
    }
  }
  return urls;
}

export class EbayAdapter extends MarketplaceAdapter {
  constructor() { super("ebay"); }

  isConnected() {
    return getEbayStatus().connected;
  }

  getShippingProfile(country = "CA") {
    return {
      originCountry: country,
      shippingService: country === "CA" ? "CA_StandardInternationalFlat" : "USPSFirstClass",
      shippingCost: country === "CA" ? 4.99 : 3.99,
      dispatchDays: 3,
    };
  }

  /**
   * Publish a listing to eBay. Uses real API if connected, falls back to stub.
   * The item row is loaded from the DB — publishService's second argument is
   * an options object, not the item.
   * @param {object} listing
   * @returns {Promise<object>}
   */
  async publish(listing, options = {}) {
    const reviewed = options[REVIEWED_DEFINITION];
    if (reviewed) {
      if (!this.isConnected()) { const error = new Error("eBay disconnected; approved listing was not sent"); error.notSent = true; throw error; }
      const externalListingId = await addFixedPriceItem(reviewed.itemXml, { beforeSend: reviewed.beforeSend, compatibilityLevel: "1475" });
      return { marketplace: this.marketplace, externalListingId, status: "active", payload: { reviewed: true }, syncedAt: new Date().toISOString() };
    }
    if (!this.isConnected()) return super.publish(listing);

    const item = (listing.card_id
      && get(`SELECT * FROM user_items WHERE id = ?`, [listing.card_id])) || {};
    const pictureUrls = await collectPictureUrls(item);
    const isAuction = listing.format === "auction";
    let externalId;

    if (isAuction) {
      const xml = listingToTradingXml(listing, item, { pictureUrls });
      externalId = await addItem(xml);
    } else {
      // Use the existing Trading implementation directly. Retrying through a
      // different API after a timeout can create a second live listing.
      const xml = listingToTradingXml(listing, item, { pictureUrls });
      externalId = await addFixedPriceItem(xml);
    }

    return {
      marketplace: this.marketplace,
      externalListingId: externalId,
      status: "active",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Revise a listing on eBay.
   */
  async revise(listing, overrides = {}) {
    if (!this.isConnected()) return super.revise(listing, overrides);
    const merged = { ...listing, ...overrides };
    const xml = listingToTradingXml(merged, merged);
    const itemXml = xml.replace("</Item>", "<ItemID>" + (listing.external_listing_id || listing.externalListingId) + "</ItemID></Item>");
    await reviseItem(itemXml);
    return { marketplace: this.marketplace, externalListingId: listing.external_listing_id || listing.externalListingId, status: "revised", syncedAt: new Date().toISOString() };
  }

  /**
   * End a listing on eBay.
   */
  async end(listing) {
    if (!this.isConnected()) return super.end(listing);
    const itemId = listing.external_listing_id || listing.externalListingId;
    if (itemId) await endItem(itemId);
    return { marketplace: this.marketplace, externalListingId: itemId, status: "ended", syncedAt: new Date().toISOString() };
  }

  buildListingSku(listing) {
    return `CV-${listing.id}`;
  }

  buildOrderSearchFilter(listing) {
    const createdAt = Date.parse(listing.created_at || listing.createdAt || "");
    const now = Date.now();
    const fallbackStart = now - (1000 * 60 * 60 * 24 * 90);
    const startTime = Number.isFinite(createdAt) ? createdAt : fallbackStart;
    return `creationdate:[${new Date(startTime).toISOString()}..]`;
  }

  readAmountValue(amountLike) {
    const value = amountLike?.value ?? amountLike;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  findMatchingLineItem(order, listing) {
    const itemId = String(listing.external_listing_id || listing.externalListingId || "");
    const sku = this.buildListingSku(listing);
    return (order?.lineItems || []).find((lineItem) =>
      String(lineItem?.legacyItemId || "") === itemId ||
      String(lineItem?.sku || "") === sku,
    ) || null;
  }

  extractShippingAddress(order) {
    const shipTo = order?.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
    const buyerAddress = order?.buyer?.buyerRegistrationAddress?.contactAddress;
    return shipTo || buyerAddress || null;
  }

  computeLineItemTax(lineItem) {
    if (!Array.isArray(lineItem?.taxes)) return null;
    const values = lineItem.taxes
      .map((tax) => this.readAmountValue(tax?.amount))
      .filter((value) => value != null);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0);
  }

  extractFinancials(order, lineItem) {
    return {
      salePrice:
        this.readAmountValue(lineItem?.total) ??
        this.readAmountValue(order?.pricingSummary?.total) ??
        this.readAmountValue(order?.pricingSummary?.priceSubtotal),
      shippingCharge:
        this.readAmountValue(lineItem?.deliveryCost?.shippingCost) ??
        this.readAmountValue(order?.pricingSummary?.deliveryCost),
      taxCollected:
        this.computeLineItemTax(lineItem) ??
        this.readAmountValue(order?.pricingSummary?.tax),
      payoutAmount:
        this.readAmountValue(order?.paymentSummary?.totalDueSeller) ??
        this.readAmountValue(order?.paymentSummary?.payments?.[0]?.amount),
    };
  }

  buildSoldPayload(order, lineItem) {
    const shippingAddress = this.extractShippingAddress(order);
    const financials = this.extractFinancials(order, lineItem);
    return {
      orderId: order?.orderId || null,
      externalOrderId: order?.orderId || null,
      buyerHandle: order?.buyer?.username || order?.buyer?.userId || null,
      salePrice: financials.salePrice,
      shippingCharge: financials.shippingCharge,
      taxCollected: financials.taxCollected,
      payoutAmount: financials.payoutAmount,
      shippingAddress: shippingAddress
        ? {
            countryCode: shippingAddress.countryCode || null,
            postalCode: shippingAddress.postalCode || null,
            city: shippingAddress.city || null,
            stateOrProvince: shippingAddress.stateOrProvince || null,
          }
        : null,
      lineItemId: lineItem?.lineItemId || null,
      legacyItemId: lineItem?.legacyItemId || null,
      sku: lineItem?.sku || null,
    };
  }

  async fetchRemoteOrderForListing(listing) {
    const itemId = listing.external_listing_id || listing.externalListingId;
    if (!itemId) return null;

    const limit = 200;
    const filter = this.buildOrderSearchFilter(listing);
    let offset = 0;
    while (true) {
      const response = await getOrders({ limit, offset, filter });
      const orders = Array.isArray(response?.orders) ? response.orders : [];
      const match = orders.find((order) => this.findMatchingLineItem(order, listing));
      if (match) return match;
      if (orders.length < limit) break;
      offset += limit;
    }

    return null;
  }

  async sync(listing) {
    if (!this.isConnected()) {
      return super.sync(listing);
    }

    const itemId = listing.external_listing_id || listing.externalListingId;
    if (!itemId) {
      return { marketplace: this.marketplace, externalListingId: null,
        status: listing.channel_status || listing.channelStatus || "draft", payload: listing };
    }

    const order = await this.fetchRemoteOrderForListing(listing);
    if (!order) {
      return {
        marketplace: this.marketplace,
        externalListingId: itemId,
        status: listing.channel_status || listing.channelStatus || listing.status || "draft",
        payload: listing,
        syncedAt: new Date().toISOString(),
      };
    }

    const lineItem = this.findMatchingLineItem(order, listing);
    return {
      marketplace: this.marketplace,
      externalListingId: itemId,
      status: "sold",
      payload: this.buildSoldPayload(order, lineItem),
      syncedAt: new Date().toISOString(),
    };
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Action: "Add", Format: listing.format === "auction" ? "Auction" : "FixedPrice",
      Title: mapped.title, Description: mapped.description,
      StartPrice: mapped.price, Category: mapped.category,
      Quantity: mapped.quantity, "Shipping Service": mapped.shippingService,
      "Shipping Cost": mapped.shippingCost, Condition: mapped.condition,
    };
  }
}
