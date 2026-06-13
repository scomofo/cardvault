import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createServer } from "node:http";

import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createHandoffListing(baseUrl, { idPrefix, marketplace, cardName, marketPrice, connectionId }) {
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
    ...(connectionId ? { connectionId } : {}),
  });
  assert.equal(publishResponse.status, 200);
  const publishPayload = await publishResponse.json();
  assert.equal(publishPayload.status, "handoff_ready");

  return { itemId, listingId };
}

async function startPartnerStatusServer(t, responsePayload) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let body = null;
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
      requests.push({
        method: req.method,
        url: req.url,
        partnerKey: req.headers["x-partner-key"],
        body,
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(responsePayload));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
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

test("external handoff export skips submitted channels and retries exceptions", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-comc-handoff-export-filter-" });
  const submittedListing = await createHandoffListing(baseUrl, {
    idPrefix: "comc-submitted-filter",
    marketplace: "comc",
    cardName: "Wayne Gretzky",
    marketPrice: 150,
  });
  const exceptionListing = await createHandoffListing(baseUrl, {
    idPrefix: "comc-exception-filter",
    marketplace: "comc",
    cardName: "Patrick Roy",
    marketPrice: 88,
  });

  assert.equal((await postJson(baseUrl, "/api/marketplaces/handoff/status", {
    listingId: submittedListing.listingId,
    marketplace: "comc",
    status: "submitted",
    submissionReference: "comc-submission-99",
  })).status, 200);

  assert.equal((await postJson(baseUrl, "/api/marketplaces/handoff/status", {
    listingId: exceptionListing.listingId,
    marketplace: "comc",
    status: "exception",
    note: "Corrected grade label needed",
    submissionReference: "comc-submission-100",
  })).status, 200);

  const exportResponse = await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "comc",
    listingIds: [submittedListing.listingId, exceptionListing.listingId],
  });
  assert.equal(exportResponse.status, 200);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.itemCount, 2);
  assert.deepEqual(exportPayload.handoff.listingIds, [exceptionListing.listingId]);

  const submittedChannel = await getMarketplaceChannel(baseUrl, submittedListing.listingId, "comc");
  assert.equal(submittedChannel.status, "handoff_submitted");
  const submittedOverrides = JSON.parse(submittedChannel.overrides);
  assert.equal(submittedOverrides.handoff.submissionStatus, "submitted");
  assert.equal(submittedOverrides.handoff.submissionReference, "comc-submission-99");
  assert.equal(submittedOverrides.handoff.exportId, undefined);
  assert.equal(submittedOverrides.handoff.exportedAt, undefined);

  const exceptionChannel = await getMarketplaceChannel(baseUrl, exceptionListing.listingId, "comc");
  assert.equal(exceptionChannel.status, "handoff_exported");
  const exceptionOverrides = JSON.parse(exceptionChannel.overrides);
  assert.equal(exceptionOverrides.handoff.submissionStatus, "exported");
  assert.equal(exceptionOverrides.handoff.submissionReference, "comc-submission-100");
  assert.equal(exceptionOverrides.handoff.note, "Corrected grade label needed");
  assert.equal(exceptionOverrides.handoff.exportId, exportPayload.exportId);

  const db = new Database(dbPath, { readonly: true });
  try {
    const submittedExportEvents = db.prepare(
      `SELECT COUNT(*) AS count
       FROM listing_channel_events
       WHERE listing_channel_id = ?
         AND event_type = 'handoff_export'`,
    ).get(submittedChannel.id);
    assert.equal(submittedExportEvents.count, 0);
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
  assert.equal(retryAction.marketplace, "consignment");
  assert.equal(retryAction.listingId, listingId);
  assert.equal(retryAction.submissionReference, "broker-submission-42");
  assert.equal(retryAction.handoffNote, "Broker rejected the declared value");

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

test("configured partner status sync advances COMC handoff lifecycle", async (t) => {
  const partner = await startPartnerStatusServer(t, {
    status: "accepted",
    submissionReference: "comc-accepted-42",
    note: "Accepted by COMC intake",
    updatedAt: "2026-06-12T12:00:00.000Z",
  });
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-comc-partner-status-sync-" });

  const connectionResponse = await postJson(baseUrl, "/api/marketplace-connections", {
    marketplace: "comc",
    accountLabel: "COMC partner API",
    accessToken: "partner-secret",
    metadata: {
      handoffStatusUrl: `${partner.baseUrl}/status/{listingId}?submission={submissionReference}`,
      apiKeyHeader: "X-Partner-Key",
      apiKeyPrefix: "",
      handoffStatusTimeoutMs: 1000,
    },
  });
  assert.equal(connectionResponse.status, 201);
  const connection = await connectionResponse.json();
  assert.equal("accessToken" in connection, false);

  const { listingId } = await createHandoffListing(baseUrl, {
    idPrefix: "comc-partner-sync",
    marketplace: "comc",
    cardName: "Mark Messier",
    marketPrice: 64,
    connectionId: connection.id,
  });

  assert.equal((await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "comc",
    listingIds: [listingId],
  })).status, 200);

  const syncResponse = await postJson(baseUrl, "/api/marketplaces/sync", {
    marketplace: "comc",
    listingId,
  });
  assert.equal(syncResponse.status, 200);
  const syncPayload = await syncResponse.json();
  assert.equal(syncPayload.length, 1);
  assert.equal(syncPayload[0].synced.status, "handoff_accepted");
  assert.equal(partner.requests.length, 1);
  assert.equal(partner.requests[0].method, "GET");
  assert.equal(partner.requests[0].partnerKey, "partner-secret");
  assert.match(partner.requests[0].url, new RegExp(`/status/${listingId}`));

  const channel = await getMarketplaceChannel(baseUrl, listingId, "comc");
  assert.equal(channel.status, "handoff_accepted");
  const overrides = JSON.parse(channel.overrides);
  assert.equal(overrides.handoff.submissionStatus, "accepted");
  assert.equal(overrides.handoff.submissionReference, "comc-accepted-42");
  assert.equal(overrides.handoff.note, "Accepted by COMC intake");
});

test("configured partner submission posts COMC handoff and records submission reference", async (t) => {
  const partner = await startPartnerStatusServer(t, {
    status: "submitted",
    submissionReference: "comc-submission-77",
    note: "Received by COMC intake",
    updatedAt: "2026-06-12T13:00:00.000Z",
  });
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-comc-partner-submit-" });

  const connectionResponse = await postJson(baseUrl, "/api/marketplace-connections", {
    marketplace: "comc",
    accountLabel: "COMC partner API",
    accessToken: "partner-secret",
    metadata: {
      handoffSubmissionUrl: `${partner.baseUrl}/submit/{listingId}`,
      apiKeyHeader: "X-Partner-Key",
      apiKeyPrefix: "",
      handoffSubmissionTimeoutMs: 1000,
    },
  });
  assert.equal(connectionResponse.status, 201);
  const connection = await connectionResponse.json();

  const { listingId } = await createHandoffListing(baseUrl, {
    idPrefix: "comc-partner-submit",
    marketplace: "comc",
    cardName: "Bobby Orr",
    marketPrice: 120,
    connectionId: connection.id,
  });

  assert.equal((await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "comc",
    listingIds: [listingId],
  })).status, 200);

  const submitResponse = await postJson(baseUrl, "/api/marketplaces/handoff/submit", {
    marketplace: "comc",
    listingIds: [listingId],
  });
  assert.equal(submitResponse.status, 200);
  const submitPayload = await submitResponse.json();
  assert.equal(submitPayload.marketplace, "comc");
  assert.deepEqual(submitPayload.handoff.listingIds, [listingId]);
  assert.equal(submitPayload.results[0].status, "handoff_submitted");

  assert.equal(partner.requests.length, 1);
  assert.equal(partner.requests[0].method, "POST");
  assert.equal(partner.requests[0].partnerKey, "partner-secret");
  assert.match(partner.requests[0].url, new RegExp(`/submit/${listingId}`));
  assert.equal(partner.requests[0].body.listingId, listingId);
  assert.equal(partner.requests[0].body.marketplace, "comc");
  assert.equal(partner.requests[0].body.handoff.submissionStatus, "exported");
  assert.match(partner.requests[0].body.card.title, /Bobby Orr/);

  const channel = await getMarketplaceChannel(baseUrl, listingId, "comc");
  assert.equal(channel.status, "handoff_submitted");
  const overrides = JSON.parse(channel.overrides);
  assert.equal(overrides.handoff.submissionStatus, "submitted");
  assert.equal(overrides.handoff.submissionReference, "comc-submission-77");
  assert.equal(overrides.handoff.note, "Received by COMC intake");

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT event_type, status, payload
       FROM listing_channel_events
       WHERE event_type = 'handoff_submission'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "handoff_submitted");
    assert.match(event.payload, /comc-submission-77/);
    assert.doesNotMatch(event.payload, /partner-secret|accessToken|refreshToken|api_key|apiKey/);
  } finally {
    db.close();
  }
});

test("direct handoff submission reports missing partner configuration before mutating channel", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-comc-submit-config-" });
  const connectionResponse = await postJson(baseUrl, "/api/marketplace-connections", {
    marketplace: "comc",
    accountLabel: "COMC partner API",
    accessToken: "partner-secret",
    metadata: {},
  });
  assert.equal(connectionResponse.status, 201);
  const connection = await connectionResponse.json();

  const { listingId } = await createHandoffListing(baseUrl, {
    idPrefix: "comc-submit-config",
    marketplace: "comc",
    cardName: "Sidney Crosby",
    marketPrice: 95,
    connectionId: connection.id,
  });

  assert.equal((await postJson(baseUrl, "/api/marketplaces/export", {
    marketplace: "comc",
    listingIds: [listingId],
  })).status, 200);

  const submitResponse = await postJson(baseUrl, "/api/marketplaces/handoff/submit", {
    marketplace: "comc",
    listingIds: [listingId],
  });
  assert.equal(submitResponse.status, 400);
  const payload = await submitResponse.json();
  assert.equal(payload.error, "COMC handoff submission is not configured. Add a Handoff Submission URL in Settings > Marketplace Connections before submitting live handoffs.");

  const channel = await getMarketplaceChannel(baseUrl, listingId, "comc");
  assert.equal(channel.status, "handoff_exported");
  const overrides = JSON.parse(channel.overrides);
  assert.equal(overrides.handoff.submissionStatus, "exported");
  assert.equal(overrides.handoff.note, undefined);
});

test("marketplace connection test validates partner handoff endpoints without exposing secrets", async (t) => {
  const partner = await startPartnerStatusServer(t, {
    status: "submitted",
    submissionReference: "comc-validation-ref",
    note: "Validation dry run accepted",
    updatedAt: "2026-06-12T14:00:00.000Z",
  });
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-comc-connection-test-" });

  const connectionResponse = await postJson(baseUrl, "/api/marketplace-connections", {
    marketplace: "comc",
    accountLabel: "COMC partner API",
    accessToken: "partner-secret",
    metadata: {
      handoffStatusUrl: `${partner.baseUrl}/status/{listingId}?submission={submissionReference}`,
      handoffSubmissionUrl: `${partner.baseUrl}/submit/{listingId}`,
      apiKeyHeader: "X-Partner-Key",
      apiKeyPrefix: "",
      handoffStatusTimeoutMs: 1000,
      handoffSubmissionTimeoutMs: 1000,
    },
  });
  assert.equal(connectionResponse.status, 201);
  const connection = await connectionResponse.json();

  const testResponse = await postJson(baseUrl, `/api/marketplace-connections/${connection.id}/test`, {
    listingId: "comc-validation-listing",
    submissionReference: "validation-input-ref",
  });
  assert.equal(testResponse.status, 200);
  const payload = await testResponse.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.marketplace, "comc");
  assert.equal(payload.authStatus, "connected");
  assert.equal(payload.endpointValidation.status.attempted, true);
  assert.equal(payload.endpointValidation.status.ok, true);
  assert.equal(payload.endpointValidation.status.status, "handoff_submitted");
  assert.equal(payload.endpointValidation.submission.attempted, true);
  assert.equal(payload.endpointValidation.submission.ok, true);
  assert.equal(payload.endpointValidation.submission.status, "handoff_submitted");
  assert.equal(payload.diagnostics.statusEndpointConfigured, true);
  assert.equal(payload.diagnostics.submissionEndpointConfigured, true);
  assert.doesNotMatch(JSON.stringify(payload), /partner-secret|accessToken|refreshToken|api_key|apiKey/);

  assert.equal(partner.requests.length, 2);
  assert.equal(partner.requests[0].method, "GET");
  assert.equal(partner.requests[0].partnerKey, "partner-secret");
  assert.match(partner.requests[0].url, /\/status\/comc-validation-listing/);
  assert.equal(partner.requests[1].method, "POST");
  assert.equal(partner.requests[1].partnerKey, "partner-secret");
  assert.match(partner.requests[1].url, /\/submit\/comc-validation-listing/);
  assert.equal(partner.requests[1].body.dryRun, true);
  assert.equal(partner.requests[1].body.handoff.submissionReference, "validation-input-ref");

  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("SELECT auth_status FROM marketplace_connections WHERE id = ?").get(connection.id);
    assert.equal(row.auth_status, "connected");
    const eventCount = db.prepare("SELECT COUNT(*) AS count FROM listing_channel_events").get();
    assert.equal(eventCount.count, 0);
  } finally {
    db.close();
  }
});
