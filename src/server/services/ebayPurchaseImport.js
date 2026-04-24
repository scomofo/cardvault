import { all, run, runInImmediateTransaction } from "../database.js";
import { buildPurchaseImportFingerprint, parseEbayPurchaseImport } from "../../lib/ebayPurchaseImport.js";
import { uid } from "../routes/shared.js";

function buildPurchaseNotes(row) {
  return [
    row.notes,
    row.quantity > 1 ? `Imported quantity: ${row.quantity}` : null,
    "Imported from eBay CSV",
  ]
    .filter(Boolean)
    .join(" | ");
}

function createInventoryItemFromPurchase(row, purchaseId, quantityIndex = 0) {
  const itemId = uid();
  const perItemCost = row.quantity > 0 ? Number((row.totalCost / row.quantity).toFixed(2)) : row.totalCost;
  const suffix = row.quantity > 1 ? ` (${quantityIndex + 1}/${row.quantity})` : "";

  run(
    `INSERT INTO user_items
     (id, purchase_id, name, card_set, cost_basis, acquisition_date, acquisition_source, status, listing_status, sale_status, listed_on, price_history)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      itemId,
      purchaseId,
      `${row.title}${suffix}`,
      row.cardSet || null,
      perItemCost,
      row.date,
      "ebay",
      "inventory",
      "not_listed",
      "available",
      "[]",
      "[]",
    ],
  );
}

export function importEbayPurchasesCsv(csvText, { addToInventory = true } = {}) {
  const { parsedRows, normalizedRows, skippedInvalid } = parseEbayPurchaseImport(csvText || "");

  return runInImmediateTransaction(() => {
    const existingFingerprints = new Set(
      all("SELECT external_order_id, name, total_cost, date, seller FROM purchases").map((purchase) =>
        buildPurchaseImportFingerprint({
          externalOrderId: purchase.external_order_id,
          title: purchase.name,
          totalCost: purchase.total_cost,
          date: purchase.date,
          seller: purchase.seller,
        }),
      ),
    );
    const summary = {
      parsedRows: parsedRows.length,
      importedPurchases: 0,
      importedItems: 0,
      skippedDuplicates: 0,
      skippedInvalid,
    };

    for (const row of normalizedRows) {
      const fingerprint = buildPurchaseImportFingerprint(row);
      if (existingFingerprints.has(fingerprint)) {
        summary.skippedDuplicates += 1;
        continue;
      }

      const purchaseId = uid();
      run(
        `INSERT INTO purchases
         (id, external_order_id, name, card_set, platform, seller, price, shipping, total_cost, date, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          purchaseId,
          row.externalOrderId,
          row.title,
          row.cardSet || null,
          "ebay",
          row.seller,
          row.price,
          row.shipping,
          row.totalCost,
          row.date,
          buildPurchaseNotes(row),
        ],
      );
      summary.importedPurchases += 1;
      existingFingerprints.add(fingerprint);

      if (addToInventory) {
        for (let i = 0; i < row.quantity; i += 1) {
          createInventoryItemFromPurchase(row, purchaseId, i);
          summary.importedItems += 1;
        }
      }
    }

    return summary;
  });
}
