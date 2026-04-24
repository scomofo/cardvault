import test from "node:test";
import assert from "node:assert/strict";
import { acquisitionDecision } from "../src/server/services/decisions/acquisitionDecision.js";
import { identificationDecision } from "../src/server/services/decisions/identificationDecision.js";
import { runGradingAutomation } from "../src/server/services/automation/gradingAutomation.js";

test("acquisitionDecision preserves explicit zero estimated exit value", () => {
  const decision = acquisitionDecision({
    subjectType: "purchase",
    subjectId: "purchase-1",
    purchase: {
      total_cost: 10,
      estimated_exit_value: 0,
    },
  });

  assert.equal(decision.inputsUsed.estimatedExitValue, 0);
  assert.equal(decision.recommendation, "pass");
});

test("identificationDecision uses the clamped confidence consistently", () => {
  const decision = identificationDecision({
    subjectType: "inventory_item",
    subjectId: "item-1",
    item: {
      cv_centering_score: 0,
      front_img_id: "front-1",
      back_img_id: null,
    },
  });

  assert.equal(decision.confidence, 0.35);
  assert.match(decision.explanation, /0\.35/);
  assert.equal(decision.inputsUsed.confidence, 0.35);
});

test("runGradingAutomation rejects unsupported itemId types", () => {
  assert.throws(
    () => runGradingAutomation({ itemId: { invalid: true } }),
    /itemId must be a string or number/,
  );
});
