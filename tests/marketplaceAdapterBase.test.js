import test from "node:test";
import assert from "node:assert/strict";
import { MarketplaceAdapter } from "../src/server/integrations/marketplaces/marketplaceAdapter.js";

const adapter = new MarketplaceAdapter("testmarket");

test("base adapter publish, revise, end, and sync defaults", async () => {
  assert.equal(adapter.buildExternalId("abcdefghijklmnop"), "testmarket-abcdefghijkl");

  const published = await adapter.publish({ id: "listing-1" });
  assert.equal(published.status, "active");
  assert.equal(published.externalListingId, "testmarket-listing-1");

  const revised = await adapter.revise({ id: "listing-1", external_listing_id: "ext-1" }, { price: 9 });
  assert.equal(revised.status, "revised");
  assert.equal(revised.externalListingId, "ext-1");
  assert.equal(revised.payload.price, 9);

  const ended = await adapter.end({ id: "listing-1" });
  assert.equal(ended.status, "ended");

  const soldSync = await adapter.sync({ id: "l", platform: "TestMarket", sold_price: 5 });
  assert.equal(soldSync.status, "sold");
  const channelSync = await adapter.sync({ id: "l", platform: "other", channel_status: "ended" });
  assert.equal(channelSync.status, "ended");
  const defaultSync = await adapter.sync({ id: "l" });
  assert.equal(defaultSync.status, "active");
});

test("base adapter shipping profile and export mapping", () => {
  assert.equal(adapter.getShippingProfile().shippingService, "Canada Post Tracked Packet");
  assert.equal(adapter.getShippingProfile("US").shippingCost, 3.99);

  const mapped = adapter.mapForExport({
    listing_title: "Export Card",
    buy_now_price: 20,
    item_specifics: JSON.stringify({ Condition: "NM" }),
  });
  assert.equal(mapped.title, "Export Card");
  assert.equal(mapped.price, 20);
  assert.equal(mapped.condition, "NM");
  assert.equal(mapped.quantity, 1);
  assert.equal(mapped.shippingCost, 4.99);
  assert.equal(mapped.marketplace, "testmarket");

  const objectSpecifics = adapter.mapForExport({
    card_name: "Fallback Name",
    start_price: 5,
    shipping: 3,
    item_specifics: { Condition: "EX" },
  });
  assert.equal(objectSpecifics.title, "Fallback Name");
  assert.equal(objectSpecifics.price, 5);
  assert.equal(objectSpecifics.condition, "EX");
  assert.equal(objectSpecifics.shippingCost, 3);
});

test("handoff status and submission HTTP lifecycle", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  function stubResponse(body, init) {
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(body, init);
    };
  }

  function stubAbortingFetch() {
    globalThis.fetch = (url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
  }

  const listing = {
    id: "L1",
    channel_id: "C1",
    external_listing_id: "EXT1",
    channel_status: "handoff_submitted",
    listing_title: "Handoff Card",
    listing_description: "Handoff description",
    start_price: 42,
    overrides: JSON.stringify({ handoff: { submissionReference: "R-0", note: "old note" } }),
  };

  function connection(metadata, extra = {}) {
    return { access_token: "tok-9", metadata: JSON.stringify(metadata), ...extra };
  }

  try {
    await t.test("syncHandoffStatus returns null without a status URL", async () => {
      assert.equal(await adapter.syncHandoffStatus(listing, {}), null);
      assert.equal(await adapter.syncHandoffStatus(listing, { connection: connection({}) }), null);
    });

    await t.test("syncHandoffStatus rejects invalid endpoint templates", async () => {
      await assert.rejects(
        () => adapter.syncHandoffStatus(listing, { connection: connection({ handoffStatusUrl: "not a url" }) }),
        /testmarket handoff status URL is invalid/,
      );
      await assert.rejects(
        () => adapter.syncHandoffStatus(listing, { connection: connection({ handoffStatusUrl: "ftp://host/{listingId}" }) }),
        /must use http or https/,
      );
    });

    await t.test("syncHandoffStatus renders the template and maps the payload", async () => {
      calls.length = 0;
      stubResponse(JSON.stringify({ status: "accepted", reference: "R-9", updatedAt: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await adapter.syncHandoffStatus(listing, {
        connection: connection({ handoffStatusUrl: "https://example.com/status/{listingId}?ref={submissionReference}" }),
      });

      assert.equal(calls[0].url, "https://example.com/status/L1?ref=R-0");
      assert.equal(calls[0].options.method, "GET");
      assert.equal(calls[0].options.headers.Authorization, "Bearer tok-9");
      assert.equal(result.status, "handoff_accepted");
      assert.equal(result.externalListingId, "EXT1");
      assert.equal(result.syncedAt, "2026-01-01T00:00:00Z");
      assert.equal(result.payload.handoff.submissionStatus, "accepted");
      assert.equal(result.payload.handoff.submissionReference, "R-9");
      assert.equal(result.payload.handoff.note, "old note");
    });

    await t.test("syncHandoffStatus falls back to the channel status and custom auth header", async () => {
      calls.length = 0;
      stubResponse("{}", { status: 200 });
      const result = await adapter.syncHandoffStatus({ ...listing, overrides: "not-json" }, {
        connection: connection({
          handoffStatusUrl: "https://example.com/status",
          apiKeyHeader: "X-Api-Key",
          apiKeyPrefix: "",
        }),
      });
      assert.equal(calls[0].options.headers["X-Api-Key"], "tok-9");
      assert.equal(result.status, "handoff_submitted");
    });

    await t.test("syncHandoffStatus surfaces remote errors and truncates long text", async () => {
      stubResponse(JSON.stringify({ error: "status denied" }), { status: 403 });
      await assert.rejects(
        () => adapter.syncHandoffStatus(listing, { connection: connection({ handoffStatusUrl: "https://example.com/status" }) }),
        /status denied/,
      );

      stubResponse("x".repeat(250), { status: 500 });
      await assert.rejects(
        () => adapter.syncHandoffStatus(listing, { connection: connection({ handoffStatusUrl: "https://example.com/status" }) }),
        (error) => {
          assert.match(error.message, /^x+\.\.\.$/);
          assert.equal(error.message.length, 203);
          return true;
        },
      );
    });

    await t.test("syncHandoffStatus times out via abort", async () => {
      stubAbortingFetch();
      await assert.rejects(
        () => adapter.syncHandoffStatus(listing, {
          connection: connection({ handoffStatusUrl: "https://example.com/status", statusTimeoutMs: 20 }),
        }),
        /testmarket handoff status sync timed out/,
      );
    });

    await t.test("submitHandoff requires a submission URL", async () => {
      await assert.rejects(
        () => adapter.submitHandoff(listing, { connection: connection({}) }),
        /testmarket handoff submission URL is not configured/,
      );
    });

    await t.test("submitHandoff posts the mapped listing and returns handoff state", async () => {
      calls.length = 0;
      stubResponse(JSON.stringify({ status: "submitted", id: "S-1" }), { status: 200 });

      const result = await adapter.submitHandoff(listing, {
        connection: connection({ handoffSubmissionUrl: "https://example.com/submit" }),
      });

      assert.equal(calls[0].options.method, "POST");
      const body = JSON.parse(calls[0].options.body);
      assert.equal(body.listingId, "L1");
      assert.equal(body.card.title, "Handoff Card");
      assert.equal(body.card.price, 42);
      assert.equal(body.card.quantity, 1);
      assert.equal(body.handoff.submissionReference, "R-0");
      assert.equal(result.status, "handoff_submitted");
      assert.equal(result.payload.handoff.submissionReference, "S-1");
      assert.ok(result.payload.handoff.submittedAt);
    });

    await t.test("submitHandoff surfaces remote errors and timeouts", async () => {
      stubResponse(JSON.stringify({ message: "queue full" }), { status: 429 });
      await assert.rejects(
        () => adapter.submitHandoff(listing, { connection: connection({ handoffSubmissionUrl: "https://example.com/submit" }) }),
        /queue full/,
      );

      stubAbortingFetch();
      await assert.rejects(
        () => adapter.submitHandoff(listing, {
          connection: connection({ handoffSubmissionUrl: "https://example.com/submit", submissionTimeoutMs: 20 }),
        }),
        /testmarket handoff submission timed out/,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
