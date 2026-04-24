function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36)
      + Array.from(crypto.getRandomValues(new Uint8Array(5)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

export function importEbayPurchasesLocal(csvText, existingPurchases = [], { addToInventory = true } = {}) {
  const parsedRows = parseCsv(csvText || "");
  const normalizedRows = parsedRows.map(normalizeImportRow).filter(Boolean);
  const purchaseIds = new Set(existingPurchases.map((purchase) => purchase.externalOrderId).filter(Boolean));

  const purchases = [];
  const items = [];
  let skippedDuplicates = 0;

  for (const row of normalizedRows) {
    if (row.externalOrderId && purchaseIds.has(row.externalOrderId)) {
      skippedDuplicates += 1;
      continue;
    }

    const purchaseId = uid();
    const purchase = {
      id: purchaseId,
      externalOrderId: row.externalOrderId,
      name: row.title,
      cardSet: row.cardSet || "",
      platform: "ebay",
      seller: row.seller,
      price: row.price,
      shipping: row.shipping,
      totalCost: row.totalCost,
      date: row.date,
      notes: [row.notes, row.quantity > 1 ? `Imported quantity: ${row.quantity}` : null, "Imported from eBay CSV"]
        .filter(Boolean)
        .join(" | "),
      createdAt: new Date().toISOString(),
    };
    purchases.push(purchase);
    if (row.externalOrderId) {
      purchaseIds.add(row.externalOrderId);
    }

    if (addToInventory) {
      const perItemCost = row.quantity > 0 ? Number((row.totalCost / row.quantity).toFixed(2)) : row.totalCost;
      for (let i = 0; i < row.quantity; i += 1) {
        const suffix = row.quantity > 1 ? ` (${i + 1}/${row.quantity})` : "";
        items.push({
          id: uid(),
          purchaseId,
          name: `${row.title}${suffix}`,
          set: row.cardSet || "",
          number: "",
          year: "",
          rarity: "",
          condition: "near_mint",
          binder: "",
          type: "sports",
          status: "inventory",
          listingStatus: "not_listed",
          saleStatus: "available",
          costBasis: perItemCost,
          acquisitionDate: row.date,
          acquisitionSource: "ebay",
          priceEstimate: { low: "", mid: "", high: "" },
          priceHistory: [],
          listedOn: [],
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    parsedRows: parsedRows.length,
    importedPurchases: purchases.length,
    importedItems: items.length,
    skippedDuplicates,
    skippedInvalid: parsedRows.length - normalizedRows.length,
    purchases,
    items,
  };
}
