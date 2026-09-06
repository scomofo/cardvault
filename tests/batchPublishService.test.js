import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDB, get, all, run, getDB } from "../src/server/database.js";
import { saveImageFile } from "../src/server/services/imageStore.js";
import { createBatchPublishService, CHECK_TTL_MS } from "../src/server/services/batchPublish/service.js";
import { REVIEWED_DEFINITION } from "../src/server/services/batchPublish/reviewedDefinition.js";
import { getMarketplaceAdapter } from "../src/server/integrations/marketplaces/marketplaceRegistry.js";

const config = { postalCode: "T5A1A1", sport: "Hockey", manufacturer: "Upper Deck", fulfillmentPolicyId: "123", paymentPolicyId: "234", returnPolicyId: "345" };
function fixture(t, count = 3, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cardvault-batch-publish-"));
  const previous = process.env.CARDVAULT_DB_PATH; process.env.CARDVAULT_DB_PATH = join(dir, "test.db"); initDB();
  const state = { now: Date.now(), account: { key: "account-a", environment: "sandbox" }, verifyCalls: 0, publishCalls: [], uploads: 0, policies: { fulfillmentPolicies: [{ fulfillmentPolicyId: "123", marketplaceId: "EBAY_CA", name: "Flat", shippingOptions: [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ shippingServiceCode: "CA_RegularParcel", shippingCost: { value: "5", currency: "CAD" } }] }] }], paymentPolicies: [{ paymentPolicyId: "234", marketplaceId: "EBAY_CA", name: "Pay" }], returnPolicies: [{ returnPolicyId: "345", marketplaceId: "EBAY_CA", name: "Return" }] } };
  for (let i = 0; i < count; i++) {
    for (const side of ["front", "back"]) saveImageFile(`${side}-${i}`, `data:image/jpeg;base64,${Buffer.from(`${side}${i}`).toString("base64")}`);
    run("INSERT INTO user_items (id,name,type,condition,status,sale_status,front_img_id,back_img_id) VALUES (?,?,'sports','near_mint','inventory','available',?,?)", [`item-${i}`, `Player ${i}`, `front-${i}`, `back-${i}`]);
    run("INSERT INTO listings (id,card_id,card_name,platform,format,status,publish_status,listing_title,listing_description,start_price,shipping,quantity) VALUES (?,?,?,'ebay','fixed','draft','draft',?,'Inspected raw card',25,5,1)", [`draft-${i}`, `item-${i}`, `Player ${i}`, `Player ${i}`]);
  }
  const dependencies = { account: () => state.account, policies: async () => structuredClone(state.policies), now: () => state.now,
    upload: async () => { state.uploads++; return `https://i.ebayimg.com/${state.uploads}.jpg`; },
    verify: async () => { state.verifyCalls++; return { ok: true, fees: [], messages: [] }; },
    publish: async (id, market, options) => { options[REVIEWED_DEFINITION].beforeSend(); state.publishCalls.push({ id, market, xml: options[REVIEWED_DEFINITION].itemXml }); return { status: "active", external_listing_id: `${100 + state.publishCalls.length}` }; }, ...overrides };
  const service = createBatchPublishService(dependencies);
  const adapter = getMarketplaceAdapter("ebay"), original = { publish: adapter.publish, isConnected: adapter.isConnected };
  t.after(() => { Object.assign(adapter, original); getDB().close(); if (previous === undefined) delete process.env.CARDVAULT_DB_PATH; else process.env.CARDVAULT_DB_PATH = previous; rmSync(dir, { recursive: true, force: true }); });
  return { state, service, dependencies, adapter, async checked(ids = ["draft-0"]) { let batch = service.create({ listingIds: ids, config }); for (const row of batch.rows) batch = await service.check(batch.id, row.id); return batch; } };
}
const approval = (batch, rows = batch.rows) => ({ confirmed: true, environment: batch.environment, rows: rows.map(({ id, proof }) => ({ id, proof })) });

test("mixed batch checks are per-item, read-only for publication, and survive service reload", async (t) => {
  const { service, state, dependencies, checked } = fixture(t);
  run("UPDATE listings SET shipping=6 WHERE id='draft-1'");
  const batch = await checked(["draft-0", "draft-1", "draft-2"]);
  assert.deepEqual(batch.rows.map((row) => row.status), ["ready", "rejected", "ready"]);
  assert.equal(state.uploads, 4); assert.equal(state.verifyCalls, 2); assert.equal(state.publishCalls.length, 0);
  assert.equal(get("SELECT status FROM listings WHERE id='draft-0'").status, "draft");
  assert.equal(all("SELECT * FROM listing_channels").length, 0);
  assert.deepEqual(createBatchPublishService(dependencies).view(batch.id), service.view(batch.id));
});
test("explicit approval, environment and exact proof are required; processing unchecked drafts does nothing", async (t) => {
  const { service, state, checked } = fixture(t);
  const batch = await checked();
  for (const body of [{ ...approval(batch), confirmed: false }, { ...approval(batch), environment: "production" }, { ...approval(batch), rows: [{ id: batch.rows[0].id, proof: "stale" }] }]) await assert.rejects(service.approve(batch.id, body));
  await service.processNext(batch.id); assert.equal(state.publishCalls.length, 0);
});
test("approved definitions publish exactly once with immutable checked XML and server-resumable progress", async (t) => {
  const { service, state, dependencies, checked } = fixture(t);
  const batch = await checked(["draft-0", "draft-1"]);
  const expectedXml = get("SELECT item_xml FROM publish_batch_rows WHERE id=?", [batch.rows[0].id]).item_xml;
  await service.approve(batch.id, approval(batch));
  let result = await service.processNext(batch.id);
  assert.deepEqual(result.rows.map((row) => row.status), ["live", "approved"]);
  result = await createBatchPublishService(dependencies).processNext(batch.id);
  assert.deepEqual(result.rows.map((row) => row.status), ["live", "live"]);
  await service.processNext(batch.id); assert.equal(state.publishCalls.length, 2);
  assert.equal(state.publishCalls[0].xml, expectedXml);
});
test("price, photo, account and policy edits invalidate approval and prevent publication", async (t) => {
  const { service, state, checked } = fixture(t, 4);
  for (let index = 0; index < 4; index++) {
    const batch = await checked([`draft-${index}`]);
    if (index === 0) run("UPDATE listings SET start_price=30 WHERE id='draft-0'");
    if (index === 1) saveImageFile("front-1", "data:image/jpeg;base64,Y2hhbmdlZA==");
    if (index === 2) state.account.key = "account-b";
    if (index === 3) state.policies.returnPolicies[0].name = "Changed returns";
    await assert.rejects(service.approve(batch.id, approval(batch)), /changed/);
  }
  assert.equal(state.publishCalls.length, 0);
});
test("edits after approval stop publication and stale checks need a fresh approval", async (t) => {
  const { service, state, checked } = fixture(t);
  const batch = await checked(); await service.approve(batch.id, approval(batch));
  run("UPDATE listings SET listing_description='new description' WHERE id='draft-0'");
  const result = await service.processNext(batch.id);
  assert.equal(result.rows[0].status, "stale"); assert.equal(state.publishCalls.length, 0);
  const refreshed = await service.check(batch.id, batch.rows[0].id);
  await service.processNext(batch.id); assert.equal(state.publishCalls.length, 0);
  state.now += CHECK_TTL_MS + 1;
  await assert.rejects(service.approve(batch.id, approval(refreshed)), /expired/);
});
test("unknown outcomes never automatically retry while remaining approvals can continue", async (t) => {
  let attempted = 0;
  const { service, checked } = fixture(t, 2, { publish: async () => { attempted++; if (attempted === 1) throw new Error("Connection lost"); return { status: "active", external_listing_id: "888" }; } });
  const batch = await checked(["draft-0", "draft-1"]); await service.approve(batch.id, approval(batch));
  let result = await service.processNext(batch.id); assert.equal(result.rows[0].status, "unknown");
  result = await service.processNext(batch.id); assert.deepEqual(result.rows.map((row) => row.status), ["unknown", "live"]);
  await service.processNext(batch.id); assert.equal(attempted, 2);
  await assert.rejects(service.check(batch.id, batch.rows[0].id), /unresolved/);
});
test("concurrent process requests cannot publish the same approved row twice", async (t) => {
  let release, entered;
  const reached = new Promise((resolve) => { entered = resolve; });
  let count = 0;
  const { service, checked } = fixture(t, 1, { publish: async () => { count++; entered(); await new Promise((resolve) => { release = resolve; }); return { status: "active", external_listing_id: "222" }; } });
  const batch = await checked(); await service.approve(batch.id, approval(batch));
  const first = service.processNext(batch.id); await reached;
  await service.processNext(batch.id); assert.equal(count, 1);
  release(); await first; assert.equal(service.view(batch.id).rows[0].status, "live");
});
test("pre-send guard prevents changes during authorization from reaching eBay", async (t) => {
  let guardInvoked = false;
  const { service, checked } = fixture(t, 1, { publish: async (_id, _market, options) => {
    run("UPDATE user_items SET condition='poor' WHERE id='item-0'");
    guardInvoked = true; options[REVIEWED_DEFINITION].beforeSend(); assert.fail("Must not reach send");
  } });
  const batch = await checked(); await service.approve(batch.id, approval(batch));
  const result = await service.processNext(batch.id); assert.equal(guardInvoked, true); assert.equal(result.rows[0].status, "stale");
});
test("actual publisher stores a confirmed channel and does not duplicate across separately approved batches", async (t) => {
  const { state, checked, service, dependencies, adapter } = fixture(t, 1);
  adapter.isConnected = () => true;
  adapter.publish = async (listing, options) => { options[REVIEWED_DEFINITION].beforeSend(); state.publishCalls.push(listing.id); return { status: "active", externalListingId: "123456", marketplace: "ebay" }; };
  delete dependencies.publish;
  const real = createBatchPublishService(dependencies);
  const first = await checked(); const second = await checked();
  await service.approve(first.id, approval(first)); await service.approve(second.id, approval(second));
  assert.equal((await real.processNext(first.id)).rows[0].status, "live");
  const result = await real.processNext(second.id); assert.equal(result.rows[0].status, "live");
  assert.equal(state.publishCalls.length, 1); assert.equal(get("SELECT status FROM user_items WHERE id='item-0'").status, "listed");
});
test("cancel only removes unprocessed approvals; an interrupted claim becomes unknown, not approved", async (t) => {
  const { service, state, checked } = fixture(t, 2);
  const batch = await checked(["draft-0", "draft-1"]); await service.approve(batch.id, approval(batch));
  run("UPDATE publish_batch_rows SET status='publishing',started_at=? WHERE id=?", [state.now - 120001, batch.rows[0].id]);
  const result = service.cancelApproval(batch.id);
  assert.deepEqual(result.rows.map((row) => row.status), ["unknown", "stale"]);
  await service.processNext(batch.id); assert.equal(state.publishCalls.length, 0);
});
test("missing or sold inventory and missing server photos cannot be checked", async (t) => {
  const { service, checked } = fixture(t, 2);
  run("UPDATE user_items SET status='sold' WHERE id='item-0'");
  run("UPDATE user_items SET back_img_id=NULL WHERE id='item-1'");
  const batch = await checked(["draft-0", "draft-1"]);
  assert.deepEqual(batch.rows.map((row) => row.status), ["rejected", "rejected"]);
  assert.throws(() => service.create({ listingIds: ["missing"], config }));
  assert.equal(all("SELECT * FROM publish_batches").length, 1);
});
test("actual publisher separates definite eBay rejection, pre-send rejection and ambiguous failures", async (t) => {
  const { service, dependencies, adapter, checked } = fixture(t, 3);
  adapter.isConnected = () => true; delete dependencies.publish;
  const real = createBatchPublishService(dependencies);
  for (const [index, kind, expectedRow, expectedChannel] of [[0, "definite", "rejected", "rejected"], [1, "notSent", "stale", "draft"], [2, "unknown", "unknown", "publish_unknown"]]) {
    adapter.publish = async () => { const error = new Error(kind); if (kind === "definite") error.code = "EBAY_REJECTED"; if (kind === "notSent") error.notSent = true; throw error; };
    const batch = await checked([`draft-${index}`]); await service.approve(batch.id, approval(batch));
    const result = await real.processNext(batch.id);
    assert.equal(result.rows[0].status, expectedRow);
    assert.equal(get("SELECT status FROM listing_channels WHERE listing_id=?", [`draft-${index}`]).status, expectedChannel);
  }
});
test("a failed photo upload and a changed draft during verification cannot be approved", async (t) => {
  const { service, dependencies } = fixture(t, 2);
  let batch = service.create({ listingIds: ["draft-0"], config });
  const failed = createBatchPublishService({ ...dependencies, upload: async () => null });
  batch = await failed.check(batch.id, batch.rows[0].id); assert.equal(batch.rows[0].status, "rejected");
  assert.equal(batch.rows[0].proof, null);
  const changed = createBatchPublishService({ ...dependencies, verify: async () => { run("UPDATE listings SET start_price=30 WHERE id='draft-1'"); return { ok: true }; } });
  batch = changed.create({ listingIds: ["draft-1"], config });
  batch = await changed.check(batch.id, batch.rows[0].id); assert.equal(batch.rows[0].status, "rejected");
  assert.match(batch.rows[0].error, /changed during checking/);
});
test("deleting the last draft clears its publication snapshot and empty batch metadata", async (t) => {
  const { service, checked } = fixture(t, 1);
  const batch = await checked(); run("DELETE FROM listings WHERE id='draft-0'");
  assert.equal(all("SELECT * FROM publish_batch_rows").length, 0);
  assert.equal(all("SELECT * FROM publish_batches").length, 0);
  assert.throws(() => service.view(batch.id), /not found/);
});
