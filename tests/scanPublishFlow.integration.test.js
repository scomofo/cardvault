import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("item and listing creates are idempotent upserts by id", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-scanpublish-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "scan-item",
        name: "Connor Bedard",
        set: "Upper Deck",
        listedOn: [],
        priceHistory: [],
        costBasis: 20,
      })
    ).status,
    201,
  );

  // Re-POST with the same id updates instead of failing on the primary key.
  const upsertResponse = await postJson(baseUrl, "/api/items", {
    id: "scan-item",
    name: "Connor Bedard YG",
    costBasis: 25,
  });
  assert.equal(upsertResponse.status, 200);
  const upserted = await upsertResponse.json();
  assert.equal(upserted.name, "Connor Bedard YG");
  assert.equal(upserted.costBasis, 25);

  const itemsResponse = await fetch(`${baseUrl}/api/items`);
  const items = await itemsResponse.json();
  assert.equal(items.filter((item) => item.id === "scan-item").length, 1);

  assert.equal(
    (
      await postJson(baseUrl, "/api/listings", {
        id: "scan-listing",
        cardId: "scan-item",
        cardName: "Connor Bedard YG",
        platform: "ebay",
        listingTitle: "2023-24 Upper Deck Connor Bedard Young Guns",
        listingDescription: "Fresh pull, pack to sleeve.",
        startPrice: 99.99,
        status: "active",
      })
    ).status,
    201,
  );

  const listingUpsertResponse = await postJson(baseUrl, "/api/listings", {
    id: "scan-listing",
    cardId: "scan-item",
    cardName: "Connor Bedard YG",
    platform: "ebay",
    startPrice: 89.99,
    status: "active",
  });
  assert.equal(listingUpsertResponse.status, 200);
  const listingUpserted = await listingUpsertResponse.json();
  assert.equal(listingUpserted.startPrice, 89.99);

  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  const listings = await listingsResponse.json();
  assert.equal(listings.filter((listing) => listing.id === "scan-listing").length, 1);
});

test("scan flow publishes: item, listing, publish, and re-POST keeps channel state", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-scanpublish-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "scan-pub-item",
        name: "Wayne Gretzky",
        set: "O-Pee-Chee",
        listedOn: [],
        priceHistory: [],
      })
    ).status,
    201,
  );

  assert.equal(
    (
      await postJson(baseUrl, "/api/listings", {
        id: "scan-pub-listing",
        cardId: "scan-pub-item",
        cardName: "Wayne Gretzky",
        platform: "ebay",
        listingTitle: "1980 O-Pee-Chee Wayne Gretzky #120",
        listingDescription: "Classic hockey card.",
        startPrice: 59.99,
        status: "active",
      })
    ).status,
    201,
  );

  const publishResponse = await postJson(baseUrl, "/api/marketplaces/publish", {
    listingId: "scan-pub-listing",
    marketplace: "ebay",
  });
  assert.equal(publishResponse.status, 200);
  const channel = await publishResponse.json();
  assert.equal(channel.marketplace, "ebay");
  assert.equal(channel.status, "active");
  assert.match(channel.external_listing_id, /^ebay-/);

  // The sync engine will re-POST the base record after publish; the upsert
  // path must not clobber the server-managed publish state.
  const redundantCreate = await postJson(baseUrl, "/api/listings", {
    id: "scan-pub-listing",
    cardId: "scan-pub-item",
    cardName: "Wayne Gretzky",
    platform: "ebay",
    startPrice: 59.99,
    status: "active",
  });
  assert.equal(redundantCreate.status, 200);

  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  const listings = await listingsResponse.json();
  const listing = listings.find((row) => row.id === "scan-pub-listing");
  assert.ok(listing);
  assert.equal(listing.publishStatus, "active");
  assert.match(listing.externalListingId, /^ebay-/);

  const channelsResponse = await fetch(
    `${baseUrl}/api/marketplaces/listings/scan-pub-listing/channels`,
  );
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  assert.equal(channelsPayload.channels.length, 1);
  assert.equal(channelsPayload.channels[0].status, "active");

  // The stub publish (eBay not connected) must surface in the action queue.
  const queueResponse = await fetch(`${baseUrl}/api/action-queue`);
  assert.equal(queueResponse.status, 200);
  const queueEntries = await queueResponse.json();
  const stubEntry = queueEntries.find(
    (entry) => entry.queue === "stub_publish" && entry.subjectId === "scan-pub-listing",
  );
  assert.ok(stubEntry, "stub_publish queue entry missing");
  assert.equal(stubEntry.suggestedAction, "republish_listing");
  assert.equal(stubEntry.subjectType, "listing");
  assert.equal(stubEntry.marketplace, "ebay");
});

test("create-retry upserts cannot revert sold listings or sold items", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-scanpublish-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "sold-item",
        name: "Auston Matthews",
        listedOn: [],
        priceHistory: [],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await postJson(baseUrl, "/api/listings", {
        id: "sold-listing",
        cardId: "sold-item",
        cardName: "Auston Matthews",
        platform: "ebay",
        startPrice: 40,
        status: "active",
      })
    ).status,
    201,
  );

  // Server-side sale (what a marketplace sync would record).
  const sellResponse = await fetch(`${baseUrl}/api/listings/sold-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cardId: "sold-item",
      platform: "ebay",
      status: "sold",
      soldPrice: 42.5,
      soldDate: "2026-07-01T00:00:00.000Z",
    }),
  });
  assert.equal(sellResponse.status, 200);

  // A stale client create-retry with the original base records.
  assert.equal(
    (
      await postJson(baseUrl, "/api/listings", {
        id: "sold-listing",
        cardId: "sold-item",
        cardName: "Auston Matthews",
        platform: "ebay",
        startPrice: 40,
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "sold-item",
        name: "Auston Matthews",
        status: "inventory",
        listedOn: [],
        priceHistory: [],
      })
    ).status,
    200,
  );

  const listings = await (await fetch(`${baseUrl}/api/listings`)).json();
  const listing = listings.find((row) => row.id === "sold-listing");
  assert.equal(listing.status, "sold");
  assert.equal(listing.soldPrice, 42.5);

  const item = await (await fetch(`${baseUrl}/api/items/sold-item`)).json();
  assert.equal(item.status, "sold");
});

test("handoff marketplace publish from the scan flow queues a handoff channel", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-scanpublish-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "scan-handoff-item",
        name: "Sidney Crosby",
        set: "SP Authentic",
        listedOn: [],
        priceHistory: [],
      })
    ).status,
    201,
  );

  assert.equal(
    (
      await postJson(baseUrl, "/api/listings", {
        id: "scan-handoff-listing",
        cardId: "scan-handoff-item",
        cardName: "Sidney Crosby",
        platform: "comc",
        startPrice: 149.99,
        status: "active",
      })
    ).status,
    201,
  );

  const publishResponse = await postJson(baseUrl, "/api/marketplaces/publish", {
    listingId: "scan-handoff-listing",
    marketplace: "comc",
  });
  assert.equal(publishResponse.status, 200);
  const channel = await publishResponse.json();
  assert.equal(channel.status, "handoff_ready");
});
