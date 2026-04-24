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
          const values = [
            item.id,
            firstDefined(item.parallelId, item.parallel_id),
            firstDefined(item.intakeBatchId, item.intake_batch_id),
            firstDefined(item.purchaseId, item.purchase_id),
            item.name,
            firstDefined(item.playerName, item.player_name),
            item.manufacturer,
            item.sport,
            item.team,
            firstDefined(item.set, item.card_set),
            item.year,
            firstDefined(item.number, item.card_number),
            item.type ?? "sports",
            item.rarity,
            item.condition ?? "near_mint",
            item.parallel,
            item.binder,
            firstDefined(item.storageLocation, item.storage_location),
            firstDefined(item.costBasis, item.cost_basis, 0),
            firstDefined(item.acquisitionDate, item.acquisition_date),
            firstDefined(item.acquisitionSource, item.acquisition_source),
            item.status ?? "inventory",
            firstDefined(item.listingStatus, item.listing_status, "not_listed"),
            firstDefined(item.saleStatus, item.sale_status, "available"),
            json(firstDefined(item.listedOn, item.listed_on)),
            firstDefined(item.frontImgId, item.front_img_id),
            firstDefined(item.backImgId, item.back_img_id),
            firstDefined(item.frontImgPhash, item.front_img_phash),
            json(firstDefined(item.priceEstimate, item.price_estimate)),
            json(firstDefined(item.priceHistory, item.price_history)),
            firstDefined(item.marketPrice, item.market_price, 0),
            firstDefined(item.suggestedListingPrice, item.suggested_listing_price, 0),
            firstDefined(item.minAcceptablePrice, item.min_acceptable_price, 0),
            firstDefined(item.lastCompPrice, item.last_comp_price, 0),
            firstDefined(item.averageCompPrice, item.average_comp_price, 0),
            firstDefined(item.psa9Price, item.psa9_price, 0),
            firstDefined(item.psa10Price, item.psa10_price, 0),
            firstDefined(item.profitRealized, item.profit_realized, 0),
            firstDefined(item.soldAt, item.sold_at),
            item.notes,
            firstDefined(item.centering),
            firstDefined(item.corners),
            firstDefined(item.edges),
            firstDefined(item.surface),
            firstDefined(item.projectedGrade, item.projected_grade),
            firstDefined(item.gradingCandidate, item.grading_candidate, 0),
            firstDefined(item.gradingDecision, item.grading_decision),
            firstDefined(item.vaultStatus, item.vault_status),
            firstDefined(item.conditionReport, item.condition_report),
            firstDefined(item.cvCenteringLr, item.cv_centering_lr),
            firstDefined(item.cvCenteringTb, item.cv_centering_tb),
            firstDefined(item.cvCenteringScore, item.cv_centering_score),
            firstDefined(item.cvProcessed, item.cv_processed, 0),
            firstDefined(item.ebayCentering, item.ebay_centering),
            firstDefined(item.ebayCornerSharpness, item.ebay_corner_sharpness),
            firstDefined(item.ebayEdgeChipping, item.ebay_edge_chipping),
            firstDefined(item.createdAt, item.created_at),
            firstDefined(item.updatedAt, item.updated_at),
          ];
          const placeholders = values.map(() => "?").join(",");
          run(
            `INSERT OR IGNORE INTO user_items
             (id, parallel_id, intake_batch_id, purchase_id, name, player_name,
              manufacturer, sport, team, card_set, year, card_number, type, rarity,
              condition, parallel, binder, storage_location, cost_basis, acquisition_date,
             acquisition_source, status, listing_status, sale_status, listed_on,
             front_img_id, back_img_id, front_img_phash, price_estimate, price_history, market_price,
             suggested_listing_price, min_acceptable_price, last_comp_price,
             average_comp_price, psa9_price, psa10_price, profit_realized, sold_at,
             notes, centering, corners, edges, surface, projected_grade,
             grading_candidate, grading_decision, vault_status, condition_report, cv_centering_lr,
             cv_centering_tb, cv_centering_score, cv_processed, ebay_centering,
             ebay_corner_sharpness, ebay_edge_chipping, created_at, updated_at)
             VALUES (${placeholders})`,
            values,
          );
          imported.items++;
        } catch {}
      }

      const simpleTables = [
        {
          key: "sales",
          table: "sales",
          columns:
            "id,card_id,order_id,card_name,card_set,sale_price,cost_basis,platform,buyer_handle,fees,shipping_cost,packaging_cost,grading_cost,tax_collected,payout_amount,net_profit,tracking_number,listing_id,date",
          values: (sale) => [
            sale.id,
            firstDefined(sale.cardId, sale.card_id),
            firstDefined(sale.orderId, sale.order_id),
            firstDefined(sale.cardName, sale.card_name),
            firstDefined(sale.cardSet, sale.card_set),
            firstDefined(sale.salePrice, sale.sale_price),
            firstDefined(sale.costBasis, sale.cost_basis, 0),
            sale.platform,
            firstDefined(sale.buyerHandle, sale.buyer_handle),
            firstDefined(sale.fees, 0),
            firstDefined(sale.shippingCost, sale.shipping_cost, 0),
            firstDefined(sale.packagingCost, sale.packaging_cost, 0),
            firstDefined(sale.gradingCost, sale.grading_cost, 0),
            firstDefined(sale.taxCollected, sale.tax_collected, 0),
            firstDefined(sale.payoutAmount, sale.payout_amount, 0),
            firstDefined(sale.netProfit, sale.net_profit, 0),
            firstDefined(sale.trackingNumber, sale.tracking_number),
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
               (id,card_id,external_listing_id,card_name,card_set,card_number,platform,
               listing_title,listing_description,category_path,item_specifics,shipping_profile,
                image_count,automation_state,pricing_strategy,format,start_price,buy_now_price,
                auction_end_date,shipping,shipping_weight_oz,export_batch_id,current_bid,quantity,status,
                publish_status,publish_error,last_sync_at,sold_price,sold_date,notes,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                listing.id,
                firstDefined(listing.cardId, listing.card_id),
                firstDefined(listing.externalListingId, listing.external_listing_id),
                firstDefined(listing.cardName, listing.card_name),
                firstDefined(listing.cardSet, listing.card_set),
                firstDefined(listing.cardNumber, listing.card_number),
                listing.platform,
                firstDefined(listing.listingTitle, listing.listing_title),
                firstDefined(listing.listingDescription, listing.listing_description),
                firstDefined(listing.categoryPath, listing.category_path),
                json(firstDefined(listing.itemSpecifics, listing.item_specifics)),
                json(firstDefined(listing.shippingProfile, listing.shipping_profile)),
                firstDefined(listing.imageCount, listing.image_count, 0),
                firstDefined(listing.automationState, listing.automation_state, "draft"),
                firstDefined(listing.pricingStrategy, listing.pricing_strategy, "market"),
                listing.format ?? "fixed",
                firstDefined(listing.startPrice, listing.start_price),
                firstDefined(listing.buyNowPrice, listing.buy_now_price),
                firstDefined(listing.auctionEndDate, listing.auction_end_date),
                firstDefined(listing.shipping, 0),
                firstDefined(listing.shippingWeightOz, listing.shipping_weight_oz, 0),
                firstDefined(listing.exportBatchId, listing.export_batch_id),
                firstDefined(listing.currentBid, listing.current_bid),
                firstDefined(listing.quantity, 1),
                listing.status ?? "active",
                firstDefined(listing.publishStatus, listing.publish_status, listing.status ?? "active"),
                firstDefined(listing.publishError, listing.publish_error),
                firstDefined(listing.lastSyncAt, listing.last_sync_at),
                firstDefined(listing.soldPrice, listing.sold_price),
                firstDefined(listing.soldDate, listing.sold_date),
                listing.notes,
                firstDefined(listing.createdAt, listing.created_at),
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
