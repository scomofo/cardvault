import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { calibrateConfidence } from "./confidenceCalibration.js";

/**
 * Persist decision results to the database.
 * @param {object[]} decisions
 * @returns {object[]}
 */
export function saveDecisions(decisions) {
  const saved = [];
  for (const decision of decisions) {
    const id = uid();
    const calibration = calibrateConfidence(decision.decisionType, decision.confidence);
    const inputsWithCalibration = {
      ...(decision.inputsUsed || {}),
      calibration: {
        priorConfidence: calibration.priorConfidence,
        calibrated: calibration.calibrated,
        sampleSize: calibration.sampleSize,
      },
    };
    run(
      `INSERT INTO decisions
       (id, decision_type, subject_type, subject_id, recommendation, confidence,
        explanation, suggested_action_type, suggested_action_payload, inputs_json,
        status, created_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        decision.decisionType,
        decision.subjectType,
        String(decision.subjectId),
        decision.recommendation,
        calibration.confidence,
        decision.explanation,
        decision.suggestedAction?.type || null,
        decision.suggestedAction ? JSON.stringify(decision.suggestedAction) : null,
        JSON.stringify(inputsWithCalibration),
        decision.status || "open",
        decision.createdAt || new Date().toISOString(),
        decision.expiresAt || null,
      ],
    );
    saved.push(get("SELECT * FROM decisions WHERE id = ?", [id]));
  }
  return saved;
}

/**
 * Query persisted decisions with optional filters.
 * @param {{ subjectType?: string, subjectId?: string, status?: string }} [params]
 * @returns {object[]}
 */
export function listDecisions(params = {}) {
  const clauses = [];
  const values = [];
  if (params.subjectType) {
    clauses.push("subject_type = ?");
    values.push(params.subjectType);
  }
  if (params.subjectId) {
    clauses.push("subject_id = ?");
    values.push(String(params.subjectId));
  }
  if (params.status) {
    clauses.push("status = ?");
    values.push(params.status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all(`SELECT * FROM decisions ${where} ORDER BY created_at DESC`, values);
}

/**
 * Record user feedback on a decision.
 * @param {string} decisionId
 * @param {object} feedback
 * @returns {object}
 */
export function addDecisionFeedback(decisionId, feedback) {
  run(
    `INSERT INTO decision_feedback
     (id, decision_id, user_response, accepted, overridden, snoozed, override_reason)
     VALUES (?,?,?,?,?,?,?)`,
    [
      uid(),
      decisionId,
      feedback.userResponse || null,
      feedback.accepted ? 1 : 0,
      feedback.overridden ? 1 : 0,
      feedback.snoozed ? 1 : 0,
      feedback.overrideReason || null,
    ],
  );

  run(
    `UPDATE decisions
     SET status = ?, resolved_at = CASE WHEN ? THEN datetime('now') ELSE resolved_at END
     WHERE id = ?`,
    [
      feedback.snoozed ? "snoozed" : feedback.overridden ? "overridden" : feedback.accepted ? "accepted" : "dismissed",
      feedback.accepted || feedback.overridden || feedback.userResponse === "dismissed" ? 1 : 0,
      decisionId,
    ],
  );

  return get("SELECT * FROM decisions WHERE id = ?", [decisionId]);
}
