// Grading logic based on Card Docs — "weakest link" approach used by PSA/BGS/SGC

// Weights: Corners & Surface 30% each, Centering & Edges 20% each
const WEIGHTS = { centering: 0.2, corners: 0.3, edges: 0.2, surface: 0.3 };

export function calculateGrade(scores) {
  const { centering, corners, edges, surface } = scores;
  const vals = [centering, corners, edges, surface].map(Number).filter((v) => !isNaN(v));
  if (vals.length < 4) return null;

  const floor = Math.min(...vals);
  const weighted = centering * WEIGHTS.centering + corners * WEIGHTS.corners + edges * WEIGHTS.edges + surface * WEIGHTS.surface;
  const avg = vals.reduce((s, v) => s + v, 0) / 4;

  // Hybrid: weighted average capped at floor + 1.0
  const hybrid = Math.min(weighted, floor + 1.0);
  // Final: also can't exceed simple average capped at floor + 1
  const final = Math.min(avg, floor + 1.0);

  return {
    floor: Math.round(floor * 10) / 10,
    weighted: Math.round(weighted * 10) / 10,
    hybrid: Math.round(hybrid * 10) / 10,
    final: Math.round(final * 10) / 10,
  };
}

// Grade translation scale from Card Docs
const GRADE_SCALE = [
  { min: 9.5, term: "Gem Mint", desc: "Virtually perfect to the naked eye.", color: "#30a46c", emoji: "gem", action: "Immediate grading candidate" },
  { min: 9.0, term: "Mint", desc: "One very minor flaw (usually centering or a single white speck).", color: "#3dd68c", emoji: "sparkles", action: "Strong grading candidate" },
  { min: 8.0, term: "NM-MT", desc: "Near Mint-Mint. Sharp, but has visible minor wear.", color: "#5ccfb5", emoji: "star", action: "Review for raw sale or grading" },
  { min: 7.0, term: "NM", desc: "Near Mint. Visible whitening or slight surface scuffing.", color: "#52a8ff", emoji: "ok", action: "Sell raw" },
  { min: 0, term: "EX / VG", desc: "Significant flaws; strictly for raw sales or personal collections.", color: "#e5484d", emoji: "warning", action: "Bulk/value bin" },
];

export function gradeToTerm(score) {
  return GRADE_SCALE.find((g) => score >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

// Vault Status — Traffic Light sorting system from Grading Integration Spec
// GREEN = High-value grading candidate, YELLOW = Solid raw sale, RED = Bulk/discount
export function assignVaultStatus(projectedGrade) {
  if (projectedGrade >= 9.5) return { status: "GREEN", label: "Grading Candidate", color: "#4ade80" };
  if (projectedGrade >= 8.5) return { status: "YELLOW", label: "Raw Sale", color: "#fbbf24" };
  return { status: "RED", label: "Bulk / Budget", color: "#f87171" };
}

// Full grading assessment combining grade calculation + vault status
export function fullGradingAssessment(scores) {
  const grade = calculateGrade(scores);
  if (!grade) return null;
  const term = gradeToTerm(grade.final);
  const vault = assignVaultStatus(grade.final);
  const report = generateConditionReport(scores);
  return { ...grade, term: term.term, termColor: term.color, action: term.action, vault, report };
}

// Generate eBay-ready condition description from sub-grades
export function generateConditionReport(scores) {
  const { centering, corners, edges, surface } = scores;
  const grade = calculateGrade(scores);
  if (!grade) return "";

  const term = gradeToTerm(grade.final);

  function getDesc(score) {
    const s = Number(score);
    if (s >= 9.5) return "Gem Mint / Flawless";
    if (s >= 9) return "Mint / Extremely Sharp";
    if (s >= 8) return "Near Mint+ / Minor wear visible";
    return "Good-EX / Visible imperfections";
  }

  let headline;
  if (grade.final >= 9.5) headline = "GRADABLE GEM MINT CANDIDATE";
  else if (grade.final >= 8.5) headline = "HIGH-GRADE MINT CONDITION";
  else headline = "SHARP RAW COLLECTOR CARD";

  return [
    headline,
    "",
    "Detailed Condition Report:",
    `- Centering: ${getDesc(centering)} (${centering}/10)`,
    `- Corners: ${getDesc(corners)} (${corners}/10)`,
    `- Edges: ${getDesc(edges)} (${edges}/10)`,
    `- Surface: ${getDesc(surface)} (${surface}/10)`,
    "",
    `Overall Grade Estimate: ${grade.final}/10 (${term.term})`,
    "",
    "Card photographed in controlled lighting. See high-resolution photos for exact condition.",
    "Ships securely in a brand new penny sleeve and toploader from Canada.",
  ].join("\n");
}
