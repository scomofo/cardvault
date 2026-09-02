import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("server routes handle validation, migration, and listing side effects", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-routes-" });

  const invalidItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listedOn: "bad" }),
  });
  assert.equal(invalidItemResponse.status, 400);

  const migrateResponse = await fetch(`${baseUrl}/api/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      catalog: [
        {
          id: "migrated-item",
          name: "Migrated Card",
          set: "Seed Set",
          number: "7",
          listedOn: [],
          priceHistory: [],
        },
      ],
      settings: { userName: "Route Test" },
    }),
  });
  assert.equal(migrateResponse.status, 200);
  const migratePayload = await migrateResponse.json();
  assert.equal(migratePayload.success, true);
  assert.equal(migratePayload.imported.items, 1);

  const migrateZeroValuesResponse = await fetch(`${baseUrl}/api/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sales: [
        {
          id: "migrated-sale-zero",
          cardName: "Zero Sale",
          cardSet: "Zero Set",
          salePrice: 0,
          costBasis: 0,
          fees: 0,
          shippingCost: 0,
          netProfit: 0,
          date: "2026-04-24",
        },
      ],
      trades: [
        {
          id: "migrated-trade-zero",
          partner: "Zero Partner",
          gave: "Nothing",
          received: "Something",
          gaveValue: 0,
          receivedValue: 0,
          date: "2026-04-24",
        },
      ],
      watchlist: [
        {
          id: "migrated-watch-zero",
          name: "Zero Watch",
          cardSet: "Zero Set",
          cardNumber: "0",
          targetPrice: 0,
          currentPrice: 0,
          priceHistory: [],
        },
      ],
      gradings: [
        {
          id: "migrated-grading-zero",
          cardName: "Zero Grade",
          cardSet: "Zero Set",
          cardNumber: "0",
          company: "PSA",
          service: "Economy",
          cost: 0,
          preValue: 0,
          status: "sent",
          postValue: 0,
        },
      ],
      purchases: [
        {
          id: "migrated-purchase-zero",
          name: "Zero Purchase",
          cardSet: "Zero Set",
          price: 0,
          shipping: 0,
          totalCost: 0,
          date: "2026-04-24",
        },
      ],
      listings: [
        {
          id: "migrated-listing-zero",
          cardName: "Zero Listing",
          cardSet: "Zero Set",
          cardNumber: "0",
          platform: "ebay",
          format: "fixed",
          startPrice: 0,
          buyNowPrice: 0,
          shipping: 0,
          currentBid: 0,
          status: "draft",
          soldPrice: 0,
          soldDate: "2026-04-24T00:00:00.000Z",
        },
      ],
    }),
  });
  assert.equal(migrateZeroValuesResponse.status, 200);

  const migrateRichMetadataResponse = await fetch(`${baseUrl}/api/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          id: "migrated-rich-item",
          name: "Rich Card",
          playerName: "Wayne Gretzky",
          manufacturer: "O-Pee-Chee",
          sport: "hockey",
          team: "Oilers",
          set: "Rich Set",
          year: "1985",
          number: "99",
          type: "sports",
          rarity: "rare",
          condition: "mint",
          parallel: "Rainbow",
          binder: "Binder A",
          storageLocation: "Shelf 1",
          costBasis: 12.5,
          acquisitionDate: "2026-04-01",
          acquisitionSource: "trade",
          status: "listed",
          listingStatus: "draft",
          saleStatus: "available",
          listedOn: ["ebay"],
          frontImgId: "front-rich",
          backImgId: "back-rich",
          frontImgPhash: "phash-rich",
          priceEstimate: { low: 10, mid: 20, high: 30 },
          priceHistory: [{ price: 18, date: "2026-04-20" }],
          marketPrice: 19.5,
          suggestedListingPrice: 24.5,
          minAcceptablePrice: 15,
          lastCompPrice: 18.25,
          averageCompPrice: 17.75,
          psa9Price: 45,
          psa10Price: 120,
          profitRealized: 0,
          notes: "rich note",
          centering: 9,
          corners: 8,
          edges: 9,
          surface: 8,
          projectedGrade: 8.5,
          gradingCandidate: 1,
          gradingDecision: "grade",
          vaultStatus: "GREEN",
          conditionReport: "Sharp copy",
          cvCenteringLr: "50/50",
          cvCenteringTb: "52/48",
          cvCenteringScore: 0.95,
          cvProcessed: 1,
          ebayCentering: "50/50",
          ebayCornerSharpness: "sharp",
          ebayEdgeChipping: "none",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-11T00:00:00.000Z",
        },
      ],
      sales: [
        {
          id: "migrated-sale-rich",
          cardId: "migrated-rich-item",
          cardName: "Rich Sale",
          cardSet: "Rich Set",
          salePrice: 42.5,
          costBasis: 10,
          platform: "ebay",
          buyerHandle: "buyer-rich",
          fees: 3.25,
          shippingCost: 1.5,
          packagingCost: 0.25,
          gradingCost: 2,
          taxCollected: 4.75,
          payoutAmount: 35.5,
          netProfit: 28.25,
          trackingNumber: "TRK-RICH-001",
          listingId: "migrated-rich-listing",
          date: "2026-04-24T10:00:00.000Z",
        },
      ],
      listings: [
        {
          id: "migrated-rich-listing",
          cardId: "migrated-rich-item",
          externalListingId: "EXT-123",
          cardName: "Rich Card",
          cardSet: "Rich Set",
          cardNumber: "99",
          platform: "ebay",
          listingTitle: "Rich Listing Title",
          listingDescription: "Rich listing description",
          categoryPath: "Sports Cards > Hockey",
          itemSpecifics: { Player: "Wayne Gretzky" },
          shippingProfile: { service: "tracked" },
          imageCount: 2,
          automationState: "ready",
          pricingStrategy: "premium",
          format: "fixed",
          startPrice: 29.99,
          buyNowPrice: 34.99,
          auctionEndDate: "2026-05-01T00:00:00.000Z",
          shipping: 3.5,
          shippingWeightOz: 4,
          exportBatchId: "batch-rich",
          currentBid: 0,
          quantity: 3,
          status: "active",
          publishStatus: "revised",
          publishError: "sync warning",
          lastSyncAt: "2026-04-24T12:00:00.000Z",
          soldPrice: null,
          soldDate: null,
          notes: "rich listing note",
          createdAt: "2026-04-12T00:00:00.000Z",
        },
      ],
      orders: [
        {
          id: "migrated-order-rich",
          saleId: "migrated-sale-rich",
          listingId: "migrated-rich-listing",
          itemId: "migrated-rich-item",
          platform: "ebay",
          externalOrderId: "EXT-ORDER-1",
          buyerHandle: "buyer-rich",
          salePrice: 42.5,
          fees: 3.25,
          shippingCharge: 1.5,
          taxCollected: 4.75,
          destinationCountry: "US",
          destinationPostalCode: "90210",
          paymentStatus: "paid",
          fulfillmentStatus: "pending",
          soldAt: "2026-04-24T10:00:00.000Z",
          createdAt: "2026-04-24T10:05:00.000Z",
        },
      ],
    }),
  });
  assert.equal(migrateRichMetadataResponse.status, 200);

  const createdItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-item",
      name: "Route Card",
      set: "Route Set",
      number: "1",
      costBasis: 3.5,
      frontImgPhash: "route-phash",
      ebayCentering: "55/45",
      ebayCornerSharpness: "very_sharp",
      ebayEdgeChipping: "minor",
      gradingDecision: "hold",
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(createdItemResponse.status, 201);

  const createdListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-listing",
      cardId: "route-item",
      cardName: "Route Card",
      cardSet: "Route Set",
      cardNumber: "1",
      platform: "ebay",
      format: "fixed",
      startPrice: 12.5,
      shipping: 1.25,
      quantity: 2,
      publishError: "pending sync",
      lastSyncAt: "2026-04-24T13:00:00.000Z",
    }),
  });
  assert.equal(createdListingResponse.status, 201);
  const createdListingPayload = await createdListingResponse.json();
  assert.equal(createdListingPayload.quantity, 2);
  assert.equal(createdListingPayload.publishError, "pending sync");
  assert.equal(createdListingPayload.lastSyncAt, "2026-04-24T13:00:00.000Z");

  const itemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(itemResponse.status, 200);
  const itemPayload = await itemResponse.json();
  assert.equal(itemPayload.status, "listed");
  assert.equal(itemPayload.frontImgPhash, "route-phash");
  assert.equal(itemPayload.ebayCentering, "55/45");
  assert.equal(itemPayload.ebayCornerSharpness, "very_sharp");
  assert.equal(itemPayload.ebayEdgeChipping, "minor");
  assert.equal(itemPayload.gradingDecision, "hold");

  const migratedRichItemResponse = await fetch(`${baseUrl}/api/items/migrated-rich-item`);
  assert.equal(migratedRichItemResponse.status, 200);
  const migratedRichItemPayload = await migratedRichItemResponse.json();
  assert.equal(migratedRichItemPayload.playerName, "Wayne Gretzky");
  assert.equal(migratedRichItemPayload.storageLocation, "Shelf 1");
  assert.equal(migratedRichItemPayload.acquisitionDate, "2026-04-01");
  assert.equal(migratedRichItemPayload.acquisitionSource, "trade");
  assert.equal(migratedRichItemPayload.listingStatus, "draft");
  assert.deepEqual(migratedRichItemPayload.listedOn, ["ebay"]);
  assert.equal(migratedRichItemPayload.frontImgPhash, "phash-rich");
  assert.deepEqual(migratedRichItemPayload.priceEstimate, { low: 10, mid: 20, high: 30 });
  assert.deepEqual(migratedRichItemPayload.priceHistory, [{ price: 18, date: "2026-04-20" }]);
  assert.equal(migratedRichItemPayload.marketPrice, 19.5);
  assert.equal(migratedRichItemPayload.suggestedListingPrice, 24.5);
  assert.equal(migratedRichItemPayload.minAcceptablePrice, 15);
  assert.equal(migratedRichItemPayload.lastCompPrice, 18.25);
  assert.equal(migratedRichItemPayload.averageCompPrice, 17.75);
  assert.equal(migratedRichItemPayload.psa9Price, 45);
  assert.equal(migratedRichItemPayload.psa10Price, 120);
  assert.equal(migratedRichItemPayload.gradingCandidate, 1);
  assert.equal(migratedRichItemPayload.gradingDecision, "grade");
  assert.equal(migratedRichItemPayload.vaultStatus, "GREEN");
  assert.equal(migratedRichItemPayload.conditionReport, "Sharp copy");
  assert.equal(migratedRichItemPayload.cvCenteringLr, "50/50");
  assert.equal(migratedRichItemPayload.cvProcessed, 1);
  assert.equal(migratedRichItemPayload.ebayCentering, "50/50");
  assert.equal(migratedRichItemPayload.ebayCornerSharpness, "sharp");
  assert.equal(migratedRichItemPayload.ebayEdgeChipping, "none");

  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsResponse.status, 200);
  const listingsPayload = await listingsResponse.json();
  const migratedRichListing = listingsPayload.find((listing) => listing.id === "migrated-rich-listing");
  assert.equal(migratedRichListing.externalListingId, "EXT-123");
  assert.equal(migratedRichListing.listingTitle, "Rich Listing Title");
  assert.equal(migratedRichListing.listingDescription, "Rich listing description");
  assert.equal(migratedRichListing.categoryPath, "Sports Cards > Hockey");
  assert.deepEqual(migratedRichListing.itemSpecifics, { Player: "Wayne Gretzky" });
  assert.deepEqual(migratedRichListing.shippingProfile, { service: "tracked" });
  assert.equal(migratedRichListing.imageCount, 2);
  assert.equal(migratedRichListing.automationState, "ready");
  assert.equal(migratedRichListing.pricingStrategy, "premium");
  assert.equal(migratedRichListing.buyNowPrice, 34.99);
  assert.equal(migratedRichListing.shippingWeightOz, 4);
  assert.equal(migratedRichListing.exportBatchId, "batch-rich");
  assert.equal(migratedRichListing.quantity, 3);
  assert.equal(migratedRichListing.publishStatus, "revised");
  assert.equal(migratedRichListing.publishError, "sync warning");
  assert.equal(migratedRichListing.lastSyncAt, "2026-04-24T12:00:00.000Z");

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  const migratedOrderRich = ordersPayload.find((order) => order.id === "migrated-order-rich");
  assert.equal(migratedOrderRich.saleId, "migrated-sale-rich");
  assert.equal(migratedOrderRich.listingId, "migrated-rich-listing");
  assert.equal(migratedOrderRich.itemId, "migrated-rich-item");
  assert.equal(migratedOrderRich.externalOrderId, "EXT-ORDER-1");
  assert.equal(migratedOrderRich.buyerHandle, "buyer-rich");
  assert.equal(migratedOrderRich.destinationCountry, "US");
  assert.equal(migratedOrderRich.destinationPostalCode, "90210");
  assert.equal(migratedOrderRich.fulfillmentStatus, "pending");
  assert.equal("sale_id" in migratedOrderRich, false);
  assert.equal("external_order_id" in migratedOrderRich, false);

  const draftItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-item",
      name: "Draft Route Card",
      set: "Route Set",
      number: "0",
      costBasis: 2.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(draftItemResponse.status, 201);

  const draftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-listing",
      cardId: "draft-route-item",
      cardName: "Draft Route Card",
      cardSet: "Route Set",
      cardNumber: "0",
      platform: "ebay",
      format: "fixed",
      startPrice: 10.5,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(draftListingResponse.status, 201);
  const draftListingPayload = await draftListingResponse.json();
  assert.equal(draftListingPayload.publishStatus, "draft");

  const draftedItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(draftedItemResponse.status, 200);
  const draftedItemPayload = await draftedItemResponse.json();
  assert.equal(draftedItemPayload.status, "listed");
  assert.equal(draftedItemPayload.listingStatus, "draft");
  assert.equal(draftedItemPayload.saleStatus, "available");

  const activateDraftListingResponse = await fetch(`${baseUrl}/api/listings/draft-route-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-listing",
      cardId: "draft-route-item",
      cardName: "Draft Route Card",
      cardSet: "Route Set",
      cardNumber: "0",
      platform: "ebay",
      format: "fixed",
      startPrice: 10.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(activateDraftListingResponse.status, 200);

  const activeDraftItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(activeDraftItemResponse.status, 200);
  const activeDraftItemPayload = await activeDraftItemResponse.json();
  assert.equal(activeDraftItemPayload.listingStatus, "listed");

  const redraftListingResponse = await fetch(`${baseUrl}/api/listings/draft-route-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-listing",
      cardId: "draft-route-item",
      cardName: "Draft Route Card",
      cardSet: "Route Set",
      cardNumber: "0",
      platform: "ebay",
      format: "fixed",
      startPrice: 10.5,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(redraftListingResponse.status, 200);
  const redraftListingPayload = await redraftListingResponse.json();
  assert.equal(redraftListingPayload.publishStatus, "draft");

  const redraftedItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(redraftedItemResponse.status, 200);
  const redraftedItemPayload = await redraftedItemResponse.json();
  assert.equal(redraftedItemPayload.status, "listed");
  assert.equal(redraftedItemPayload.listingStatus, "draft");
  assert.equal(redraftedItemPayload.saleStatus, "available");

  const soldAt = "2026-04-24T18:30:00.000Z";
  const updatedListingResponse = await fetch(`${baseUrl}/api/listings/route-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-listing",
      cardId: "route-item",
      cardName: "Route Card",
      cardSet: "Route Set",
      cardNumber: "1",
      platform: "ebay",
      format: "fixed",
      startPrice: 12.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 12.5,
      soldDate: soldAt,
    }),
  });
  assert.equal(updatedListingResponse.status, 200);
  const updatedListingPayload = await updatedListingResponse.json();
  assert.equal(updatedListingPayload.status, "sold");
  assert.equal(updatedListingPayload.publishStatus, "sold");
  assert.equal(updatedListingPayload.soldDate, soldAt);

  const soldItemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(soldItemResponse.status, 200);
  const soldItemPayload = await soldItemResponse.json();
  assert.equal(soldItemPayload.status, "sold");
  assert.equal(soldItemPayload.listingStatus, "ended");
  assert.equal(soldItemPayload.saleStatus, "sold");
  assert.equal(soldItemPayload.soldAt, soldAt);

  const reopenedListingResponse = await fetch(`${baseUrl}/api/listings/route-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-listing",
      cardId: "route-item",
      cardName: "Route Card",
      cardSet: "Route Set",
      cardNumber: "1",
      platform: "ebay",
      format: "fixed",
      startPrice: 12.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(reopenedListingResponse.status, 200);
  const reopenedListingPayload = await reopenedListingResponse.json();
  assert.equal(reopenedListingPayload.status, "active");
  assert.equal(reopenedListingPayload.publishStatus, "active");
  assert.equal(reopenedListingPayload.soldPrice, null);
  assert.equal(reopenedListingPayload.soldDate, null);

  const reopenedItemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(reopenedItemResponse.status, 200);
  const reopenedItemPayload = await reopenedItemResponse.json();
  assert.equal(reopenedItemPayload.status, "listed");
  assert.equal(reopenedItemPayload.listingStatus, "listed");
  assert.equal(reopenedItemPayload.saleStatus, "available");
  assert.equal(reopenedItemPayload.soldAt, null);

  const multiItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-item",
      name: "Multi Route Card",
      set: "Route Set",
      number: "3",
      costBasis: 5.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(multiItemResponse.status, 201);

  const firstMultiListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-a",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "ebay",
      format: "fixed",
      startPrice: 15.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 15.5,
      soldDate: "2026-04-24T19:00:00.000Z",
    }),
  });
  assert.equal(firstMultiListingResponse.status, 201);

  const secondMultiListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-b",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "shopify",
      format: "fixed",
      startPrice: 16.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 16.5,
      soldDate: "2026-04-24T19:05:00.000Z",
    }),
  });
  assert.equal(secondMultiListingResponse.status, 201);

  const unsellOneListingResponse = await fetch(`${baseUrl}/api/listings/multi-route-listing-a`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-a",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "ebay",
      format: "fixed",
      startPrice: 15.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(unsellOneListingResponse.status, 200);

  const stillSoldItemResponse = await fetch(`${baseUrl}/api/items/multi-route-item`);
  assert.equal(stillSoldItemResponse.status, 200);
  const stillSoldItemPayload = await stillSoldItemResponse.json();
  assert.equal(stillSoldItemPayload.status, "sold");
  assert.equal(stillSoldItemPayload.listingStatus, "ended");
  assert.equal(stillSoldItemPayload.saleStatus, "sold");

  const deleteSoldSiblingResponse = await fetch(`${baseUrl}/api/listings/multi-route-listing-b`, {
    method: "DELETE",
  });
  assert.equal(deleteSoldSiblingResponse.status, 200);

  const revertedMultiItemResponse = await fetch(`${baseUrl}/api/items/multi-route-item`);
  assert.equal(revertedMultiItemResponse.status, 200);
  const revertedMultiItemPayload = await revertedMultiItemResponse.json();
  assert.equal(revertedMultiItemPayload.status, "listed");
  assert.equal(revertedMultiItemPayload.listingStatus, "listed");
  assert.equal(revertedMultiItemPayload.saleStatus, "available");
  assert.equal(revertedMultiItemPayload.soldAt, null);

  const soldCreateItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-item",
      name: "Sold Create Card",
      set: "Route Set",
      number: "4",
      costBasis: 6.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(soldCreateItemResponse.status, 201);

  const soldCreateListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-listing-a",
      cardId: "sold-create-item",
      cardName: "Sold Create Card",
      cardSet: "Route Set",
      cardNumber: "4",
      platform: "ebay",
      format: "fixed",
      startPrice: 17.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 17.5,
      soldDate: "2026-04-24T19:10:00.000Z",
    }),
  });
  assert.equal(soldCreateListingResponse.status, 201);
  const soldCreateListingPayload = await soldCreateListingResponse.json();
  assert.equal(soldCreateListingPayload.publishStatus, "sold");
  assert.equal(soldCreateListingPayload.soldPrice, 17.5);
  assert.equal(soldCreateListingPayload.soldDate, "2026-04-24T19:10:00.000Z");

  const activeSiblingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-listing-b",
      cardId: "sold-create-item",
      cardName: "Sold Create Card",
      cardSet: "Route Set",
      cardNumber: "4",
      platform: "shopify",
      format: "fixed",
      startPrice: 18.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(activeSiblingResponse.status, 201);

  const stillSoldAfterCreateResponse = await fetch(`${baseUrl}/api/items/sold-create-item`);
  assert.equal(stillSoldAfterCreateResponse.status, 200);
  const stillSoldAfterCreatePayload = await stillSoldAfterCreateResponse.json();
  assert.equal(stillSoldAfterCreatePayload.status, "sold");
  assert.equal(stillSoldAfterCreatePayload.listingStatus, "ended");
  assert.equal(stillSoldAfterCreatePayload.saleStatus, "sold");

  const soldDraftItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-item",
      name: "Sold Draft Card",
      set: "Route Set",
      number: "5",
      costBasis: 7.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(soldDraftItemResponse.status, 201);

  const soldDraftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-listing-a",
      cardId: "sold-draft-item",
      cardName: "Sold Draft Card",
      cardSet: "Route Set",
      cardNumber: "5",
      platform: "ebay",
      format: "fixed",
      startPrice: 19.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 19.5,
      soldDate: "2026-04-24T19:20:00.000Z",
    }),
  });
  assert.equal(soldDraftListingResponse.status, 201);

  const siblingDraftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-listing-b",
      cardId: "sold-draft-item",
      cardName: "Sold Draft Card",
      cardSet: "Route Set",
      cardNumber: "5",
      platform: "shopify",
      format: "fixed",
      startPrice: 20.5,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(siblingDraftListingResponse.status, 201);

  const deleteSoldDraftResponse = await fetch(`${baseUrl}/api/listings/sold-draft-listing-a`, {
    method: "DELETE",
  });
  assert.equal(deleteSoldDraftResponse.status, 200);

  const reopenedDraftItemResponse = await fetch(`${baseUrl}/api/items/sold-draft-item`);
  assert.equal(reopenedDraftItemResponse.status, 200);
  const reopenedDraftItemPayload = await reopenedDraftItemResponse.json();
  assert.equal(reopenedDraftItemPayload.status, "listed");
  assert.equal(reopenedDraftItemPayload.listingStatus, "draft");
  assert.equal(reopenedDraftItemPayload.saleStatus, "available");
  assert.equal(reopenedDraftItemPayload.soldAt, null);

  const secondItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "delete-route-item",
      name: "Delete Route Card",
      set: "Route Set",
      number: "2",
      costBasis: 4.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(secondItemResponse.status, 201);

  const secondListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "delete-route-listing",
      cardId: "delete-route-item",
      cardName: "Delete Route Card",
      cardSet: "Route Set",
      cardNumber: "2",
      platform: "ebay",
      format: "fixed",
      startPrice: 14.5,
      shipping: 1.25,
    }),
  });
  assert.equal(secondListingResponse.status, 201);

  const deleteListingResponse = await fetch(`${baseUrl}/api/listings/delete-route-listing`, {
    method: "DELETE",
  });
  assert.equal(deleteListingResponse.status, 200);

  const revertedItemResponse = await fetch(`${baseUrl}/api/items/delete-route-item`);
  assert.equal(revertedItemResponse.status, 200);
  const revertedItemPayload = await revertedItemResponse.json();
  assert.equal(revertedItemPayload.status, "inventory");
  assert.equal(revertedItemPayload.listingStatus, "not_listed");
  assert.equal(revertedItemPayload.saleStatus, "available");

  const settingsResponse = await fetch(`${baseUrl}/api/settings`);
  const settingsPayload = await settingsResponse.json();
  assert.equal(settingsPayload.userName, "Route Test");

  const createdPurchaseResponse = await fetch(`${baseUrl}/api/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-purchase",
      name: "Purchase Card",
      card_set: "Purchase Set",
      platform: "ebay",
      seller: "seller-1",
      price: 25,
      shipping: 3.5,
      total_cost: 28.5,
      date: "2026-04-24",
      notes: "Route purchase",
    }),
  });
  assert.equal(createdPurchaseResponse.status, 201);
  const createdPurchasePayload = await createdPurchaseResponse.json();
  assert.equal(createdPurchasePayload.cardSet, "Purchase Set");
  assert.equal(createdPurchasePayload.totalCost, 28.5);
  assert.ok("createdAt" in createdPurchasePayload);
  assert.equal("card_set" in createdPurchasePayload, false);
  assert.equal("total_cost" in createdPurchasePayload, false);

  const purchasesResponse = await fetch(`${baseUrl}/api/purchases`);
  assert.equal(purchasesResponse.status, 200);
  const purchasesPayload = await purchasesResponse.json();
  assert.equal(Array.isArray(purchasesPayload), true);
  const createdPurchaseEntry = purchasesPayload.find((purchase) => purchase.id === "route-purchase");
  assert.equal(createdPurchaseEntry.cardSet, "Purchase Set");
  assert.equal(createdPurchaseEntry.totalCost, 28.5);
  assert.ok("createdAt" in createdPurchaseEntry);
  assert.equal("card_set" in createdPurchaseEntry, false);
  assert.equal("total_cost" in createdPurchaseEntry, false);
  const migratedPurchaseZero = purchasesPayload.find((purchase) => purchase.id === "migrated-purchase-zero");
  assert.equal(migratedPurchaseZero.shipping, 0);
  assert.equal(migratedPurchaseZero.totalCost, 0);

  const salesResponse = await fetch(`${baseUrl}/api/sales`);
  assert.equal(salesResponse.status, 200);
  const salesPayload = await salesResponse.json();
  const migratedSaleZero = salesPayload.find((sale) => sale.id === "migrated-sale-zero");
  assert.equal(migratedSaleZero.salePrice, 0);
  assert.equal(migratedSaleZero.costBasis, 0);
  assert.equal(migratedSaleZero.shippingCost, 0);

  const migratedSaleRich = salesPayload.find((sale) => sale.id === "migrated-sale-rich");
  assert.equal(migratedSaleRich.orderId, "migrated-order-rich");
  assert.equal(migratedSaleRich.buyerHandle, "buyer-rich");
  assert.equal(migratedSaleRich.packagingCost, 0.25);
  assert.equal(migratedSaleRich.gradingCost, 2);
  assert.equal(migratedSaleRich.taxCollected, 4.75);
  assert.equal(migratedSaleRich.payoutAmount, 35.5);
  assert.equal(migratedSaleRich.trackingNumber, "TRK-RICH-001");
  assert.equal("order_id" in migratedSaleRich, false);
  assert.equal("buyer_handle" in migratedSaleRich, false);

  const createdConnectionResponse = await fetch(`${baseUrl}/api/marketplace-connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marketplace: "shopify",
      shopName: "route-store",
      metadata: { region: "ca" },
    }),
  });
  assert.equal(createdConnectionResponse.status, 201);
  const createdConnectionPayload = await createdConnectionResponse.json();
  assert.equal(createdConnectionPayload.marketplace, "shopify");
  assert.equal(createdConnectionPayload.accountLabel, "route-store");
  assert.equal(createdConnectionPayload.authStatus, "configured");
  assert.deepEqual(createdConnectionPayload.metadata, { region: "ca" });
  assert.ok("createdAt" in createdConnectionPayload);
  assert.equal("account_label" in createdConnectionPayload, false);
  assert.equal("auth_status" in createdConnectionPayload, false);
  assert.equal("access_token" in createdConnectionPayload, false);
  assert.equal("refresh_token" in createdConnectionPayload, false);

  const connectionsResponse = await fetch(`${baseUrl}/api/marketplace-connections`);
  assert.equal(connectionsResponse.status, 200);
  const connectionsPayload = await connectionsResponse.json();
  assert.equal(Array.isArray(connectionsPayload), true);
  assert.equal(connectionsPayload[0].accountLabel, "route-store");
  assert.equal(connectionsPayload[0].authStatus, "configured");
  assert.deepEqual(connectionsPayload[0].metadata, { region: "ca" });
  assert.ok("updatedAt" in connectionsPayload[0]);
  assert.equal("access_token" in connectionsPayload[0], false);
  assert.equal("refresh_token" in connectionsPayload[0], false);

  const tradeResponse = await fetch(`${baseUrl}/api/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-trade",
      partner: "Trade Partner",
      gave: "Card A",
      received: "Card B",
      gaveValue: 5,
      receivedValue: 7.5,
      date: "2026-04-24",
      notes: "Route trade",
    }),
  });
  assert.equal(tradeResponse.status, 201);
  const tradePayload = await tradeResponse.json();
  assert.equal(tradePayload.gaveValue, 5);
  assert.equal(tradePayload.receivedValue, 7.5);
  assert.ok("createdAt" in tradePayload);
  assert.equal("gave_value" in tradePayload, false);

  const watchlistResponse = await fetch(`${baseUrl}/api/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-watch",
      name: "Watch Card",
      cardSet: "Watch Set",
      cardNumber: "9",
      targetPrice: 15,
      currentPrice: 12.5,
      priceHistory: [{ price: 12.5, date: "2026-04-24" }],
    }),
  });
  assert.equal(watchlistResponse.status, 201);
  const watchlistPayload = await watchlistResponse.json();
  assert.equal(watchlistPayload.cardSet, "Watch Set");
  assert.equal(watchlistPayload.cardNumber, "9");
  assert.equal(watchlistPayload.targetPrice, 15);
  assert.equal(watchlistPayload.currentPrice, 12.5);
  assert.deepEqual(watchlistPayload.priceHistory, [{ price: 12.5, date: "2026-04-24" }]);
  assert.equal("target_price" in watchlistPayload, false);

  const gradingResponse = await fetch(`${baseUrl}/api/gradings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-grading",
      cardName: "Grade Card",
      cardSet: "Grade Set",
      cardNumber: "10",
      company: "PSA",
      service: "Economy",
      cost: 22,
      dateSent: "2026-04-24",
      preValue: 40,
      status: "sent",
      certNumber: "CERT-1",
      postValue: 75,
    }),
  });
  assert.equal(gradingResponse.status, 201);
  const gradingPayload = await gradingResponse.json();
  assert.equal(gradingPayload.cardName, "Grade Card");
  assert.equal(gradingPayload.cardSet, "Grade Set");
  assert.equal(gradingPayload.cardNumber, "10");
  assert.equal(gradingPayload.dateSent, "2026-04-24");
  assert.equal(gradingPayload.preValue, 40);
  assert.equal(gradingPayload.certNumber, "CERT-1");
  assert.equal(gradingPayload.postValue, 75);
  assert.equal("card_name" in gradingPayload, false);
  assert.equal("date_sent" in gradingPayload, false);

  const tradesListResponse = await fetch(`${baseUrl}/api/trades`);
  assert.equal(tradesListResponse.status, 200);
  const tradesListPayload = await tradesListResponse.json();
  const createdTradeEntry = tradesListPayload.find((trade) => trade.id === "route-trade");
  assert.equal(createdTradeEntry.gaveValue, 5);
  assert.equal("gave_value" in createdTradeEntry, false);
  const migratedTradeZero = tradesListPayload.find((trade) => trade.id === "migrated-trade-zero");
  assert.equal(migratedTradeZero.gaveValue, 0);
  assert.equal(migratedTradeZero.receivedValue, 0);

  const watchlistListResponse = await fetch(`${baseUrl}/api/watchlist`);
  assert.equal(watchlistListResponse.status, 200);
  const watchlistListPayload = await watchlistListResponse.json();
  const createdWatchEntry = watchlistListPayload.find((watch) => watch.id === "route-watch");
  assert.equal(createdWatchEntry.targetPrice, 15);
  assert.deepEqual(createdWatchEntry.priceHistory, [{ price: 12.5, date: "2026-04-24" }]);
  assert.equal("target_price" in createdWatchEntry, false);
  const migratedWatchZero = watchlistListPayload.find((watch) => watch.id === "migrated-watch-zero");
  assert.equal(migratedWatchZero.targetPrice, 0);
  assert.equal(migratedWatchZero.currentPrice, 0);

  const gradingsListResponse = await fetch(`${baseUrl}/api/gradings`);
  assert.equal(gradingsListResponse.status, 200);
  const gradingsListPayload = await gradingsListResponse.json();
  const createdGradingEntry = gradingsListPayload.find((grading) => grading.id === "route-grading");
  assert.equal(createdGradingEntry.cardName, "Grade Card");
  assert.equal(createdGradingEntry.dateSent, "2026-04-24");
  assert.equal("card_name" in createdGradingEntry, false);
  const migratedGradingZero = gradingsListPayload.find((grading) => grading.id === "migrated-grading-zero");
  assert.equal(migratedGradingZero.cost, 0);
  assert.equal(migratedGradingZero.preValue, 0);
  assert.equal(migratedGradingZero.postValue, 0);

  const leagueResponse = await fetch(`${baseUrl}/api/ref/leagues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Hockey",
      sportType: "ice_hockey",
    }),
  });
  assert.equal(leagueResponse.status, 201);
  const leaguePayload = await leagueResponse.json();
  assert.equal(leaguePayload.name, "Hockey");
  assert.equal(leaguePayload.sportType, "ice_hockey");
  assert.equal("sport_type" in leaguePayload, false);

  const manufacturerResponse = await fetch(`${baseUrl}/api/ref/manufacturers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Route Deck",
      licensingStatus: "licensed",
    }),
  });
  assert.equal(manufacturerResponse.status, 201);
  const manufacturerPayload = await manufacturerResponse.json();
  assert.equal(manufacturerPayload.licensingStatus, "licensed");
  assert.equal("licensing_status" in manufacturerPayload, false);

  const teamResponse = await fetch(`${baseUrl}/api/ref/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Oilers",
      leagueId: leaguePayload.id,
      city: "Edmonton",
      abbreviation: "EDM",
    }),
  });
  assert.equal(teamResponse.status, 201);
  const teamPayload = await teamResponse.json();
  assert.equal(teamPayload.leagueId, leaguePayload.id);
  assert.equal(teamPayload.leagueName, "Hockey");
  assert.equal("league_id" in teamPayload, false);
  assert.equal("league_name" in teamPayload, false);

  const setResponse = await fetch(`${baseUrl}/api/ref/sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manufacturerId: manufacturerPayload.id,
      year: 2026,
      setName: "Flagship",
      sportType: "ice_hockey",
      releaseDate: "2026-04-24",
    }),
  });
  assert.equal(setResponse.status, 201);
  const setPayload = await setResponse.json();
  assert.equal(setPayload.manufacturerId, manufacturerPayload.id);
  assert.equal(setPayload.manufacturerName, "Route Deck");
  assert.equal(setPayload.setName, "Flagship");
  assert.equal(setPayload.sportType, "ice_hockey");
  assert.equal(setPayload.releaseDate, "2026-04-24");
  assert.equal("manufacturer_id" in setPayload, false);
  assert.equal("set_name" in setPayload, false);

  const playerResponse = await fetch(`${baseUrl}/api/ref/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Connor",
      lastName: "McDavid",
      teamId: teamPayload.id,
      isRookie: 0,
      position: "C",
    }),
  });
  assert.equal(playerResponse.status, 201);
  const playerPayload = await playerResponse.json();
  assert.equal(playerPayload.firstName, "Connor");
  assert.equal(playerPayload.lastName, "McDavid");
  assert.equal(playerPayload.teamName, "Oilers");
  assert.equal("first_name" in playerPayload, false);

  const cardResponse = await fetch(`${baseUrl}/api/ref/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setId: setPayload.id,
      playerId: playerPayload.id,
      cardNumber: "97",
      isBase: 1,
      hasAutograph: 0,
      attributes: { subset: "Base" },
    }),
  });
  assert.equal(cardResponse.status, 201);
  const cardPayload = await cardResponse.json();
  assert.equal(cardPayload.setId, setPayload.id);
  assert.equal(cardPayload.playerId, playerPayload.id);
  assert.equal(cardPayload.cardNumber, "97");
  assert.deepEqual(cardPayload.attributes, { subset: "Base" });
  assert.equal(cardPayload.firstName, "Connor");
  assert.equal("card_number" in cardPayload, false);

  const parallelResponse = await fetch(`${baseUrl}/api/ref/parallels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cardId: cardPayload.id,
      variationName: "Gold",
      color: "Gold",
      printRun: 10,
      is1of1: 0,
      tier: "numbered",
    }),
  });
  assert.equal(parallelResponse.status, 201);
  const parallelPayload = await parallelResponse.json();
  assert.equal(parallelPayload.cardId, cardPayload.id);
  assert.equal(parallelPayload.variationName, "Gold");
  assert.equal(parallelPayload.printRun, 10);
  assert.equal(parallelPayload.is1of1, 0);
  assert.equal("variation_name" in parallelPayload, false);

  const leaguesListResponse = await fetch(`${baseUrl}/api/ref/leagues`);
  assert.equal(leaguesListResponse.status, 200);
  const leaguesListPayload = await leaguesListResponse.json();
  assert.equal(leaguesListPayload[0].sportType, "ice_hockey");

  const teamsListResponse = await fetch(`${baseUrl}/api/ref/teams?league_id=${leaguePayload.id}`);
  assert.equal(teamsListResponse.status, 200);
  const teamsListPayload = await teamsListResponse.json();
  assert.equal(teamsListPayload[0].leagueName, "Hockey");

  const setsListResponse = await fetch(`${baseUrl}/api/ref/sets?mfg=${manufacturerPayload.id}`);
  assert.equal(setsListResponse.status, 200);
  const setsListPayload = await setsListResponse.json();
  assert.equal(setsListPayload[0].manufacturerName, "Route Deck");

  const playersListResponse = await fetch(`${baseUrl}/api/ref/players?team=${teamPayload.id}&search=Connor`);
  assert.equal(playersListResponse.status, 200);
  const playersListPayload = await playersListResponse.json();
  assert.equal(playersListPayload[0].teamName, "Oilers");

  const cardsListResponse = await fetch(`${baseUrl}/api/ref/cards?set_id=${setPayload.id}`);
  assert.equal(cardsListResponse.status, 200);
  const cardsListPayload = await cardsListResponse.json();
  assert.equal(cardsListPayload[0].cardNumber, "97");
  assert.deepEqual(cardsListPayload[0].attributes, { subset: "Base" });

  const parallelsListResponse = await fetch(`${baseUrl}/api/ref/parallels?card_id=${cardPayload.id}`);
  assert.equal(parallelsListResponse.status, 200);
  const parallelsListPayload = await parallelsListResponse.json();
  assert.equal(parallelsListPayload[0].variationName, "Gold");
  assert.equal(parallelsListPayload[0].printRun, 10);
});
