import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("confidence calibration returns null before minimum samples, then smoothed rate", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-calibration-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;
  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const shared = await import("../src/server/routes/shared.js");
  const calibration = await import("../src/server/services/decisions/confidenceCalibration.js");

  const db = database.initDB();

  function seedDecision(type, accepted) {
    const decisionId = shared.uid();
    database.run(
      `INSERT INTO decisions (id, decision_type, subject_type, subject_id, recommendation, confidence, status)
       VALUES (?,?,?,?,?,?,?)`,
      [decisionId, type, "inventory_item", shared.uid(), "test_reco", 0.5, "open"],
    );
    database.run(
      `INSERT INTO decision_feedback (id, decision_id, user_response, accepted, overridden, snoozed)
       VALUES (?,?,?,?,?,?)`,
      [shared.uid(), decisionId, accepted ? "accepted" : "overridden", accepted ? 1 : 0, accepted ? 0 : 1, 0],
    );
  }

  try {
    // No feedback → null
    assert.equal(calibration.getCalibratedConfidence("grading_decision"), null);

    // 4 resolved, below minSamples=5 → confidence is null but sampleSize tracked
    for (let i = 0; i < 4; i += 1) seedDecision("grading_decision", true);
    const underSampled = calibration.getCalibratedConfidence("grading_decision");
    assert.equal(underSampled.confidence, null);
    assert.equal(underSampled.sampleSize, 4);

    // Add one more (5 accepted, 0 overridden) → Laplace smoothed: (5+1)/(5+2) ≈ 0.857
    seedDecision("grading_decision", true);
    const calibrated = calibration.getCalibratedConfidence("grading_decision");
    assert.equal(calibrated.sampleSize, 5);
    assert.equal(calibrated.confidence, 0.857);

    // Mix: 5 accepted + 5 overridden → (5+1)/(10+2) = 0.5
    for (let i = 0; i < 5; i += 1) seedDecision("grading_decision", false);
    const mixed = calibration.getCalibratedConfidence("grading_decision");
    assert.equal(mixed.sampleSize, 10);
    assert.equal(mixed.confidence, 0.5);

    // calibrateConfidence returns prior when not enough data for a different type
    const prior = calibration.calibrateConfidence("marketplace_decision", 0.65);
    assert.equal(prior.calibrated, false);
    assert.equal(prior.confidence, 0.65);

    assert.throws(
      () => calibration.calibrateConfidence("marketplace_decision", 1.5),
      /priorConfidence must be a finite number between 0 and 1/,
    );
  } finally {
    db.close();
    if (previousPath === undefined) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
});
