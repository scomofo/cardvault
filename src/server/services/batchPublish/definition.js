import { createHash } from "node:crypto";

export function digest(value) {
  const stable = (input) => Array.isArray(input) ? input.map(stable)
    : input && typeof input === "object" ? Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])])) : input;
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex");
}
export function fail(message, status = 409) { const error = new Error(message); error.status = status; throw error; }
export const ID = /^[a-zA-Z0-9_-]{1,120}$/;
export function normalizeConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Invalid publication configuration", 400);
  const config = {};
  for (const key of ["fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"]) {
    if (typeof input[key] !== "string" || !/^\d{1,30}$/.test(input[key])) fail(`Choose an eBay ${key.replace("PolicyId", "")} policy`, 400);
    config[key] = input[key];
  }
  config.postalCode = String(input.postalCode || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(config.postalCode)) fail("Enter a Canadian ship-from postal code", 400);
  for (const key of ["sport", "manufacturer"]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 120) fail(`Enter the ${key} to use where the card has no saved value`, 400);
    config[key] = input[key].trim();
  }
  return config;
}
const RAW = { gem_mint: "400010", mint: "400010", near_mint: "400010", excellent: "400011", very_good: "400012", good: "400013", fair: "400013", poor: "400013" };
export function money(value, label, positive = false) {
  if (value == null || value === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) || Number(value) < (positive ? 0.01 : 0) || Number(value) > 1000000) fail(`Invalid ${label}`, 400);
  return Math.round(Number(value) * 100) / 100;
}
export function choosePolicies(config, all) {
  const select = (key, collection) => {
    const policy = all[collection]?.find((entry) => entry[key] === config[key] && entry.marketplaceId === "EBAY_CA");
    if (!policy) fail("A selected eBay Canada policy is missing. Reload policies and check again.");
    return policy;
  };
  const fulfillment = select("fulfillmentPolicyId", "fulfillmentPolicies");
  const payment = select("paymentPolicyId", "paymentPolicies"), returns = select("returnPolicyId", "returnPolicies");
  const options = fulfillment.shippingOptions || [], domestic = options[0], services = domestic?.shippingServices || [];
  // Every approved shipping amount must match the one rate the buyer sees.
  if (options.length !== 1 || domestic.optionType !== "DOMESTIC" || domestic.costType !== "FLAT_RATE" || services.length !== 1 || domestic.rateTableId || domestic.shippingDiscountProfileId || domestic.shippingPromotionOffered || Number(domestic.packageHandlingCost?.value || 0) || fulfillment.globalShipping || fulfillment.pickupDropOff || fulfillment.freightShipping) {
    fail("Choose a domestic, single-service, flat-rate shipping policy without rate tables or promotions.");
  }
  const service = services[0];
  if (service.buyerResponsibleForShipping || service.buyerResponsibleForPickup) fail("Buyer-arranged shipping is not supported for batch publication.");
  if (!service.freeShipping && service.shippingCost?.currency !== "CAD") fail("The shipping policy must charge CAD.");
  const shipping = service.freeShipping === true ? 0 : money(service.shippingCost?.value, "policy shipping");
  return { fulfillment, payment, returns, shipping, service: service.shippingServiceCode || "" };
}
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function buildDefinition(listing, item, config, policies, pictureUrls) {
  if (listing.platform !== "ebay" || listing.format !== "fixed" || Number(listing.quantity ?? 1) !== 1 || item.type !== "sports" || !RAW[item.condition]) fail("Batch publication supports inspected raw sports-card singles, eBay fixed price, quantity one only.");
  const title = listing.listing_title || "", description = listing.listing_description || "";
  if (!title.trim() || title.length > 80 || !description.trim() || description.length > 10000) fail("Review the draft title (up to 80 characters) and description.");
  const price = money(listing.start_price, "price", true), shipping = money(listing.shipping, "buyer shipping");
  if (shipping !== policies.shipping) fail(`Draft shipping is CAD ${shipping.toFixed(2)}, but the selected policy charges CAD ${policies.shipping.toFixed(2)}. Correct the draft or choose a matching policy.`);
  if (pictureUrls.length !== 2 || pictureUrls.some((url) => !/^https:\/\/[^\s<>]+$/.test(url))) fail("Both card photos must upload to eBay before checking.");
  const specifics = { Sport: item.sport || config.sport, "Player/Athlete": item.player_name || item.name, Team: item.team, Set: item.card_set, "Card Number": item.card_number, Season: item.year, Manufacturer: item.manufacturer || config.manufacturer, "Parallel/Variety": item.parallel };
  return `<Item><Title>${esc(title)}</Title><Description><![CDATA[${description.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></Description>
<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory><StartPrice currencyID="CAD">${price.toFixed(2)}</StartPrice>
<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>${RAW[item.condition]}</Value></ConditionDescriptor></ConditionDescriptors>
<Country>CA</Country><Currency>CAD</Currency><PostalCode>${esc(config.postalCode)}</PostalCode><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType><Quantity>1</Quantity><SKU>${esc(`CV-${listing.id}`)}</SKU>
<PictureDetails>${pictureUrls.map((url) => `<PictureURL>${esc(url)}</PictureURL>`).join("")}</PictureDetails>
<ItemSpecifics>${Object.entries(specifics).filter(([, value]) => value != null && value !== "").map(([name, value]) => `<NameValueList><Name>${esc(name)}</Name><Value>${esc(value)}</Value></NameValueList>`).join("")}</ItemSpecifics>
<SellerProfiles><SellerPaymentProfile><PaymentProfileID>${config.paymentPolicyId}</PaymentProfileID></SellerPaymentProfile><SellerReturnProfile><ReturnProfileID>${config.returnPolicyId}</ReturnProfileID></SellerReturnProfile><SellerShippingProfile><ShippingProfileID>${config.fulfillmentPolicyId}</ShippingProfileID></SellerShippingProfile></SellerProfiles></Item>`;
}
export function contentFingerprint(listing, item, images, config, accountKey, policies) {
  const relevantListing = Object.fromEntries(["id", "card_id", "platform", "format", "quantity", "listing_title", "listing_description", "start_price", "shipping", "shipping_profile", "item_specifics"].map((key) => [key, listing[key] ?? null]));
  const relevantItem = { ...item }; delete relevantItem.updated_at; delete relevantItem.listing_status;
  return digest({ listing: relevantListing, item: relevantItem, photos: images.map((image) => [image.mime, digest(image.buffer)]), config, accountKey, policies });
}
