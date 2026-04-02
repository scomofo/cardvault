export function rankCandidates(candidates) {
  return candidates.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    explanation: [
      candidate.playerScore > 0.7 ? "strong player match" : null,
      candidate.setScore > 0.7 ? "strong set match" : null,
      candidate.yearScore ? "year match" : null,
      candidate.numberScore ? "card number match" : null,
    ]
      .filter(Boolean)
      .join(", "),
  }));
}
