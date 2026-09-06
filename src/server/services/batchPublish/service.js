import { randomUUID } from "node:crypto";
import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { batchAccount, loadBatchPolicies, verifyBatchDefinition } from "../../integrations/ebay/batchPublishClient.js";
import { uploadSiteHostedPictures } from "../../integrations/ebay/ebayClient.js";
import { readImageFile } from "../imageStore.js";
import { publishListingToMarketplace } from "../marketplaces/publishService.js";
import { buildDefinition, choosePolicies, contentFingerprint, digest, fail, ID, normalizeConfig } from "./definition.js";
import { REVIEWED_DEFINITION } from "./reviewedDefinition.js";

export const CHECK_TTL_MS = 15 * 60 * 1000;
const inFlight = new Set();
const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
const rowFields = (row) => ({ id: row.id, listingId: row.listing_id, status: row.status, proof: row.proof,
  checkedAt: row.checked_at, error: row.error, externalId: row.external_id, snapshot: parse(row.snapshot), result: parse(row.result) });
function context(listingId, claimed = false) {
  const listing = get("SELECT * FROM listings WHERE id = ?", [listingId]);
  if (!listing) fail("The draft no longer exists.");
  const item = get("SELECT * FROM user_items WHERE id = ?", [listing.card_id]);
  if (!item || ["sold", "listed"].includes(item.status) || item.sale_status === "sold") fail("This card is sold or already listed.");
  if (!["draft", "ready"].includes(listing.status)) fail("Only unpublished drafts can be checked.");
  const allowed = claimed ? ["draft", "ready", "publishing", "rejected"] : ["draft", "ready", "rejected"];
  if (!allowed.includes(listing.publish_status || "draft")) fail("This listing already has marketplace activity. Review it in Sales.");
  const channels = all("SELECT c.* FROM listing_channels c JOIN listings l ON l.id=c.listing_id WHERE l.card_id = ?", [item.id]);
  if (channels.some((channel) => !["ended", "draft", "rejected"].includes(channel.status)
    && !(claimed && channel.listing_id === listingId && channel.marketplace === "ebay" && channel.status === "publishing"))) {
    fail("A marketplace attempt or live listing for this card needs review in Sales.");
  }
  const images = [readImageFile(item.front_img_id), readImageFile(item.back_img_id)];
  if (images.some((image) => !image?.buffer?.length)) fail("Both front and back photos must be stored on the server.");
  return { listing, item, images };
}
function update(id, values) {
  run(`UPDATE publish_batch_rows SET ${Object.keys(values).map((key) => `${key} = ?`).join(",")} WHERE id = ?`, [...Object.values(values), id]);
}
function requireBatch(id) {
  if (typeof id !== "string" || !ID.test(id)) fail("Invalid publication batch ID", 400);
  const batch = get("SELECT * FROM publish_batches WHERE id = ?", [id]);
  if (!batch) fail("Publication batch not found", 404);
  return { ...batch, config: parse(batch.config, {}) };
}
function requireRow(batchId, rowId) {
  const row = get("SELECT * FROM publish_batch_rows WHERE id = ? AND batch_id = ?", [rowId, batchId]);
  if (!row) fail("Batch row not found", 404);
  return row;
}

/** DI network boundary; tests never contact a real marketplace. */
export function createBatchPublishService(dependencies = {}) {
  const account = dependencies.account || batchAccount;
  const policies = dependencies.policies || loadBatchPolicies;
  const upload = dependencies.upload || uploadSiteHostedPictures;
  const verify = dependencies.verify || verifyBatchDefinition;
  const publish = dependencies.publish || publishListingToMarketplace;
  const now = dependencies.now || Date.now;
  const currentContext = dependencies.context || context;

  function view(batchId) {
    const batch = requireBatch(batchId);
    const rows = all("SELECT * FROM publish_batch_rows WHERE batch_id = ? ORDER BY rowid", [batchId]);
    for (const row of rows) {
      const channel = get("SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = 'ebay'", [row.listing_id]);
      const confirmed = channel?.external_listing_id && /^[1-9]\d*$/.test(channel.external_listing_id)
        && ["active", "revised", "sold", "ended"].includes(channel.status);
      if (confirmed && row.status !== "live") update(row.id, { status: "live", external_id: channel.external_listing_id, error: null });
      else if (row.status === "publishing" && !inFlight.has(row.id) && now() - row.started_at >= 120000) {
        update(row.id, { status: "unknown", error: "Publication was interrupted. Check eBay Seller Hub before any retry in Sales." });
      } else if (["ready", "approved"].includes(row.status) && now() - row.checked_at > CHECK_TTL_MS) {
        update(row.id, { status: "stale", proof: null, error: "The check expired. Check this draft again." });
      }
    }
    return { id: batch.id, environment: batch.environment, config: batch.config, createdAt: batch.created_at,
      rows: all("SELECT * FROM publish_batch_rows WHERE batch_id = ? ORDER BY rowid", [batchId]).map(rowFields) };
  }
  function create(body) {
    const ids = body?.listingIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 25 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !ID.test(id))) fail("Select 1–25 unique saved draft IDs.", 400);
    const config = normalizeConfig(body.config), identity = account(), id = randomUUID();
    runInImmediateTransaction(() => {
      run("INSERT INTO publish_batches (id,config,environment,created_at) VALUES (?,?,?,?)", [id, JSON.stringify(config), identity.environment, now()]);
      for (const listingId of ids) {
        if (!get("SELECT id FROM listings WHERE id = ?", [listingId])) fail("A selected draft has not reached the server. Reconnect and sync it first.");
        run("INSERT INTO publish_batch_rows (id,batch_id,listing_id,status) VALUES (?,?,?,'unchecked')", [randomUUID(), id, listingId]);
      }
    });
    return view(id);
  }
  async function check(batchId, rowId) {
    const batch = requireBatch(batchId), row = requireRow(batchId, rowId);
    if (inFlight.has(rowId) || ["approved", "publishing", "unknown", "live"].includes(row.status)) fail("This row is already approved or has an unresolved publication. Review its result first.");
    inFlight.add(rowId);
    update(rowId, { status: "checking", proof: null, error: null, started_at: now() });
    try {
      const identity = account();
      if (identity.environment !== batch.environment) fail("The eBay environment changed. Start a new check batch.");
      const selected = choosePolicies(batch.config, await policies());
      const before = currentContext(row.listing_id);
      const fingerprint = contentFingerprint(before.listing, before.item, before.images, batch.config, identity.key, selected);
      // Validate content and shipping before uploading any photos.
      buildDefinition(before.listing, before.item, batch.config, selected, ["https://example.invalid/front", "https://example.invalid/back"]);
      const pictureUrls = [];
      for (const image of before.images) pictureUrls.push(await upload(image.buffer, image.mime));
      const itemXml = buildDefinition(before.listing, before.item, batch.config, selected, pictureUrls);
      const result = await verify(itemXml);
      const after = currentContext(row.listing_id);
      if (fingerprint !== contentFingerprint(after.listing, after.item, after.images, batch.config, account().key, selected)) fail("Draft, photos or account changed during checking. Check again.");
      if (!result || typeof result.ok !== "boolean") fail("No reliable verification result was returned.");
      const snapshot = { title: before.listing.listing_title, description: before.listing.listing_description, price: Number(before.listing.start_price), shipping: Number(before.listing.shipping), condition: before.item.condition,
        frontImgId: before.item.front_img_id, backImgId: before.item.back_img_id, pictureUrls, policies: selected, accountKey: identity.key };
      update(rowId, { status: result.ok ? "ready" : "rejected", snapshot: JSON.stringify(snapshot), fingerprint, item_xml: itemXml,
        proof: result.ok ? digest([fingerprint, itemXml, randomUUID()]) : null, result: JSON.stringify(result), checked_at: now(),
        error: result.ok ? null : "eBay rejected this definition. Correct the draft or policies, then check again." });
    } catch (error) {
      update(rowId, { status: "rejected", error: error.message, proof: null, result: null });
    } finally { inFlight.delete(rowId); }
    return view(batchId);
  }
  async function assertUnchanged(batch, row, claimed = false, selectedPolicies = null) {
    if (!row.checked_at || now() - row.checked_at > CHECK_TTL_MS) fail("The check expired. Check and approve again.");
    const selected = selectedPolicies || choosePolicies(batch.config, await policies());
    const identity = account();
    const ctx = currentContext(row.listing_id, claimed);
    if (identity.environment !== batch.environment || row.fingerprint !== contentFingerprint(ctx.listing, ctx.item, ctx.images, batch.config, identity.key, selected)) fail("Draft, photos, account or business policy changed. Check and approve again.");
    return selected;
  }
  async function approve(batchId, body) {
    const batch = requireBatch(batchId), selected = body?.rows;
    if (body?.confirmed !== true || !Array.isArray(selected) || !selected.length || selected.length > 25
      || selected.some((entry) => !entry || typeof entry.id !== "string" || typeof entry.proof !== "string")
      || new Set(selected.map((entry) => entry.id)).size !== selected.length) fail("Explicitly confirm 1–25 reviewed rows.", 400);
    if (body.environment !== batch.environment) fail("Confirm the displayed eBay environment.", 400);
    const rows = selected.map(({ id, proof }) => {
      const row = requireRow(batchId, id);
      if (row.status !== "ready" || !proof || proof !== row.proof) fail("This review changed. Reload and check the selected drafts again.");
      return row;
    });
    const selectedPolicies = choosePolicies(batch.config, await policies());
    for (const row of rows) await assertUnchanged(batch, row, false, selectedPolicies);
    runInImmediateTransaction(() => {
      for (const row of rows) {
        const current = requireRow(batchId, row.id);
        if (current.status !== "ready" || current.proof !== row.proof || inFlight.has(row.id)) fail("A draft changed during approval.");
        const ctx = currentContext(row.listing_id), snapshot = parse(row.snapshot);
        if (row.fingerprint !== contentFingerprint(ctx.listing, ctx.item, ctx.images, batch.config, account().key, snapshot.policies)) fail("A draft changed during approval. Check again.");
        update(row.id, { status: "approved", error: null });
      }
    });
    return view(batchId);
  }
  async function processNext(batchId) {
    const batch = requireBatch(batchId);
    const row = runInImmediateTransaction(() => {
      const pending = get("SELECT * FROM publish_batch_rows WHERE batch_id = ? AND status = 'approved' ORDER BY rowid LIMIT 1", [batchId]);
      if (!pending) return null;
      update(pending.id, { status: "publishing", started_at: now(), error: null });
      return pending;
    });
    if (!row) return view(batchId);
    inFlight.add(row.id);
    let attempted = false;
    try {
      const selected = await assertUnchanged(batch, row);
      const beforeSend = () => {
        try {
          const ctx = currentContext(row.listing_id, true);
          if (row.fingerprint !== contentFingerprint(ctx.listing, ctx.item, ctx.images, batch.config, account().key, selected)) fail("Draft or account changed immediately before publication; nothing was sent.");
          if (now() - row.checked_at > CHECK_TTL_MS) fail("The check expired before publication; nothing was sent.");
        } catch (error) { error.notSent = true; throw error; }
      };
      attempted = true;
      const channel = await publish(row.listing_id, "ebay", { [REVIEWED_DEFINITION]: { itemXml: row.item_xml, beforeSend } });
      const externalId = channel?.external_listing_id || channel?.externalListingId;
      if (!/^[1-9]\d*$/.test(externalId || "") || !["active", "revised"].includes(channel?.status)) fail("No confirmed live listing ID was returned. Review eBay before retrying.");
      update(row.id, { status: "live", external_id: externalId, error: null });
    } catch (error) {
      const status = !attempted || error.notSent ? "stale" : error.code === "EBAY_REJECTED" ? "rejected" : "unknown";
      update(row.id, { status, error: error.message, proof: null });
    } finally { inFlight.delete(row.id); }
    return view(batchId);
  }
  function cancelApproval(batchId) {
    requireBatch(batchId);
    run("UPDATE publish_batch_rows SET status='stale', proof=NULL, error='Approval cancelled. Check again before publishing.' WHERE batch_id=? AND status='approved'", [batchId]);
    return view(batchId);
  }
  return { create, check, approve, processNext, view, cancelApproval,
    recent: () => all("SELECT id, environment, created_at AS createdAt FROM publish_batches ORDER BY created_at DESC, rowid DESC LIMIT 20") };
}
