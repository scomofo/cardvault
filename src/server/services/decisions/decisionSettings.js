import { get } from "../../database.js";

const DEFAULTS = {
  grading_cost: 25,
  grading_upside_grade_now: 40,
  grading_upside_maybe: 10,
  grading_min_projected_grade: 7.5,
  marketplace_consignment_threshold: 500,
  marketplace_low_value_floor: 10,
  marketplace_stale_days_comc: 120,
  marketplace_stale_days_crosspost: 60,
};

function readSetting(key) {
  try {
    return get("SELECT value FROM settings WHERE key = ?", [key])?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a numeric decision threshold from the settings table, falling back
 * to the documented default. Unknown keys throw — call sites should only
 * reference keys listed in DEFAULTS.
 */
export function getDecisionNumber(key) {
  if (!(key in DEFAULTS)) {
    throw new Error(`Unknown decision setting: ${key}`);
  }
  const raw = readSetting(key);
  if (raw == null || raw === "") return DEFAULTS[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULTS[key];
}

export const DECISION_SETTING_KEYS = Object.keys(DEFAULTS);
export const DECISION_SETTING_DEFAULTS = { ...DEFAULTS };
