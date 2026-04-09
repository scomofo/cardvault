// Pricing Intelligence Engine v1

export function analyzePricing({ comps = [], grade, card }) {
  if (!comps.length) {
    return {
      strategy: 'fallback',
      suggestedPrice: 0,
      confidence: 0,
      reasoning: 'No comps available'
    }
  }

  const prices = comps.map(c => c.price).filter(Boolean)

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const min = Math.min(...prices)
  const max = Math.max(...prices)

  const volatility = (max - min) / avg

  let strategy = 'buy_it_now'
  if (volatility > 0.25) strategy = 'auction'

  let gradeMultiplier = 1
  if (grade >= 9.5) gradeMultiplier = 1.2
  else if (grade >= 9) gradeMultiplier = 1.1
  else if (grade < 7) gradeMultiplier = 0.8

  const suggestedPrice = Math.round(avg * gradeMultiplier)

  return {
    strategy,
    suggestedPrice,
    confidence: Math.min(1, prices.length / 10),
    reasoning: `Avg: ${avg.toFixed(2)}, Volatility: ${volatility.toFixed(2)}, Grade adj: ${gradeMultiplier}`
  }
}
