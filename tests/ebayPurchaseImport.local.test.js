import test from "node:test";
import assert from "node:assert/strict";
import { importEbayPurchasesLocal } from "../src/lib/ebayPurchaseImport.js";

test("local eBay CSV import creates purchases/items and skips duplicate external order ids", () => {
  const csv = [
    "Order number,Item title,Seller,Item subtotal,Shipping and handling,Total,Quantity,Paid on",
    '11-11111-11111,"Connor McDavid - Upper Deck Young Guns",seller_one,25.00,4.50,29.50,1,2026-04-01',
    '22-22222-22222,"Wayne Gretzky - O-Pee-Chee Rookie",seller_two,60.00,10.00,70.00,2,2026-04-02',
  ].join("\n");

  const summary = importEbayPurchasesLocal(csv, [
    { id: "existing", externalOrderId: "11-11111-11111" },
  ], { addToInventory: true });

  assert.equal(summary.importedPurchases, 1);
  assert.equal(summary.importedItems, 2);
  assert.equal(summary.skippedDuplicates, 1);
  assert.equal(summary.purchases[0].externalOrderId, "22-22222-22222");
  assert.equal(summary.purchases[0].cardSet, "O-Pee-Chee Rookie");
  assert.equal(summary.items[0].purchaseId, summary.purchases[0].id);
  assert.equal(summary.items[0].costBasis, 35);
});
