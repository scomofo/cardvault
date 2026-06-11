import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("marketplace ecosystem routes publish crosspost sync and export listings", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-marketplaces-",
    portBase: 3500,
    portSpan: 300,
  });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "phase4-item",
      name: "Wayne Gretzky",
      set: "O-Pee-Chee",
      number: "120",
      listedOn: [],
      priceHistory: [],
      marketPrice: 55,
      suggestedListingPrice: 59.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "phase4-listing",
      cardId: "phase4-item",
      cardName: "Wayne Gretzky",
      cardSet: "O-Pee-Chee",
      cardNumber: "120",
      platform: "ebay",
      listingTitle: "1980 O-Pee-Chee Wayne Gretzky #120",
      listingDescription: "Classic hockey rookie era card.",
      itemSpecifics: { Player: "Wayne Gretzky", Set: "O-Pee-Chee", Condition: "Near Mint" },
      startPrice: 59.99,
      shipping: 4.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "phase4-listing", marketplace: "ebay" }),
  });
  assert.equal(publishResponse.status, 200);
  const publishPayload = await publishResponse.json();
  assert.equal(publishPayload.marketplace, "ebay");
  assert.equal(publishPayload.status, "active");

  const crosspostResponse = await fetch(`${baseUrl}/api/marketplaces/crosspost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "phase4-listing", marketplaces: ["comc", "shopify"] }),
  });
  assert.equal(crosspostResponse.status, 200);
  const crosspostPayload = await crosspostResponse.json();
  assert.equal(crosspostPayload.length, 2);

  const syncResponse = await fetch(`${baseUrl}/api/marketplaces/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "ebay", listingId: "phase4-listing" }),
  });
  assert.equal(syncResponse.status, 200);

  const channelsResponse = await fetch(`${baseUrl}/api/marketplaces/listings/phase4-listing/channels`);
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  assert.equal(channelsPayload.channels.length, 3);

  const exportResponse = await fetch(`${baseUrl}/api/marketplaces/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "shopify", listingIds: ["phase4-listing"] }),
  });
  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.marketplace, "shopify");
  assert.match(exportPayload.content, /Handle,Title,Body,Price/);
});

test("marketplace export includes crossposted listings when no ids are supplied", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-marketplaces-export-",
    portBase: 3800,
    portSpan: 300,
  });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crosspost-export-item",
      name: "Mario Lemieux",
      set: "Topps",
      listedOn: [],
      priceHistory: [],
      marketPrice: 40,
      suggestedListingPrice: 44.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crosspost-export-listing",
      cardId: "crosspost-export-item",
      cardName: "Mario Lemieux",
      cardSet: "Topps",
      platform: "ebay",
      listingTitle: "Mario Lemieux card",
      listingDescription: "Crossposted hockey card",
      startPrice: 44.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const crosspostResponse = await fetch(`${baseUrl}/api/marketplaces/crosspost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "crosspost-export-listing", marketplaces: ["shopify"] }),
  });
  assert.equal(crosspostResponse.status, 200);

  const exportResponse = await fetch(`${baseUrl}/api/marketplaces/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "shopify" }),
  });
  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.marketplace, "shopify");
  assert.match(exportPayload.content, /Mario Lemieux card/);
});

test("consignment marketplace supports publish and export handoff", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-consignment-",
    portBase: 4000,
    portSpan: 300,
  });

  const marketplacesResponse = await fetch(`${baseUrl}/api/marketplaces`);
  assert.equal(marketplacesResponse.status, 200);
  const marketplacesPayload = await marketplacesResponse.json();
  assert.ok(marketplacesPayload.marketplaces.includes("consignment"));

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "consignment-item",
      name: "Connor Bedard",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 750,
      suggestedListingPrice: 799.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "consignment-listing",
      cardId: "consignment-item",
      cardName: "Connor Bedard",
      cardSet: "Upper Deck",
      platform: "consignment",
      listingTitle: "Connor Bedard high-end card",
      listingDescription: "High value card routed to consignment",
      startPrice: 799.99,
      shipping: 0,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "consignment-listing", marketplace: "consignment" }),
  });
  assert.equal(publishResponse.status, 200);
  const publishPayload = await publishResponse.json();
  assert.equal(publishPayload.marketplace, "consignment");
  assert.equal(publishPayload.status, "active");
  assert.match(publishPayload.external_listing_id, /^consignment-/);

  const exportResponse = await fetch(`${baseUrl}/api/marketplaces/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "consignment" }),
  });
  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.marketplace, "consignment");
  assert.match(exportPayload.content, /Card,DeclaredValue,ReservePrice,Notes,Quantity,Marketplace/);
  assert.match(exportPayload.content, /Connor Bedard high-end card/);
});

test("crossposting does not overwrite the primary marketplace external id", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-marketplaces-revise-",
    portBase: 4100,
    portSpan: 300,
  });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "channel-id-item",
      name: "Sidney Crosby",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 70,
      suggestedListingPrice: 79.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "channel-id-listing",
      cardId: "channel-id-item",
      cardName: "Sidney Crosby",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Sidney Crosby rookie card",
      listingDescription: "Important external id regression test",
      startPrice: 79.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "channel-id-listing", marketplace: "ebay" }),
  });
  assert.equal(publishResponse.status, 200);

  const crosspostResponse = await fetch(`${baseUrl}/api/marketplaces/crosspost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "channel-id-listing", marketplaces: ["shopify"] }),
  });
  assert.equal(crosspostResponse.status, 200);

  const channelsResponse = await fetch(`${baseUrl}/api/marketplaces/listings/channel-id-listing/channels`);
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  const ebayChannel = channelsPayload.channels.find((channel) => channel.marketplace === "ebay");
  const shopifyChannel = channelsPayload.channels.find((channel) => channel.marketplace === "shopify");

  assert.ok(ebayChannel);
  assert.ok(shopifyChannel);
  assert.match(String(ebayChannel.external_listing_id), /^ebay-/);
  assert.match(String(shopifyChannel.external_listing_id), /^shopify-/);
  assert.equal(channelsPayload.listing.external_listing_id, ebayChannel.external_listing_id);
  assert.notEqual(channelsPayload.listing.external_listing_id, shopifyChannel.external_listing_id);
});

test("ending one marketplace channel does not mark a still-crossposted listing as ended", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-marketplaces-end-",
    portBase: 4400,
    portSpan: 300,
  });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "channel-end-item",
      name: "Jarome Iginla",
      set: "Topps",
      listedOn: [],
      priceHistory: [],
      marketPrice: 25,
      suggestedListingPrice: 29.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "channel-end-listing",
      cardId: "channel-end-item",
      cardName: "Jarome Iginla",
      cardSet: "Topps",
      platform: "ebay",
      listingTitle: "Jarome Iginla card",
      listingDescription: "Crossposted listing should remain active",
      startPrice: 29.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "channel-end-listing", marketplace: "ebay" }),
  });
  assert.equal(publishResponse.status, 200);

  const crosspostResponse = await fetch(`${baseUrl}/api/marketplaces/crosspost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "channel-end-listing", marketplaces: ["shopify"] }),
  });
  assert.equal(crosspostResponse.status, 200);

  const endResponse = await fetch(`${baseUrl}/api/marketplaces/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "channel-end-listing", marketplace: "ebay" }),
  });
  assert.equal(endResponse.status, 200);

  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsResponse.status, 200);
  const listingsPayload = await listingsResponse.json();
  const listing = listingsPayload.find((entry) => entry.id === "channel-end-listing");

  assert.ok(listing);
  assert.equal(listing.status, "active");
  assert.equal(listing.publishStatus, "active");

  const channelsResponse = await fetch(`${baseUrl}/api/marketplaces/listings/channel-end-listing/channels`);
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  const ebayChannel = channelsPayload.channels.find((channel) => channel.marketplace === "ebay");
  const shopifyChannel = channelsPayload.channels.find((channel) => channel.marketplace === "shopify");

  assert.equal(ebayChannel.status, "ended");
  assert.equal(shopifyChannel.status, "active");
});

test("marketplace sold sync updates the underlying item sale state and creates an order", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-marketplaces-sold-",
    portBase: 4700,
    portSpan: 300,
  });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sync-sold-item",
      name: "Connor McDavid",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 150,
      suggestedListingPrice: 159.99,
      costBasis: 40,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sync-sold-listing",
      cardId: "sync-sold-item",
      cardName: "Connor McDavid",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Connor McDavid card",
      listingDescription: "Should sync into sold inventory state",
      startPrice: 159.99,
      status: "active",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "sync-sold-listing", marketplace: "ebay" }),
  });
  assert.equal(publishResponse.status, 200);

  const updateListingResponse = await fetch(`${baseUrl}/api/listings/sync-sold-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sync-sold-listing",
      cardId: "sync-sold-item",
      cardName: "Connor McDavid",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Connor McDavid card",
      listingDescription: "Should sync into sold inventory state",
      startPrice: 159.99,
      soldPrice: 159.99,
      status: "active",
    }),
  });
  assert.equal(updateListingResponse.status, 200);

  const syncResponse = await fetch(`${baseUrl}/api/marketplaces/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "ebay", listingId: "sync-sold-listing" }),
  });
  assert.equal(syncResponse.status, 200);
  const syncPayload = await syncResponse.json();
  assert.equal(syncPayload.length, 1);
  assert.ok(syncPayload[0].sale);
  assert.ok(syncPayload[0].order);

  const itemsResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsResponse.status, 200);
  const itemsPayload = await itemsResponse.json();
  const item = itemsPayload.find((entry) => entry.id === "sync-sold-item");

  assert.ok(item);
  assert.equal(item.status, "sold");
  assert.equal(item.saleStatus, "sold");
  assert.equal(item.listingStatus, "ended");
  assert.equal(item.profitRealized, 119.99);

  const salesResponse = await fetch(`${baseUrl}/api/sales`);
  assert.equal(salesResponse.status, 200);
  const salesPayload = await salesResponse.json();
  const sale = salesPayload.find((entry) => entry.listingId === "sync-sold-listing");

  assert.ok(sale);
  assert.equal(sale.costBasis, 40);
  assert.equal(sale.netProfit, 119.99);

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  const order = ordersPayload.find((entry) => entry.listingId === "sync-sold-listing");

  assert.ok(order);
  assert.equal(order.saleId, sale.id);
  assert.equal(order.fulfillmentStatus, "pending");
  assert.equal(order.paymentStatus, "paid");
});
