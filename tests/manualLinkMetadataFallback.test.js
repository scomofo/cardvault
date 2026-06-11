import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("linked manual sales and orders inherit platform and buyer metadata", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-link-metadata-",
    portBase: 4000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-item",
      name: "Metadata Fallback Card",
      set: "Route Set",
      number: "52",
      costBasis: 9,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-listing",
      cardId: "metadata-fallback-item",
      cardName: "Metadata Fallback Card",
      cardSet: "Route Set",
      cardNumber: "52",
      platform: "ebay",
      format: "fixed",
      startPrice: 29.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-order",
      itemId: "metadata-fallback-item",
      listingId: "metadata-fallback-listing",
      platform: "ebay",
      buyerHandle: "buyer_meta",
      salePrice: 29.99,
      soldAt: "2026-04-24T21:30:00.000Z",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-sale",
      orderId: "metadata-fallback-order",
      cardName: "Metadata Fallback Card",
      cardSet: "Route Set",
      salePrice: 29.99,
      netProfit: 20.99,
    }),
  });
  assert.equal(saleResponse.status, 201);
  const salePayload = await saleResponse.json();
  assert.equal(salePayload.platform, "ebay");
  assert.equal(salePayload.buyerHandle, "buyer_meta");

  const secondItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-item-2",
      name: "Metadata Fallback Card 2",
      set: "Route Set",
      number: "52B",
      costBasis: 11,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(secondItemResponse.status, 201);

  const secondListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-listing-2",
      cardId: "metadata-fallback-item-2",
      cardName: "Metadata Fallback Card 2",
      cardSet: "Route Set",
      cardNumber: "52B",
      platform: "ebay",
      format: "fixed",
      startPrice: 32.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(secondListingResponse.status, 201);

  const standaloneSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-sale-2",
      cardId: "metadata-fallback-item-2",
      listingId: "metadata-fallback-listing-2",
      cardName: "Metadata Fallback Card 2",
      cardSet: "Route Set",
      platform: "ebay",
      buyerHandle: "buyer_meta_2",
      salePrice: 32.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(standaloneSaleResponse.status, 201);

  const linkedOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-order-2",
      saleId: "metadata-fallback-sale-2",
    }),
  });
  assert.equal(linkedOrderResponse.status, 201);
  const linkedOrderPayload = await linkedOrderResponse.json();
  assert.equal(linkedOrderPayload.platform, "ebay");
  assert.equal(linkedOrderPayload.buyerHandle, "buyer_meta_2");
  assert.equal(linkedOrderPayload.salePrice, 32.99);
});

test("linked manual sales and orders reject duplicate one-to-one pairings", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-link-duplicate-",
    portBase: 4400,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-item",
      name: "Duplicate Link Card",
      set: "Route Set",
      number: "53",
      costBasis: 10,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-listing",
      cardId: "duplicate-link-item",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      cardNumber: "53",
      platform: "ebay",
      format: "fixed",
      startPrice: 31.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale",
      cardId: "duplicate-link-item",
      listingId: "duplicate-link-listing",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const firstOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order-a",
      saleId: "duplicate-link-sale",
    }),
  });
  assert.equal(firstOrderResponse.status, 201);

  const secondOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order-b",
      saleId: "duplicate-link-sale",
    }),
  });
  assert.equal(secondOrderResponse.status, 409);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order",
      itemId: "duplicate-link-item",
      listingId: "duplicate-link-listing",
      platform: "ebay",
      salePrice: 31.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const firstSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale-a",
      orderId: "duplicate-link-order",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(firstSaleResponse.status, 201);

  const secondSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale-b",
      orderId: "duplicate-link-order",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(secondSaleResponse.status, 409);
});

test("linked manual sales and orders reject dangling link ids", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-link-missing-",
    portBase: 4800,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const missingSaleOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-link-order",
      saleId: "missing-sale-id",
      platform: "ebay",
      salePrice: 12.99,
    }),
  });
  assert.equal(missingSaleOrderResponse.status, 404);

  const missingOrderSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-link-sale",
      orderId: "missing-order-id",
      cardName: "Missing Link Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 12.99,
    }),
  });
  assert.equal(missingOrderSaleResponse.status, 404);
});

test("linked manual sales and orders reject conflicting explicit ids", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-link-conflict-",
    portBase: 5200,
    stdio: ["ignore", "pipe", "pipe"],
  });

  for (const item of [
    { id: "conflict-item-a", name: "Conflict Card A", number: "54A" },
    { id: "conflict-item-b", name: "Conflict Card B", number: "54B" },
  ]) {
    const itemResponse = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        set: "Route Set",
        costBasis: 8,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(itemResponse.status, 201);
  }

  for (const listing of [
    { id: "conflict-listing-a", cardId: "conflict-item-a", cardNumber: "54A" },
    { id: "conflict-listing-b", cardId: "conflict-item-b", cardNumber: "54B" },
  ]) {
    const listingResponse = await fetch(`${baseUrl}/api/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...listing,
        cardName: "Conflict Card",
        cardSet: "Route Set",
        platform: "ebay",
        format: "fixed",
        startPrice: 22.99,
        shipping: 1.25,
        status: "draft",
      }),
    });
    assert.equal(listingResponse.status, 201);
  }

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-order",
      itemId: "conflict-item-a",
      listingId: "conflict-listing-a",
      platform: "ebay",
      salePrice: 22.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-sale",
      cardId: "conflict-item-a",
      listingId: "conflict-listing-a",
      cardName: "Conflict Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 22.99,
      netProfit: 14.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const conflictingOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-order-bad",
      saleId: "conflict-sale",
      itemId: "conflict-item-b",
    }),
  });
  assert.equal(conflictingOrderResponse.status, 409);

  const conflictingSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-sale-bad",
      orderId: "conflict-order",
      cardId: "conflict-item-b",
      cardName: "Conflict Card",
      cardSet: "Route Set",
      salePrice: 22.99,
      netProfit: 14.99,
    }),
  });
  assert.equal(conflictingSaleResponse.status, 409);
});

test("linked manual sales and orders reject conflicting explicit metadata", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-link-meta-conflict-",
    portBase: 5600,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-item",
      name: "Meta Conflict Card",
      set: "Route Set",
      number: "55",
      costBasis: 7,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-listing",
      cardId: "meta-conflict-item",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      cardNumber: "55",
      platform: "ebay",
      format: "fixed",
      startPrice: 18.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-sale",
      cardId: "meta-conflict-item",
      listingId: "meta-conflict-listing",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 18.99,
      netProfit: 11.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const conflictingOrderPlatformResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-order-platform",
      saleId: "meta-conflict-sale",
      platform: "shopify",
    }),
  });
  assert.equal(conflictingOrderPlatformResponse.status, 409);

  const conflictingOrderPriceResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-order-price",
      saleId: "meta-conflict-sale",
      salePrice: 99.99,
    }),
  });
  assert.equal(conflictingOrderPriceResponse.status, 409);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-order",
      itemId: "meta-conflict-item",
      listingId: "meta-conflict-listing",
      platform: "ebay",
      salePrice: 18.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const conflictingSalePlatformResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-sale-platform",
      orderId: "meta-conflict-order",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      platform: "shopify",
      netProfit: 11.99,
    }),
  });
  assert.equal(conflictingSalePlatformResponse.status, 409);

  const conflictingSalePriceResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-sale-price",
      orderId: "meta-conflict-order",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      salePrice: 99.99,
      netProfit: 11.99,
    }),
  });
  assert.equal(conflictingSalePriceResponse.status, 409);

  const conflictingOrderBuyerResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-order-buyer",
      saleId: "meta-conflict-sale",
      buyerHandle: "wrong_buyer",
    }),
  });
  assert.equal(conflictingOrderBuyerResponse.status, 409);

  const conflictingOrderDateResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-order-date",
      saleId: "meta-conflict-sale",
      soldAt: "2026-04-25T00:00:00.000Z",
    }),
  });
  assert.equal(conflictingOrderDateResponse.status, 409);

  const conflictingSaleBuyerResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-sale-buyer",
      orderId: "meta-conflict-order",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      buyerHandle: "wrong_buyer",
      netProfit: 11.99,
    }),
  });
  assert.equal(conflictingSaleBuyerResponse.status, 409);

  const conflictingSaleDateResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "meta-conflict-sale-date",
      orderId: "meta-conflict-order",
      cardName: "Meta Conflict Card",
      cardSet: "Route Set",
      date: "2026-04-25T00:00:00.000Z",
      netProfit: 11.99,
    }),
  });
  assert.equal(conflictingSaleDateResponse.status, 409);
});

test("manual sales and orders reject missing or mismatched direct listing references", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-direct-listing-guard-",
    portBase: 6000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  for (const item of [
    { id: "direct-guard-item-a", name: "Direct Guard A", number: "56A" },
    { id: "direct-guard-item-b", name: "Direct Guard B", number: "56B" },
  ]) {
    const itemResponse = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        set: "Route Set",
        costBasis: 6,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(itemResponse.status, 201);
  }

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-guard-listing",
      cardId: "direct-guard-item-a",
      cardName: "Direct Guard A",
      cardSet: "Route Set",
      cardNumber: "56A",
      platform: "ebay",
      format: "fixed",
      startPrice: 16.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const missingListingOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-guard-order-missing",
      listingId: "missing-listing-id",
      platform: "ebay",
      salePrice: 16.99,
    }),
  });
  assert.equal(missingListingOrderResponse.status, 404);

  const missingListingSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-guard-sale-missing",
      listingId: "missing-listing-id",
      cardName: "Direct Guard",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 16.99,
    }),
  });
  assert.equal(missingListingSaleResponse.status, 404);

  const mismatchedOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-guard-order-mismatch",
      listingId: "direct-guard-listing",
      itemId: "direct-guard-item-b",
      platform: "ebay",
      salePrice: 16.99,
    }),
  });
  assert.equal(mismatchedOrderResponse.status, 409);

  const mismatchedSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-guard-sale-mismatch",
      listingId: "direct-guard-listing",
      cardId: "direct-guard-item-b",
      cardName: "Direct Guard",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 16.99,
      netProfit: 10.99,
    }),
  });
  assert.equal(mismatchedSaleResponse.status, 409);
});

test("linked manual sales and orders reject stale item-listing mismatches", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-stale-link-guard-",
    portBase: 6400,
    stdio: ["ignore", "pipe", "pipe"],
  });

  for (const item of [
    { id: "stale-link-item-a", name: "Stale Link A", number: "57A" },
    { id: "stale-link-item-b", name: "Stale Link B", number: "57B" },
  ]) {
    const itemResponse = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        set: "Route Set",
        costBasis: 5,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(itemResponse.status, 201);
  }

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-listing",
      cardId: "stale-link-item-a",
      cardName: "Stale Link Card",
      cardSet: "Route Set",
      cardNumber: "57A",
      platform: "ebay",
      format: "fixed",
      startPrice: 14.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-order-source",
      itemId: "stale-link-item-a",
      listingId: "stale-link-listing",
      platform: "ebay",
      salePrice: 14.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-sale-source",
      cardId: "stale-link-item-a",
      listingId: "stale-link-listing",
      cardName: "Stale Link Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 14.99,
      netProfit: 9.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const relistResponse = await fetch(`${baseUrl}/api/listings/stale-link-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-listing",
      cardId: "stale-link-item-b",
      cardName: "Stale Link Card",
      cardSet: "Route Set",
      cardNumber: "57B",
      platform: "ebay",
      format: "fixed",
      startPrice: 14.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(relistResponse.status, 200);

  const staleOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-order",
      saleId: "stale-link-sale-source",
    }),
  });
  assert.equal(staleOrderResponse.status, 409);

  const staleSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "stale-link-sale",
      orderId: "stale-link-order-source",
      cardName: "Stale Link Card",
      cardSet: "Route Set",
      netProfit: 9.99,
    }),
  });
  assert.equal(staleSaleResponse.status, 409);
});

test("manual sales and orders reject missing direct or linked items", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-missing-item-guard-",
    portBase: 6800,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const missingOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-item-order",
      itemId: "missing-item-id",
      platform: "ebay",
      salePrice: 15.99,
    }),
  });
  assert.equal(missingOrderResponse.status, 404);

  const missingSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-item-sale",
      cardId: "missing-item-id",
      cardName: "Missing Item Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 15.99,
      netProfit: 10.99,
    }),
  });
  assert.equal(missingSaleResponse.status, 404);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-linked-listing",
      cardId: "missing-linked-item",
      cardName: "Missing Linked Listing",
      cardSet: "Route Set",
      cardNumber: "58",
      platform: "ebay",
      format: "fixed",
      startPrice: 15.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 404);

  const staleFromListingOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-linked-order",
      listingId: "missing-linked-listing",
      platform: "ebay",
      salePrice: 15.99,
    }),
  });
  assert.equal(staleFromListingOrderResponse.status, 404);

  const staleFromListingSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-linked-sale",
      listingId: "missing-linked-listing",
      cardName: "Missing Linked Listing",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 15.99,
      netProfit: 11.99,
    }),
  });
  assert.equal(staleFromListingSaleResponse.status, 404);
});
