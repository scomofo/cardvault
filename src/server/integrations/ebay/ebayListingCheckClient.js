import { getAccessToken, getEbayCredentials, getEbayStatus } from "./ebayAuth.js";
import { get } from "../../database.js";
import { digest, fail } from "../../services/listings/ebayListingDefinition.js";

export function checkedAccount() {
  const creds = getEbayCredentials();
  if (!creds || !getEbayStatus().connected) fail("Connect eBay in Settings before checking or publishing.");
  const identity = get("SELECT value FROM settings WHERE key = 'ebay_refresh_token'")?.value
    || get("SELECT value FROM settings WHERE key = 'ebay_access_token'")?.value;
  if (!identity) fail("Reconnect eBay; no account authorization is available.");
  return { environment: creds.sandbox ? "sandbox" : "production", key: digest([creds.appId, creds.sandbox, identity]) };
}

const rootFor = (account) => account.environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
function assertAccount(key) {
  if (!key || checkedAccount().key !== key) fail("eBay account changed. Reload policies and check the draft again.");
}

export async function loadSellingPolicies() {
  const account = checkedAccount(), token = await getAccessToken();
  assertAccount(account.key);
  const entries = await Promise.all(["fulfillment", "payment", "return"].map(async (type) => {
    assertAccount(account.key);
    const response = await fetch(`${rootFor(account)}/sell/account/v1/${type}_policy?marketplace_id=EBAY_CA`, {
      signal: AbortSignal.timeout(20000), redirect: "error", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    assertAccount(account.key);
    if (!response.ok) fail(`eBay ${type} policies could not be loaded (HTTP ${response.status}). Check account access and business policies.`, 502);
    const data = await response.json();
    assertAccount(account.key);
    const entries = data[`${type}Policies`];
    if (!Array.isArray(entries)) fail(`eBay returned invalid ${type} policies. Reload policies and try again.`, 502);
    return [`${type}Policies`, entries];
  }));
  assertAccount(account.key);
  return { ...Object.fromEntries(entries), environment: account.environment };
}

function tag(xml, name) { return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] || ""; }
function text(xml) {
  return String(xml).replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function parseVerification(xml) {
  if (typeof xml !== "string" || !/<VerifyAddFixedPriceItemResponse[\s>]/.test(xml) || !/<\/VerifyAddFixedPriceItemResponse>\s*$/.test(xml)) fail("eBay returned an invalid verification response; no listing was published.", 502);
  const ack = tag(xml, "Ack").trim();
  if (!["Success", "Warning", "Failure", "PartialFailure"].includes(ack)) fail("eBay returned no recognized verification acknowledgement.", 502);
  const messages = [...xml.matchAll(/<Errors(?:\s[^>]*)?>([\s\S]*?)<\/Errors>/g)].map(([, block]) => ({
    code: text(tag(block, "ErrorCode")), severity: tag(block, "SeverityCode").trim() === "Warning" ? "warning" : "error",
    message: text(tag(block, "LongMessage") || tag(block, "ShortMessage") || "eBay returned an unspecified listing issue.").slice(0, 1200),
  }));
  for (const [, message] of xml.matchAll(/<Message(?:\s[^>]*)?>([\s\S]*?)<\/Message>/g)) {
    messages.push({ code: "", severity: "warning", message: text(message).slice(0, 1200) });
  }
  if (["Failure", "PartialFailure"].includes(ack) && !messages.some((entry) => entry.severity === "error")) messages.push({ code: "", severity: "error", message: "eBay did not approve this draft. Review the listing and check again." });
  const feesXml = tag(xml, "Fees");
  const fees = [...feesXml.matchAll(/<Fee\s*>([\s\S]*?)<\/Fee>(?=\s*(?:<Fee\s*>|$))/g)].map(([, block]) => {
    const amount = block.match(/<Fee\s+[^>]*currencyID=["']([A-Z]{3})["'][^>]*>([^<]+)<\/Fee>/);
    return amount && amount[2].trim() !== "" && Number.isFinite(Number(amount[2])) ? { name: text(tag(block, "Name")), currency: amount[1], amount: Number(amount[2]) } : null;
  }).filter(Boolean);
  // Verification ItemID is always zero, not proof of any live listing.
  return { ready: ["Success", "Warning"].includes(ack) && !messages.some((entry) => entry.severity === "error"), messages, fees };
}

export async function verifyListingDefinition(itemXml, expectedAccountKey) {
  const account = checkedAccount();
  assertAccount(expectedAccountKey);
  const token = await getAccessToken();
  assertAccount(expectedAccountKey);
  const response = await fetch(`${rootFor(account)}/ws/api.dll`, {
    method: "POST", signal: AbortSignal.timeout(20000), redirect: "error",
    headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "VerifyAddFixedPriceItem", "X-EBAY-API-SITEID": "2", "X-EBAY-API-COMPATIBILITY-LEVEL": "1475", "X-EBAY-API-IAF-TOKEN": token },
    body: `<?xml version="1.0" encoding="utf-8"?><VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">${itemXml}</VerifyAddFixedPriceItemRequest>`,
  });
  assertAccount(expectedAccountKey);
  if (!response.ok) fail(`eBay verification failed (HTTP ${response.status}); no listing was published.`, 502);
  const xml = await response.text();
  assertAccount(expectedAccountKey);
  return parseVerification(xml);
}
