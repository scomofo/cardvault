import test from "node:test";
import assert from "node:assert/strict";

import {
  createBackupPayload,
  normalizeBackupState,
} from "../src/lib/backupState.js";

test("createBackupPayload includes the current operational collections and images", () => {
  const payload = createBackupPayload({
    catalog: [{ id: "item-1" }],
    sales: [{ id: "sale-1" }],
    orders: [{ id: "order-1" }],
    listings: [{ id: "listing-1" }],
    purchases: [{ id: "purchase-1" }],
    trades: [{ id: "trade-1" }],
    watchlist: [{ id: "watch-1" }],
    gradings: [{ id: "grading-1" }],
    userName: "Scott",
    shipFrom: "Edmonton",
    images: { "img-1": "data:image/png;base64,abc" },
    now: new Date("2026-04-24T12:00:00.000Z"),
  });

  assert.equal(payload._cardvaultBackup, true);
  assert.equal(payload._date, "2026-04-24T12:00:00.000Z");
  assert.deepEqual(payload.orders, [{ id: "order-1" }]);
  assert.deepEqual(payload.images, { "img-1": "data:image/png;base64,abc" });
});

test("normalizeBackupState treats the backup as authoritative", () => {
  const normalized = normalizeBackupState({
    _cardvaultBackup: true,
    sales: [{ id: "sale-1" }],
    userName: null,
    images: ["bad-images-shape"],
  });

  assert.deepEqual(normalized, {
    catalog: [],
    sales: [{ id: "sale-1" }],
    orders: [],
    listings: [],
    purchases: [],
    trades: [],
    watchlist: [],
    gradings: [],
    userName: "",
    shipFrom: "",
    images: {},
  });
});
