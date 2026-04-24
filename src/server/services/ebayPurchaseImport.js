import { get, run, runInImmediateTransaction } from "../database.js";
import { uid } from "../routes/shared.js";

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim() !== ""))
    .map((values) =>
      headers.reduce((record, header, index) => {
        record[header] = String(values[index] || "").trim();
        return record;
      }, {}),
    );
}

function firstField(record, names) {
  for (const name of names) {
    const value = record[name];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function parseMoney(value) {
  if (value == null || String(value).trim() === "") return null;
  const cleaned = String(value).replace(/[^0-9.-]+/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseInteger(value, fallback = 1) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function inferSetFromTitle(title) {
  const separators = [" - ", " | ", " / ", ":"];
  for (const separator of separators) {
    if (title.includes(separator)) {
      const [, maybeSet] = title.split(separator, 2);
      if (maybeSet) return maybeSet.trim();
    }
  }
  return "";
}

function normalizeImportRow(record) {
  const title = firstField(record, [
    "item_title",
    "title",
    "listing_title",
    "item_name",
    "name",
  ]);
  if (!title) return null;

  const externalOrderId = firstField(record, [
    "order_number",
    "order_no",
    "order_id",
    "orderid",
    "external_order_id",
  ]);
  const itemSubtotal = parseMoney(firstField(record, [
    "item_subtotal",
    "item_price",
    "price",
    "purchase_price",
    "item_total",
  ]));
  const shipping = parseMoney(firstField(record, [
    "shipping",
    "shipping_and_handling",
    "postage",
    "delivery",
  ])) ?? 0;
  const totalCost = parseMoney(firstField(record, [
    "total",
    "total_price",
    "order_total",
    "amount_paid",
  ]));
  const quantity = parseInteger(firstField(record, [
    "quantity",
    "qty",
  ]), 1);
  const date = normalizeDate(firstField(record, [
    "paid_on",
    "paid_on_date",
    "purchase_date",
    "date",
    "order_date",
  ]));

  return {
    title,
    externalOrderId,
    seller: firstField(record, ["seller", "seller_username", "seller_name"]),
    cardSet: firstField(record, ["card_set", "set"]) || inferSetFromTitle(title),
    price: itemSubtotal ?? totalCost ?? 0,
    shipping,
    totalCost: totalCost ?? ((itemSubtotal ?? 0) + shipping),
    quantity,
    date,
    notes: firstField(record, ["notes", "item_id", "legacy_item_id", "item_number"]),
  };
}

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
  const parsedRows = parseCsv(csvText || "");
  const normalizedRows = parsedRows.map(normalizeImportRow).filter(Boolean);

  return runInImmediateTransaction(() => {
    const summary = {
      parsedRows: parsedRows.length,
      importedPurchases: 0,
      importedItems: 0,
      skippedDuplicates: 0,
      skippedInvalid: parsedRows.length - normalizedRows.length,
    };

    for (const row of normalizedRows) {
      if (row.externalOrderId) {
        const existingPurchase = get(
          "SELECT id FROM purchases WHERE external_order_id = ?",
          [row.externalOrderId],
        );
        if (existingPurchase) {
          summary.skippedDuplicates += 1;
          continue;
        }
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
