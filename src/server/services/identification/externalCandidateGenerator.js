import { jaroWinkler } from "./fuzzy.js";
import { normalizeText } from "./utils.js";

const CONFIDENCE_MAP = { high: 0.9, medium: 0.7, low: 0.5 };

function confidenceToScore(confidence) {
  const key = String(confidence || "").toLowerCase();
  return CONFIDENCE_MAP[key] ?? 0.55;
}

function exactMatchScore(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

function cluesHaveSignal(clues) {
  return Boolean(
    clues?.player || clues?.set || clues?.year || clues?.cardNumber,
  );
}

function buildExternalReferenceKey(vs) {
  return [vs.year, vs.set, vs.number]
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

/**
 * Translate a visual-search payload into the candidate.card shape expected
 * by the ranker / scorer / reviewer pipeline. `id` is null — catalog rows
 * are only materialized after a positive identification is confirmed.
 */
function buildCard(vs) {
  return {
    id: null,
    player_name: vs.name || "",
    manufacturer_name: "",
    set_name: vs.set || "",
    year: vs.year || "",
    card_number: vs.number || "",
    parallel_name: vs.parallel || "",
    team_name: "",
    rarity: vs.rarity || "",
    type: vs.type || "other",
    external_reference_key: buildExternalReferenceKey(vs),
    source_confidence: confidenceToScore(vs.confidence),
    priceEstimate: vs.priceEstimate || null,
    priceHistory: Array.isArray(vs.priceHistory) ? vs.priceHistory : null,
    searchResults: Array.isArray(vs.results) ? vs.results : null,
    cardName: vs.cardName || vs.name || "",
  };
}

function scoreAgainstClues(vs, clues) {
  const playerScore = jaroWinkler(clues.player || "", vs.name || "");
  const setScore = jaroWinkler(clues.set || "", vs.set || "");
  const yearScore = exactMatchScore(clues.year, vs.year);
  const numberScore = exactMatchScore(clues.cardNumber, vs.number);
  const parallelScore = clues.parallel
    ? jaroWinkler(clues.parallel, vs.parallel || "")
    : 0.2;
  return { playerScore, setScore, yearScore, numberScore, parallelScore };
}

/**
 * Build identification candidates from an external visual search result.
 * The returned shape mirrors the local candidateGenerator output so the
 * existing rankCandidates / scoreConfidence / routeReview chain consumes
 * it unchanged.
 *
 * @param {object} clues parsed clues from clueParser
 * @param {object|null} visualSearchResult result from aiVisualSearch
 * @returns {Array<object>}
 */
export function generateExternalCandidates(clues, visualSearchResult) {
  if (!visualSearchResult || !visualSearchResult.name) return [];

  const card = buildCard(visualSearchResult);
  const per = scoreAgainstClues(visualSearchResult, clues || {});
  const agreement =
    per.playerScore * 0.35 +
    per.setScore * 0.3 +
    per.yearScore * 0.15 +
    per.numberScore * 0.15 +
    per.parallelScore * 0.05;

  const base = confidenceToScore(visualSearchResult.confidence);
  const blended = cluesHaveSignal(clues) ? base * 0.6 + agreement * 0.4 : base;
  const score = Math.max(0, Math.min(blended, 0.99));

  return [
    {
      card,
      score,
      playerScore: per.playerScore,
      setScore: per.setScore,
      yearScore: per.yearScore,
      numberScore: per.numberScore,
      parallelScore: per.parallelScore,
    },
  ];
}
