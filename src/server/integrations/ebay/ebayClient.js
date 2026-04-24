import { getAccessToken, getEbayCredentials } from "./ebayAuth.js";

const SANDBOX_TRADING = "https://api.sandbox.ebay.com/ws/api.dll";
const PROD_TRADING = "https://api.ebay.com/ws/api.dll";
const SANDBOX_INVENTORY = "https://api.sandbox.ebay.com/sell/inventory/v1";
const PROD_INVENTORY = "https://api.ebay.com/sell/inventory/v1";
const SANDBOX_FULFILLMENT = "https://api.sandbox.ebay.com/sell/fulfillment/v1";
const PROD_FULFILLMENT = "https://api.ebay.com/sell/fulfillment/v1";

/**
 * Call the eBay Trading API (XML).
 * @param {string} callName
 * @param {string} xmlBody
 * @returns {Promise<string>}
 */
export async function tradingApiCall(callName, xmlBody) {
  const token = await getAccessToken();
  const creds = getEbayCredentials();
  const url = creds.sandbox ? SANDBOX_TRADING : PROD_TRADING;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  ${xmlBody}
</${callName}Request>`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xml,
  });
  const text = await res.text();
  const ack = text.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  if (ack === "Failure") {
    const errMsg = text.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1] || "Unknown error";
    throw new Error("eBay " + callName + " failed: " + errMsg);
  }
  return text;
}

/**
 * Call the eBay Inventory API (REST).
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<object>}
 */
export async function inventoryApiCall(method, path, body) {
  const token = await getAccessToken();
  const creds = getEbayCredentials();
  const base = creds.sandbox ? SANDBOX_INVENTORY : PROD_INVENTORY;
  const opts = {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("eBay Inventory API error: " + (data.errors?.[0]?.message || res.statusText));
  return data;
}

/**
 * Call the eBay Fulfillment API (REST).
 * @param {string} method
 * @param {string} path
 * @returns {Promise<object>}
 */
export async function fulfillmentApiCall(method, path) {
  const token = await getAccessToken();
  const creds = getEbayCredentials();
  const base = creds.sandbox ? SANDBOX_FULFILLMENT : PROD_FULFILLMENT;
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("eBay Fulfillment API error: " + (data.errors?.[0]?.message || res.statusText));
  return data;
}

/** @returns {Promise<{ orders?: object[], total?: number, next?: string }>} */
export async function getOrders({ limit = 200, offset = 0, filter = null } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (filter) {
    params.set("filter", filter);
  }
  return fulfillmentApiCall("GET", `/order?${params.toString()}`);
}

/** @returns {Promise<string>} eBay ItemID */
export async function addItem(itemXml) {
  const res = await tradingApiCall("AddItem", itemXml);
  return res.match(/<ItemID>(\d+)<\/ItemID>/)?.[1] || null;
}

/** @returns {Promise<string>} eBay ItemID */
export async function addFixedPriceItem(itemXml) {
  const res = await tradingApiCall("AddFixedPriceItem", itemXml);
  return res.match(/<ItemID>(\d+)<\/ItemID>/)?.[1] || null;
}

/** @returns {Promise<string>} eBay ItemID */
export async function reviseItem(itemXml) {
  const res = await tradingApiCall("ReviseItem", itemXml);
  return res.match(/<ItemID>(\d+)<\/ItemID>/)?.[1] || null;
}

/** @returns {Promise<void>} */
export async function endItem(itemId, reason = "NotAvailable") {
  await tradingApiCall("EndItem", `<ItemID>${itemId}</ItemID><EndingReason>${reason}</EndingReason>`);
}

/** @returns {Promise<object>} */
export async function createInventoryItem(sku, data) {
  return inventoryApiCall("PUT", "/inventory_item/" + encodeURIComponent(sku), data);
}

/** @returns {Promise<{ offerId: string }>} */
export async function createOffer(offerData) {
  return inventoryApiCall("POST", "/offer", offerData);
}

/** @returns {Promise<{ listingId: string }>} */
export async function publishOffer(offerId) {
  return inventoryApiCall("POST", "/offer/" + encodeURIComponent(offerId) + "/publish", {});
}
