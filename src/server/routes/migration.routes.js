import { run } from "../database.js";
import { json } from "../mappers/recordMappers.js";
import { validateMigrationPayload } from "../validation/writeValidators.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function registerMigrationRoutes(app) {
  app.post("/api/migrate", validateMigrationPayload, (req, res) => {
    try {
      const data = req.body;
      const imported = {
        items: 0,
        sales: 0,
        listings: 0,
        trades: 0,
        watchlist: 0,
        gradings: 0,
        purchases: 0,
      };

      const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.catalog)
          ? data.catalog
          : [];

      for (const item of items) {
        try {
          run(
            `INSERT OR IGNORE INTO user_items
             (id, name, card_set, year, card_number, type, rarity, condition,
              parallel, binder, cost_basis, status, listed_on, front_img_id,
              back_img_id, price_estimate, price_history, notes, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              item.id,
              item.name,
              firstDefined(item.set, item.card_set),
              item.year,
              firstDefined(item.number, item.card_number),
              item.type ?? "sports",
              item.rarity,
              item.condition ?? "near_mint",
              item.parallel,
              item.binder,
              firstDefined(item.costBasis, item.cost_basis, 0),
              item.status ?? "inventory",
              json(firstDefined(item.listedOn, item.listed_on)),
              firstDefined(item.frontImgId, item.front_img_id),
              firstDefined(item.backImgId, item.back_img_id),
              json(firstDefined(item.priceEstimate, item.price_estimate)),
              json(firstDefined(item.priceHistory, item.price_history)),
              item.notes,
              firstDefined(item.createdAt, item.created_at),
              firstDefined(item.updatedAt, item.updated_at),
            ],
          );
          imported.items++;
        } catch {}
      }

      const simpleTables = [
        {
          key: "sales",
          table: "sales",
          columns:
            "id,card_id,card_name,card_set,sale_price,cost_basis,platform,fees,shipping_cost,net_profit,listing_id,date",
          values: (sale) => [
            sale.id,
            firstDefined(sale.cardId, sale.card_id),
            firstDefined(sale.cardName, sale.card_name),
            firstDefined(sale.cardSet, sale.card_set),
            firstDefined(sale.salePrice, sale.sale_price),
            firstDefined(sale.costBasis, sale.cost_basis, 0),
            sale.platform,
            firstDefined(sale.fees, 0),
            firstDefined(sale.shippingCost, sale.shipping_cost, 0),
            firstDefined(sale.netProfit, sale.net_profit, 0),
            firstDefined(sale.listingId, sale.listing_id),
            sale.date,
          ],
        },
        {
          key: "trades",
          table: "trades",
          columns: "id,partner,gave,received,gave_value,received_value,date,notes",
          values: (trade) => [
            trade.id,
            trade.partner,
            trade.gave,
            trade.received,
            firstDefined(trade.gaveValue, trade.gave_value, 0),
            firstDefined(trade.receivedValue, trade.received_value, 0),
            trade.date,
            trade.notes,
          ],
        },
        {
          key: "watchlist",
          table: "watchlist",
          columns:
            "id,name,card_set,card_number,target_price,current_price,price_history",
          values: (watch) => [
            watch.id,
            watch.name,
            firstDefined(watch.cardSet, watch.card_set),
            firstDefined(watch.cardNumber, watch.card_number),
            firstDefined(watch.targetPrice, watch.target_price, 0),
            firstDefined(watch.currentPrice, watch.current_price),
            json(firstDefined(watch.priceHistory, watch.price_history)),
          ],
        },
        {
          key: "gradings",
          table: "gradings",
          columns:
            "id,card_name,card_set,card_number,company,service,cost,date_sent,pre_value,status,grade,cert_number,post_value",
          values: (grading) => [
            grading.id,
            firstDefined(grading.cardName, grading.card_name),
            firstDefined(grading.cardSet, grading.card_set),
            firstDefined(grading.cardNumber, grading.card_number),
            grading.company ?? "PSA",
            grading.service ?? "Economy",
            firstDefined(grading.cost, 0),
            firstDefined(grading.dateSent, grading.date_sent),
            firstDefined(grading.preValue, grading.pre_value, 0),
            grading.status ?? "sent",
            grading.grade,
            firstDefined(grading.certNumber, grading.cert_number),
            firstDefined(grading.postValue, grading.post_value, 0),
          ],
        },
        {
          key: "purchases",
          table: "purchases",
          columns:
            "id,name,card_set,platform,seller,price,shipping,total_cost,date,notes",
          values: (purchase) => [
            purchase.id,
            purchase.name,
            firstDefined(purchase.cardSet, purchase.card_set),
            purchase.platform,
            purchase.seller,
            purchase.price,
            firstDefined(purchase.shipping, 0),
            firstDefined(purchase.totalCost, purchase.total_cost, 0),
            purchase.date,
            purchase.notes,
          ],
        },
      ];

      for (const table of simpleTables) {
        if (!Array.isArray(data[table.key])) continue;
        const placeholders = table.columns.split(",").map(() => "?").join(",");
        for (const row of data[table.key]) {
          try {
            run(
              `INSERT OR IGNORE INTO ${table.table} (${table.columns}) VALUES (${placeholders})`,
              table.values(row),
            );
            imported[table.key]++;
          } catch {}
        }
      }

      if (Array.isArray(data.listings)) {
        for (const listing of data.listings) {
          try {
            run(
              `INSERT OR IGNORE INTO listings
               (id,card_id,card_name,card_set,card_number,platform,format,start_price,
                buy_now_price,auction_end_date,shipping,current_bid,status,sold_price,sold_date,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                listing.id,
                firstDefined(listing.cardId, listing.card_id),
                firstDefined(listing.cardName, listing.card_name),
                firstDefined(listing.cardSet, listing.card_set),
                firstDefined(listing.cardNumber, listing.card_number),
                listing.platform,
                listing.format ?? "fixed",
                firstDefined(listing.startPrice, listing.start_price),
                firstDefined(listing.buyNowPrice, listing.buy_now_price),
                firstDefined(listing.auctionEndDate, listing.auction_end_date),
                firstDefined(listing.shipping, 0),
                firstDefined(listing.currentBid, listing.current_bid),
                listing.status ?? "active",
                firstDefined(listing.soldPrice, listing.sold_price),
                firstDefined(listing.soldDate, listing.sold_date),
                listing.notes,
              ],
            );
            imported.listings++;
          } catch {}
        }
      }

      const settings = data.settings || {
        ...(data.userName !== undefined ? { userName: data.userName } : {}),
        ...(data.shipFrom !== undefined ? { shipFrom: data.shipFrom } : {}),
      };

      if (settings && typeof settings === "object") {
        for (const [key, value] of Object.entries(settings)) {
          run(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [key, typeof value === "string" ? value : JSON.stringify(value)],
          );
        }
      }

      res.json({ success: true, imported });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
