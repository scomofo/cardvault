import { all } from "../../database.js";
import { similarity } from "./utils.js";

/**
 * Generate candidate catalog cards matching parsed clues.
 * @param {object} clues
 * @returns {object[]}
 */
export function generateCandidates(clues) {
  const catalog = all(`SELECT * FROM catalog_cards ORDER BY source_confidence DESC, id ASC LIMIT 500`);
  const candidates = catalog
    .map((card) => {
      const playerScore = similarity(clues.player, card.normalized_player_name || card.player_name || "");
      const setScore = similarity(clues.set, card.normalized_set_name || card.set_name || "");
      const parallelScore = clues.parallel
        ? similarity(clues.parallel, card.normalized_parallel_name || card.parallel_name || "")
        : 0.2;
      const yearScore = clues.year && card.year && String(clues.year) === String(card.year) ? 1 : 0;
      const numberScore = clues.cardNumber && card.card_number && String(clues.cardNumber).toLowerCase() === String(card.card_number).toLowerCase() ? 1 : 0;
      const score = playerScore * 0.35 + setScore * 0.3 + yearScore * 0.15 + numberScore * 0.15 + parallelScore * 0.05;
      return { card, score, playerScore, setScore, yearScore, numberScore, parallelScore };
    })
    .filter((candidate) => candidate.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return candidates;
}
