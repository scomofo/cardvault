// Recover an offline-created draft only after the server confirms it is missing.
export async function saveDraftReviewWithRecovery({ listing, card, values, listingsAPI, itemsAPI }) {
  try { return await listingsAPI.saveReview(listing.id, values); }
  catch (error) {
    if (error.status !== 404) throw error;
    let current;
    try { current = await itemsAPI.get(card.id); }
    catch (itemError) {
      if (itemError.status !== 404) throw itemError;
      current = await itemsAPI.create(card);
    }
    if (current.status === "sold" || current.saleStatus === "sold") throw new Error("This card is already sold. Refresh your collection before listing.", { cause: error });
    await listingsAPI.create({ ...listing, status: "draft", publishStatus: "draft" });
    return listingsAPI.saveReview(listing.id, values);
  }
}
