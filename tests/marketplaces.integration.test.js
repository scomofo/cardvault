import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

test("marketplace ecosystem routes publish crosspost sync and export listings", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-marketplaces-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3500 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

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
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-marketplaces-export-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3800 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

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

test("crossposting does not overwrite the primary marketplace external id", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-marketplaces-revise-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4100 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

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
