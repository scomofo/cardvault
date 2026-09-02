import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("publish service covers publish, revise, end, and handoff lifecycle", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-publish-lifecycle-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const {
    publishListingToMarketplace,
    reviseListingOnMarketplace,
    endListingOnMarketplace,
    updateMarketplaceHandoffStatus,
    submitMarketplaceHandoffs,
  } = await import("../src/server/services/marketplaces/publishService.js");

  const db = database.initDB();
  const comcAdapter = registry.getMarketplaceAdapter("comc");
  const originalRevise = comcAdapter.revise;
  const originalEnd = comcAdapter.end;
  const originalSubmitHandoff = comcAdapter.submitHandoff;

  function seedListing(prefix, { publishError = null } = {}) {
    database.run(
      `INSERT INTO listings
       (id, card_name, card_set, platform, listing_title, start_price, status, publish_status, publish_error)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [`${prefix}-listing`, "Test Card", "Test Set", "comc", "Test Card listing", 50, "draft", "draft", publishError],
    );
  }

  function getChannel(listingId) {
    return database.get(
      `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = 'comc'`,
      [listingId],
    );
  }

  function channelEvents(channelId, eventType) {
    return database.all(
      `SELECT * FROM listing_channel_events WHERE listing_channel_id = ? AND event_type = ?`,
      [channelId, eventType],
    );
  }

  try {
    await t.test("publishListingToMarketplace rejects unknown listings", async () => {
      await assert.rejects(() => publishListingToMarketplace("missing", "comc"), /Listing not found/);
    });

    await t.test("publishListingToMarketplace creates then updates the channel", async () => {
      seedListing("pub");
      const first = await publishListingToMarketplace("pub-listing", "comc");
      assert.equal(first.marketplace, "comc");
      assert.equal(first.status, "handoff_ready");
      assert.match(first.external_listing_id, /^comc-handoff-/);

      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["pub-listing"]);
      assert.equal(listing.publish_status, "handoff_ready");
      assert.equal(listing.external_listing_id, first.external_listing_id);

      const second = await publishListingToMarketplace("pub-listing", "comc");
      assert.equal(second.id, first.id);
      const channels = database.all(`SELECT * FROM listing_channels WHERE listing_id = ?`, ["pub-listing"]);
      assert.equal(channels.length, 1);
      assert.equal(channelEvents(first.id, "publish").length, 2);
    });

    await t.test("reviseListingOnMarketplace updates the channel and clears publish errors", async () => {
      seedListing("rev", { publishError: "stale error" });
      await assert.rejects(() => reviseListingOnMarketplace("missing", "comc"), /Listing not found/);

      comcAdapter.revise = async (listing, overrides) => ({
        marketplace: "comc",
        externalListingId: "comc-rev-1",
        status: "revised",
        payload: { ...overrides },
        syncedAt: new Date().toISOString(),
      });

      const channel = await reviseListingOnMarketplace("rev-listing", "comc", { price: 60 });
      assert.equal(channel.status, "revised");
      assert.equal(channel.external_listing_id, "comc-rev-1");
      assert.equal(channelEvents(channel.id, "revise").length, 1);

      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["rev-listing"]);
      assert.equal(listing.publish_error, null);
      assert.equal(listing.publish_status, "revised");
    });

    await t.test("endListingOnMarketplace records the ended state", async () => {
      seedListing("end");
      comcAdapter.end = async () => ({
        marketplace: "comc",
        externalListingId: "comc-end-1",
        status: "ended",
        payload: {},
        syncedAt: new Date().toISOString(),
      });

      const channel = await endListingOnMarketplace("end-listing", "comc");
      assert.equal(channel.status, "ended");
      assert.equal(channelEvents(channel.id, "end").length, 1);

      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["end-listing"]);
      assert.equal(listing.status, "ended");
      assert.equal(listing.publish_status, "ended");
    });

    await t.test("updateMarketplaceHandoffStatus validates inputs", async () => {
      assert.throws(
        () => updateMarketplaceHandoffStatus({ listingId: "x", marketplace: "comc" }),
        /listingId, marketplace, and status required/,
      );
      assert.throws(
        () => updateMarketplaceHandoffStatus({ listingId: "x", marketplace: "ebay", status: "submitted" }),
        /does not support external handoff lifecycle/,
      );
      assert.throws(
        () => updateMarketplaceHandoffStatus({ listingId: "missing", marketplace: "comc", status: "submitted" }),
        /Listing not found/,
      );

      seedListing("handoff-nochannel");
      assert.throws(
        () => updateMarketplaceHandoffStatus({ listingId: "handoff-nochannel-listing", marketplace: "comc", status: "submitted" }),
        /Listing channel not found/,
      );
    });

    await t.test("updateMarketplaceHandoffStatus merges handoff metadata into overrides", async () => {
      seedListing("handoff-update");
      database.run(
        `INSERT INTO listing_channels (id, listing_id, marketplace, status, overrides)
         VALUES (?,?,?,?,?)`,
        ["handoff-update-channel", "handoff-update-listing", "comc", "handoff_ready", JSON.stringify({ handoff: { submissionType: "comc_submission" } })],
      );

      assert.throws(
        () => updateMarketplaceHandoffStatus({ listingId: "handoff-update-listing", marketplace: "comc", status: "no_such_status" }),
        /Unsupported handoff status/,
      );

      const updated = updateMarketplaceHandoffStatus({
        listingId: "handoff-update-listing",
        marketplace: "COMC",
        status: "handoff_submitted",
        submissionReference: "SUB-9",
        note: "In transit",
      });
      assert.equal(updated.status, "handoff_submitted");
      assert.equal(updated.publish_error, null);
      const overrides = JSON.parse(updated.overrides);
      assert.equal(overrides.handoff.submissionType, "comc_submission");
      assert.equal(overrides.handoff.submissionStatus, "submitted");
      assert.equal(overrides.handoff.submissionReference, "SUB-9");
      assert.equal(overrides.handoff.note, "In transit");
      assert.equal(channelEvents("handoff-update-channel", "handoff_status").length, 1);

      const failed = updateMarketplaceHandoffStatus({
        listingId: "handoff-update-listing",
        marketplace: "comc",
        status: "failed",
      });
      assert.equal(failed.status, "handoff_exception");
      assert.equal(failed.publish_error, "External handoff needs retry");
      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["handoff-update-listing"]);
      assert.equal(listing.publish_status, "handoff_exception");
    });

    await t.test("submitMarketplaceHandoffs validates marketplace, channels, and configuration", async () => {
      await assert.rejects(() => submitMarketplaceHandoffs({ marketplace: "ebay" }), /does not support external handoff lifecycle/);
      await assert.rejects(
        () => submitMarketplaceHandoffs({ marketplace: "consignment" }),
        /No handoff channels available for submission/,
      );

      seedListing("handoff-unconfigured");
      database.run(
        `INSERT INTO listing_channels (id, listing_id, marketplace, status)
         VALUES (?,?,?,?)`,
        ["handoff-unconfigured-channel", "handoff-unconfigured-listing", "comc", "handoff_ready"],
      );
      await assert.rejects(
        () => submitMarketplaceHandoffs({ marketplace: "comc", listingIds: ["handoff-unconfigured-listing"] }),
        (error) => {
          assert.match(error.message, /handoff submission is not configured/);
          assert.equal(error.code, "HANDOFF_SUBMISSION_NOT_CONFIGURED");
          assert.equal(error.listingId, "handoff-unconfigured-listing");
          return true;
        },
      );
    });

    await t.test("submitMarketplaceHandoffs persists submissions and exceptions per channel", async () => {
      database.run(
        `INSERT INTO marketplace_connections (id, marketplace, auth_status, metadata)
         VALUES (?,?,?,?)`,
        ["comc-conn", "comc", "connected", JSON.stringify({ handoffSubmissionUrl: "https://example.com/submit" })],
      );
      for (const prefix of ["handoff-ok", "handoff-bad"]) {
        seedListing(prefix);
        database.run(
          `INSERT INTO listing_channels (id, listing_id, marketplace, connection_id, status)
           VALUES (?,?,?,?,?)`,
          [`${prefix}-channel`, `${prefix}-listing`, "comc", "comc-conn", "handoff_ready"],
        );
      }

      comcAdapter.submitHandoff = async (listing) => {
        if (listing.id === "handoff-bad-listing") {
          throw new Error("Submission endpoint unavailable");
        }
        return {
          marketplace: "comc",
          externalListingId: listing.external_listing_id,
          status: "handoff_submitted",
          payload: { handoff: { submissionStatus: "submitted", submissionReference: "BATCH-1" } },
          syncedAt: new Date().toISOString(),
        };
      };

      const outcome = await submitMarketplaceHandoffs({
        marketplace: "comc",
        listingIds: ["handoff-ok-listing", "handoff-bad-listing"],
      });
      assert.equal(outcome.marketplace, "comc");
      assert.equal(outcome.results.length, 2);
      assert.deepEqual(outcome.handoff.listingIds, ["handoff-ok-listing"]);

      const okChannel = getChannel("handoff-ok-listing");
      assert.equal(okChannel.status, "handoff_submitted");
      assert.equal(okChannel.publish_error, null);
      assert.equal(JSON.parse(okChannel.overrides).handoff.submissionReference, "BATCH-1");
      assert.equal(channelEvents("handoff-ok-channel", "handoff_submission").length, 1);

      const badChannel = getChannel("handoff-bad-listing");
      assert.equal(badChannel.status, "handoff_exception");
      assert.equal(badChannel.publish_error, "Submission endpoint unavailable");
      const badHandoff = JSON.parse(badChannel.overrides).handoff;
      assert.equal(badHandoff.submissionStatus, "exception");
      assert.equal(badHandoff.note, "Submission endpoint unavailable");
      assert.equal(channelEvents("handoff-bad-channel", "handoff_submission").length, 1);
    });

    await t.test("publish and revise are locked once a handoff channel has left handoff_ready", async () => {
      seedListing("handoff-locked");
      database.run(
        `INSERT INTO listing_channels (id, listing_id, marketplace, status, overrides)
         VALUES (?,?,?,?,?)`,
        [
          "handoff-locked-channel",
          "handoff-locked-listing",
          "comc",
          "handoff_submitted",
          JSON.stringify({ handoff: { submissionType: "comc_submission", submissionReference: "SUB-77" } }),
        ],
      );

      await assert.rejects(
        () => publishListingToMarketplace("handoff-locked-listing", "comc"),
        (error) => {
          assert.match(error.message, /already has an external handoff in progress/);
          assert.equal(error.code, "HANDOFF_LOCKED");
          return true;
        },
      );
      await assert.rejects(
        () => reviseListingOnMarketplace("handoff-locked-listing", "comc", { price: 40 }),
        (error) => {
          assert.equal(error.code, "HANDOFF_LOCKED");
          return true;
        },
      );

      // Neither rejected call may have touched the channel's handoff record.
      const channel = getChannel("handoff-locked-listing");
      assert.equal(channel.status, "handoff_submitted");
      assert.equal(JSON.parse(channel.overrides).handoff.submissionReference, "SUB-77");
    });

    await t.test("upsertChannel merges the handoff sub-object instead of replacing it", async () => {
      seedListing("handoff-merge");
      database.run(
        `INSERT INTO listing_channels (id, listing_id, marketplace, status, overrides)
         VALUES (?,?,?,?,?)`,
        [
          "handoff-merge-channel",
          "handoff-merge-listing",
          "comc",
          "handoff_ready",
          JSON.stringify({ handoff: { submissionType: "comc_submission", submissionReference: "KEEP-ME" } }),
        ],
      );

      // A republish while still handoff_ready is allowed (not locked) and
      // must not drop the submissionReference a prior handoff step recorded.
      const republished = await publishListingToMarketplace("handoff-merge-listing", "comc");
      assert.equal(republished.status, "handoff_ready");
      const overrides = JSON.parse(republished.overrides);
      assert.equal(overrides.handoff.submissionReference, "KEEP-ME", "prior handoff fields survive a republish");
      assert.equal(overrides.handoff.submissionStatus, "ready_to_ship", "the fresh publish's own fields still land");
    });
  } finally {
    comcAdapter.revise = originalRevise;
    comcAdapter.end = originalEnd;
    comcAdapter.submitHandoff = originalSubmitHandoff;
    db.close();
    if (previousPath === undefined) {
      delete process.env.CARDVAULT_DB_PATH;
    } else {
      process.env.CARDVAULT_DB_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
