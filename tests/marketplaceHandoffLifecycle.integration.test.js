import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createHandoffListing(baseUrl, { idPrefix, marketplace, cardName, marketPrice }) {
  const itemId = `${idPrefix}-item`;
  const listingId = `${idPrefix}-listing`;

  assert.equal((await postJson(baseUrl, "/api/items", {
    id: itemId,
    name: cardName,
    set: "Upper Deck",
    listedOn: [],
    priceHistory: [],
    marketPrice,
    suggestedListingPrice: marketPrice,
  })).status, 201);

  assert.equal((await postJson(baseUrl, "/api/listings", {
    id: listingId,
    cardId: itemId,
    cardName,
    cardSet: "Upper Deck",
    platform: marketplace,
    listingTitle: `${cardName} handoff card`,
    listingDescription: "External handoff lifecycle test listing",
    startPrice: marketPrice,
    status: "draft",
  })).status, 201);

  const publishResponse = await postJson(baseUrl, "/api/marketplaces/publish", {
    listingId,
    marketplace,
  });
  assert.equal(publishResponse.status, 200);
  const publishPayload = await publishResponse.json();
  assert.equal(publishPayload.status, "handoff_ready");

  return { itemId, listingId };
}

async function getMarketplaceChannel(baseUrl, listingId, marketplace) {
  const channelsResponse = await fetch(`${baseUrl}/api/marketplaces/listings/${listingId}/channels`);
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  const channel = channelsPayload.channels.find((entry) => entry.marketplace === marketplace);
  assert.ok(channel);
  return channel;
}

test("external handoff export advances COMC channel lifecycle and records audit event", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-comc-handoff-export-" });
  const { listingId } = await createHandoffListing(baseUrl, {
    idPrefix: "comc-export",
    marketplace: "comc",
    cardName: "Mario Lemieux",
    marketPrice: 42,
  });

  const exportResponse = await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "comc",
    listingIds: [listingId],
  });
  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.marketplace, "comc");
  assert.equal(exportPayload.itemCount, 1);
  assert.deepEqual(exportPayload.handoff.listingIds, [listingId]);
  assert.equal(exportPayload.handoff.status, "handoff_exported");

  const channel = await getMarketplaceChannel(baseUrl, listingId, "comc");
  assert.equal(channel.status, "handoff_exported");
  const overrides = JSON.parse(channel.overrides);
  assert.equal(overrides.handoff.submissionStatus, "exported");
  assert.equal(overrides.handoff.exportId, exportPayload.exportId);

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT event_type, status, payload
       FROM listing_channel_events
       WHERE event_type = 'handoff_export'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "handoff_exported");
    assert.match(event.payload, new RegExp(exportPayload.exportId));
    assert.doesNotMatch(event.payload, /accessToken|refreshToken|api_key|apiKey/);
  } finally {
    db.close();
  }
});

test("external handoff status updates persist partner outcomes and queue exceptions", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-consignment-handoff-status-" });
  const { listingId } = await createHandoffListing(baseUrl, {
    idPrefix: "consignment-status",
    marketplace: "consignment",
    cardName: "Connor Bedard",
    marketPrice: 775,
  });

  assert.equal((await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "consignment",
    listingIds: [listingId],
  })).status, 200);

  const submittedResponse = await postJson(baseUrl, "/api/marketplaces/handoff/status", {
    listingId,
    marketplace: "consignment",
    status: "submitted",
    submissionReference: "broker-submission-42",
  });
  assert.equal(submittedResponse.status, 200);
  const submittedChannel = await submittedResponse.json();
  assert.equal(submittedChannel.status, "handoff_submitted");

  const exceptionResponse = await postJson(baseUrl, "/api/marketplaces/handoff/status", {
    listingId,
    marketplace: "consignment",
    status: "exception",
    note: "Broker rejected the declared value",
    submissionReference: "broker-submission-42",
  });
  assert.equal(exceptionResponse.status, 200);
  const exceptionChannel = await exceptionResponse.json();
  assert.equal(exceptionChannel.status, "handoff_exception");
  const overrides = JSON.parse(exceptionChannel.overrides);
  assert.equal(overrides.handoff.submissionStatus, "exception");
  assert.equal(overrides.handoff.submissionReference, "broker-submission-42");
  assert.equal(overrides.handoff.note, "Broker rejected the declared value");

  const queueResponse = await fetch(`${baseUrl}/api/action-queue`);
  assert.equal(queueResponse.status, 200);
  const retryAction = (await queueResponse.json()).find((entry) => entry.subjectId === listingId);
  assert.equal(retryAction.queue, "marketplace_handoff_exception");
  assert.equal(retryAction.suggestedAction, "retry_handoff");

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT event_type, status, payload
       FROM listing_channel_events
       WHERE event_type = 'handoff_status'
         AND status = 'handoff_exception'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "handoff_exception");
    assert.match(event.payload, /Broker rejected the declared value/);
    assert.doesNotMatch(event.payload, /accessToken|refreshToken|api_key|apiKey/);
  } finally {
    db.close();
  }
});
