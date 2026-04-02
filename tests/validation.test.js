import test from "node:test";
import assert from "node:assert/strict";
import {
  validateItemPayload,
  validateListingPayload,
  validateMigrationPayload,
  validateSalePayload,
  validateSettingsPayload,
} from "../src/server/validation/writeValidators.js";

function runValidator(validator, body) {
  let statusCode = null;
  let payload = null;
  let nextCalled = false;

  const req = { body };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
  };

  validator(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, payload, statusCode };
}

test("item validator rejects invalid array fields", () => {
  const result = runValidator(validateItemPayload, { listedOn: "bad" });
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
  assert.match(result.payload.error, /listedOn must be an array/);
});

test("listing validator rejects missing platform and bad numeric fields", () => {
  const missingPlatform = runValidator(validateListingPayload, { shipping: 1 });
  assert.equal(missingPlatform.statusCode, 400);
  assert.match(missingPlatform.payload.error, /platform required/);

  const badNumber = runValidator(validateListingPayload, {
    platform: "ebay",
    shipping: "oops",
  });
  assert.equal(badNumber.statusCode, 400);
  assert.match(badNumber.payload.error, /shipping must be a number/);
});

test("sale validator rejects missing or invalid sale price", () => {
  const missing = runValidator(validateSalePayload, {});
  assert.equal(missing.statusCode, 400);
  assert.match(missing.payload.error, /sale_price required/);

  const invalid = runValidator(validateSalePayload, { salePrice: "oops" });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.payload.error, /salePrice must be a number/);
});

test("settings and migration validators accept valid object payloads", () => {
  const settings = runValidator(validateSettingsPayload, { userName: "Scott" });
  assert.equal(settings.nextCalled, true);

  const migration = runValidator(validateMigrationPayload, {
    catalog: [],
    sales: [],
    listings: [],
    trades: [],
    watchlist: [],
    gradings: [],
    purchases: [],
    settings: { userName: "Scott" },
  });
  assert.equal(migration.nextCalled, true);
});
