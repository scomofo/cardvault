import { createHash } from "node:crypto";
import { ungradedCardCondition } from "../../../lib/listingContent.js";

export function digest(value) {
  const stable = (input) => Array.isArray(input) ? input.map(stable)
    : input && typeof input === "object" ? Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])])) : input;
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex");
}

export function fail(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  error.code = "EBAY_PREPARATION_FAILED";
  throw error;
}

export function normalizeConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Invalid selling preferences", 400);
  const config = {};
  for (const key of ["fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"]) {
    if (typeof input[key] !== "string" || !/^\d{1,30}$/.test(input[key])) fail(`Choose an eBay ${key.replace("PolicyId", "")} policy`, 400);
    config[key] = input[key];
  }
  config.postalCode = String(input.postalCode || "").replace(/\s/g, "").toUpperCase();
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(config.postalCode)) fail("Enter a Canadian ship-from postal code", 400);
  for (const key of ["sport", "manufacturer"]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 120) fail(`Enter the ${key} to use where the card has no saved value`, 400);
    config[key] = input[key].trim();
  }
  return config;
}

function money(value, label, positive = false) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < (positive ? 0.01 : 0) || Number(value) > 1000000) fail(`Invalid ${label}`, 400);
  return Math.round(Number(value) * 100) / 100;
}

export function choosePolicies(config, all) {
  const select = (key, collection) => {
    const entries = all?.[collection];
    const policy = Array.isArray(entries) && entries.find((entry) => entry?.[key] === config[key] && entry.marketplaceId === "EBAY_CA");
    if (!policy) fail("A selected eBay Canada policy is missing. Reload policies and check again.");
    return policy;
  };
  const fulfillment = select("fulfillmentPolicyId", "fulfillmentPolicies");
  const payment = select("paymentPolicyId", "paymentPolicies"), returns = select("returnPolicyId", "returnPolicies");
  const options = fulfillment.shippingOptions, domestic = options?.[0], services = domestic?.shippingServices;
  // Keep the reviewed buyer charge exact. Destination-dependent and alternate rates
  // need a richer review UI; never silently treat their first rate as universal.
  if (!Array.isArray(options) || options.length !== 1 || domestic?.optionType !== "DOMESTIC" || domestic.costType !== "FLAT_RATE" || !Array.isArray(services) || services.length !== 1 || domestic.rateTableId || domestic.shippingDiscountProfileId || domestic.shippingPromotionOffered || fulfillment.globalShipping || fulfillment.pickupDropOff || fulfillment.localPickup || fulfillment.freightShipping) {
    fail("Choose a domestic, single-service, flat-rate shipping policy without rate tables, promotions or pickup.");
  }
  if (domestic.packageHandlingCost && money(domestic.packageHandlingCost.value, "policy handling charge") !== 0) fail("Shipping policies with an extra handling charge are not supported.");
  const service = services[0];
  if (!service || typeof service.shippingServiceCode !== "string" || !service.shippingServiceCode.trim() || service.buyerResponsibleForShipping || service.buyerResponsibleForPickup) fail("Choose one supported shipping service; buyer-arranged shipping is not supported.");
  if (service.freeShipping != null && typeof service.freeShipping !== "boolean") fail("The shipping policy has an invalid free-shipping setting.");
  if (service.freeShipping !== true && service.shippingCost?.currency !== "CAD") fail("The shipping policy must charge CAD.");
  const shipping = service.freeShipping === true ? 0 : money(service.shippingCost?.value, "policy shipping");
  if (service.freeShipping === true && service.shippingCost && money(service.shippingCost.value, "policy shipping") !== 0) fail("The free-shipping policy also includes a charge. Correct the policy before checking.");
  return { fulfillment, payment, returns, shipping, service: service.shippingServiceCode };
}

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const field = (row, snake, camel) => row[snake] ?? row[camel];
function definitionContent(listing, item) {
  return {
    listing: {
      id: listing.id, cardId: field(listing, "card_id", "cardId"), platform: listing.platform, format: listing.format,
      quantity: listing.quantity ?? 1, title: field(listing, "listing_title", "listingTitle") ?? "",
      description: field(listing, "listing_description", "listingDescription") ?? "", price: field(listing, "start_price", "startPrice"), shipping: listing.shipping,
    },
    item: {
      type: item.type, condition: ungradedCardCondition(item.condition)?.value ?? item.condition,
      sport: item.sport, player: field(item, "player_name", "playerName") || item.name, team: item.team,
      set: field(item, "card_set", "cardSet"), number: field(item, "card_number", "cardNumber"),
      year: item.year, manufacturer: item.manufacturer, parallel: item.parallel,
    },
  };
}

export function buildDefinition(listing, item, config, policies, pictureUrls) {
  const content = definitionContent(listing, item), draft = content.listing, card = content.item;
  const condition = ungradedCardCondition(card.condition);
  if (draft.platform !== "ebay" || draft.format !== "fixed" || Number(draft.quantity) !== 1 || card.type !== "sports" || !condition) fail("Checked publication supports inspected raw sports-card singles, eBay fixed price, quantity one only.");
  const title = draft.title, description = draft.description;
  if (typeof title !== "string" || !title.trim() || title.length > 80 || typeof description !== "string" || !description.trim() || description.length > 30000) fail("Review the draft title (up to 80 characters) and description (up to 30,000 characters).");
  const price = money(draft.price, "price", true), shipping = money(draft.shipping, "buyer shipping");
  if (shipping !== policies.shipping) fail(`Draft shipping is CAD ${shipping.toFixed(2)}, but the selected policy charges CAD ${policies.shipping.toFixed(2)}. Correct the draft or choose a matching policy.`);
  if (!Array.isArray(pictureUrls) || pictureUrls.length !== 2 || pictureUrls.some((url) => typeof url !== "string" || !/^https:\/\/[^\s<>]+$/.test(url))) fail("Both card photos must upload to eBay before checking.");
  const specifics = { Sport: card.sport || config.sport, "Player/Athlete": card.player, Team: card.team, Set: card.set, "Card Number": card.number, Season: card.year, Manufacturer: card.manufacturer || config.manufacturer, "Parallel/Variety": card.parallel };
  return `<Item><Title>${esc(title)}</Title><Description><![CDATA[${description.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></Description>
<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory><StartPrice currencyID="CAD">${price.toFixed(2)}</StartPrice>
<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>${condition.descriptor}</Value></ConditionDescriptor></ConditionDescriptors>
<Country>CA</Country><Currency>CAD</Currency><PostalCode>${esc(config.postalCode)}</PostalCode><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType><Quantity>1</Quantity><SKU>${esc(`CV-${draft.id}`)}</SKU>
<PictureDetails>${pictureUrls.map((url) => `<PictureURL>${esc(url)}</PictureURL>`).join("")}</PictureDetails>
<ItemSpecifics>${Object.entries(specifics).filter(([, value]) => value != null && value !== "").map(([name, value]) => `<NameValueList><Name>${esc(name)}</Name><Value>${esc(value)}</Value></NameValueList>`).join("")}</ItemSpecifics>
<SellerProfiles><SellerPaymentProfile><PaymentProfileID>${config.paymentPolicyId}</PaymentProfileID></SellerPaymentProfile><SellerReturnProfile><ReturnProfileID>${config.returnPolicyId}</ReturnProfileID></SellerReturnProfile><SellerShippingProfile><ShippingProfileID>${config.fulfillmentPolicyId}</ShippingProfileID></SellerShippingProfile></SellerProfiles></Item>`;
}

export function contentFingerprint(listing, item, images, config, accountKey, policies) {
  // Lifecycle timestamps, private costs and storage notes are intentionally absent:
  // claiming publication must not invalidate an otherwise identical reviewed draft.
  return digest({ ...definitionContent(listing, item), photos: images.map((image) => [image.mime, digest(image.buffer)]), config, accountKey, policies });
}
