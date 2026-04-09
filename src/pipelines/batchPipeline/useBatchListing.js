// Batch Auto Listing Pipeline

import { generateListing } from '../../services/listingService'
import { analyzePricing } from '../../services/pricingEngine'

export function useBatchListing() {
  async function processBatch(cards) {
    return cards.map(card => {
      const pricing = card.pricing || {}
      const grade = card.grade || null

      const pricingInsights = analyzePricing({
        comps: pricing.comps || [],
        grade,
        card
      })

      const listing = generateListing({
        card,
        pricing,
        grade
      })

      return {
        ...listing,
        strategy: pricingInsights.strategy,
        confidence: pricingInsights.confidence
      }
    })
  }

  return {
    processBatch
  }
}
