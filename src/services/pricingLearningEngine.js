// Pricing Learning Engine (v1)

let historicalSales = []

export function recordSale(data) {
  historicalSales.push({
    ...data,
    timestamp: Date.now()
  })
}

export function getHistoricalInsights(card) {
  const matches = historicalSales.filter(s =>
    s.cardId === card.id ||
    (s.player === card.player && s.set === card.set)
  )

  if (!matches.length) {
    return {
      adjustment: 1,
      confidence: 0,
      note: 'No historical data'
    }
  }

  const avgSale = matches.reduce((sum, s) => sum + s.soldPrice, 0) / matches.length
  const avgList = matches.reduce((sum, s) => sum + s.listedPrice, 0) / matches.length

  const ratio = avgSale / avgList

  return {
    adjustment: ratio,
    confidence: Math.min(1, matches.length / 10),
    note: `Historical ratio: ${ratio.toFixed(2)}`
  }
}

export function applyLearning(basePrice, insights) {
  return Math.round(basePrice * insights.adjustment)
}
