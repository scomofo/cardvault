import test from "node:test";
import assert from "node:assert/strict";
import { importEbayPurchasesLocal, parseEbayPurchaseImport } from "../src/lib/ebayPurchaseImport.js";

test("local eBay CSV import creates purchases/items and skips duplicate external order ids", () => {
  const csv = [
    "Order number,Item title,Seller,Item subtotal,Shipping and handling,Total,Quantity,Paid on",
    '11-11111-11111,"Connor McDavid - Upper Deck Young Guns",seller_one,25.00,4.50,29.50,1,2026-04-01',
    '22-22222-22222,"Wayne Gretzky - O-Pee-Chee Rookie",seller_two,60.00,10.00,70.00,2,2026-04-02',
  ].join("\n");

  const summary = importEbayPurchasesLocal(csv, [
    {
      id: "existing",
      externalOrderId: "11-11111-11111",
      name: "Connor McDavid - Upper Deck Young Guns",
      totalCost: 29.5,
      date: "2026-04-01",
      seller: "seller_one",
    },
  ], { addToInventory: true });

  assert.equal(summary.importedPurchases, 1);
  assert.equal(summary.importedItems, 2);
  assert.equal(summary.skippedDuplicates, 1);
  assert.equal(summary.purchases[0].externalOrderId, "22-22222-22222");
  assert.equal(summary.purchases[0].cardSet, "O-Pee-Chee Rookie");
  assert.equal(summary.items[0].purchaseId, summary.purchases[0].id);
  assert.equal(summary.items[0].costBasis, 35);
});

test("local parser accepts html-style table export", () => {
  const html = `
    <table>
      <tr><th>Order number</th><th>Item title</th><th>Total</th><th>Quantity</th></tr>
      <tr><td>44-44444-44444</td><td>Jaromir Jagr - Pinnacle</td><td>$18.00</td><td>1</td></tr>
    </table>
  `;

  const parsed = parseEbayPurchaseImport(html);
  assert.equal(parsed.normalizedRows.length, 1);
  assert.equal(parsed.normalizedRows[0].externalOrderId, "44-44444-44444");
  assert.equal(parsed.normalizedRows[0].title, "Jaromir Jagr - Pinnacle");
  assert.equal(parsed.normalizedRows[0].totalCost, 18);
});

test("local eBay import keeps distinct items from the same order and only skips true reimports", () => {
  const csv = [
    "Order number,Item title,Seller,Total,Quantity,Paid on",
    '55-55555-55555,"Sidney Crosby - Young Guns",seller_combo,40.00,1,2026-04-04',
    '55-55555-55555,"Alex Ovechkin - Young Guns",seller_combo,35.00,1,2026-04-04',
  ].join("\n");

  const summary = importEbayPurchasesLocal(csv, [], { addToInventory: false });
  assert.equal(summary.importedPurchases, 2);
  assert.equal(summary.skippedDuplicates, 0);

  const reimportSummary = importEbayPurchasesLocal(csv, summary.purchases, { addToInventory: false });
  assert.equal(reimportSummary.importedPurchases, 0);
  assert.equal(reimportSummary.skippedDuplicates, 2);
});
