import { getAccessToken, getEbayCredentials, getEbayStatus } from "./ebayAuth.js";
import { get } from "../../database.js";
import { digest, fail } from "../../services/batchPublish/definition.js";

export function batchAccount() {
  const creds = getEbayCredentials();
  if (!creds || !getEbayStatus().connected) fail("Connect eBay in Settings before checking or publishing.");
  const identity = get("SELECT value FROM settings WHERE key = 'ebay_refresh_token'")?.value
    || get("SELECT value FROM settings WHERE key = 'ebay_access_token'")?.value;
  if (!identity) fail("Reconnect eBay; no account authorization is available.");
  return { environment: creds.sandbox ? "sandbox" : "production", key: digest([creds.appId, creds.sandbox, identity]) };
}
export async function loadBatchPolicies() {
  const account = batchAccount(), token = await getAccessToken();
  const root = account.environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const entries = await Promise.all(["fulfillment", "payment", "return"].map(async (type) => {
    const response = await fetch(`${root}/sell/account/v1/${type}_policy?marketplace_id=EBAY_CA`, {
      signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) fail(`eBay ${type} policies could not be loaded (HTTP ${response.status}). Check account access and business policies.`, 502);
    const data = await response.json();
    return [`${type}Policies`, data[`${type}Policies`] || []];
  }));
  if (account.key !== batchAccount().key) fail("eBay account changed. Reload policies.");
  return { ...Object.fromEntries(entries), environment: account.environment };
}
function tag(xml, name) { return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] || ""; }
function text(xml) {
  return String(xml).replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
export function parseVerification(xml) {
  if (typeof xml !== "string" || !/<VerifyAddFixedPriceItemResponse[\s>]/.test(xml)) fail("eBay returned an invalid verification response; no listing was published.", 502);
  const ack = tag(xml, "Ack");
  if (!["Success", "Warning", "Failure", "PartialFailure"].includes(ack)) fail("eBay returned no recognized verification acknowledgement.", 502);
  const messages = [...xml.matchAll(/<Errors(?:\s[^>]*)?>([\s\S]*?)<\/Errors>/g)].map(([, block]) => ({
    code: text(tag(block, "ErrorCode")), severity: tag(block, "SeverityCode") === "Warning" ? "warning" : "error",
    message: text(tag(block, "LongMessage") || tag(block, "ShortMessage")).slice(0, 1200),
  }));
  const fees = [...xml.matchAll(/<Fees(?:\s[^>]*)?>([\s\S]*?)<\/Fees>/g)].map(([, block]) => {
    const amount = block.match(/<Fee\s+[^>]*currencyID="([A-Z]+)"[^>]*>([^<]+)<\/Fee>/);
    return amount && Number.isFinite(Number(amount[2])) ? { name: text(tag(block, "Name")), currency: amount[1], amount: Number(amount[2]) } : null;
  }).filter(Boolean);
  // Verification ItemID zero is never a publication ID.
  return { ok: ["Success", "Warning"].includes(ack) && !messages.some((entry) => entry.severity === "error"), messages, fees };
}
export async function verifyBatchDefinition(itemXml) {
  const account = batchAccount(), token = await getAccessToken();
  if (account.key !== batchAccount().key) fail("eBay account changed before verification.");
  const root = account.environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const response = await fetch(`${root}/ws/api.dll`, {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "VerifyAddFixedPriceItem", "X-EBAY-API-SITEID": "2", "X-EBAY-API-COMPATIBILITY-LEVEL": "1475", "X-EBAY-API-IAF-TOKEN": token },
    body: `<?xml version="1.0" encoding="utf-8"?><VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">${itemXml}</VerifyAddFixedPriceItemRequest>`,
  });
  if (!response.ok) fail(`eBay verification failed (HTTP ${response.status}); no listing was published.`, 502);
  return parseVerification(await response.text());
}
