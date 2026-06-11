import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSyncResult } from "../src/server/services/marketplaces/syncReconciler.js";

const listing = {
  id: "listing-1",
  buy_now_price: 49.99,
  start_price: 39.99,
};

const channel = {
  id: "channel-1",
  listing_id: "listing-1",
  marketplace: "ebay",
  external_listing_id: "ebay-abc123",
  status: "active",
};

test("no conflicts when remote matches local", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-abc123",
    status: "active",
    payload: { price: 49.99 },
  });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.safeToApply, true);
  assert.equal(result.hasBlockingConflict, false);
});

test("external id mismatch is a blocking error", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-xyz999",
    status: "active",
    payload: { price: 49.99 },
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "external_id_mismatch");
  assert.equal(result.conflicts[0].severity, "error");
  assert.equal(result.safeToApply, false);
  assert.equal(result.hasBlockingConflict, true);
});

test("status mismatch is a non-blocking warning", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-abc123",
    status: "ended",
    payload: { price: 49.99 },
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "status_mismatch");
  assert.equal(result.conflicts[0].severity, "warning");
  assert.equal(result.safeToApply, true);
});

test("active ↔ revised status pair is not a conflict", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-abc123",
    status: "revised",
    payload: { price: 49.99 },
  });
  assert.equal(result.conflicts.length, 0);
});

test("price mismatch beyond tolerance is a warning", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-abc123",
    status: "active",
    payload: { price: 55.0 },
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "price_mismatch");
  assert.equal(result.conflicts[0].severity, "warning");
  assert.equal(result.safeToApply, true);
});

test("price within 1¢ tolerance is not a conflict", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-abc123",
    status: "active",
    payload: { price: 49.985 },
  });
  assert.equal(result.conflicts.length, 0);
});

test("missing remote state is a blocking error", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: null,
    status: null,
    payload: null,
  });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "missing_remote");
  assert.equal(result.hasBlockingConflict, true);
});

test("remote state can be read from marketplace-native payload fields", () => {
  const result = reconcileSyncResult(listing, channel, {
    payload: {
      listingId: "ebay-abc123",
      listingStatus: "active",
      pricingSummary: {
        price: { value: "55.00", currency: "CAD" },
      },
    },
  });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, "price_mismatch");
  assert.equal(result.conflicts[0].remoteValue, "55.00");
  assert.equal(result.hasBlockingConflict, false);
  assert.equal(result.safeToApply, true);
});

test("payload-only remote id and status prevent false missing remote conflicts", () => {
  const result = reconcileSyncResult(listing, channel, {
    payload: {
      itemId: "ebay-abc123",
      status: "active",
    },
  });

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.hasBlockingConflict, false);
  assert.equal(result.safeToApply, true);
});

test("multiple conflicts are all reported", () => {
  const result = reconcileSyncResult(listing, channel, {
    externalListingId: "ebay-xyz999",
    status: "ended",
    payload: { price: 100 },
  });
  assert.equal(result.conflicts.length, 3);
  const types = result.conflicts.map((c) => c.type).sort();
  assert.deepEqual(types, ["external_id_mismatch", "price_mismatch", "status_mismatch"]);
  assert.equal(result.hasBlockingConflict, true);
});
