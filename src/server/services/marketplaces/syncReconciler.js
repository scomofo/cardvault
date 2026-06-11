/**
 * Sync reconciliation — compares local listing/channel state with the
 * payload returned by a marketplace adapter's sync call, and produces a
 * list of structured conflicts. Pure function, no DB I/O.
 *
 * Conflict types:
 *   - external_id_mismatch : remote externalListingId doesn't match what
 *                            we stored on publish
 *   - status_mismatch      : remote reports a different status than local
 *   - price_mismatch       : remote price differs from local listing price
 *                            (only when the adapter surfaces a price)
 *   - missing_remote       : adapter returned no externalListingId and no
 *                            status; remote state is unknown
 *
 * Severity levels:
 *   - info    : informational, no action required
 *   - warning : operator should review before applying
 *   - error   : applying remote would corrupt local state
 *
 * Output shape:
 *   {
 *     conflicts: Array<{ type, severity, field?, localValue?, remoteValue?, message }>,
 *     hasBlockingConflict: boolean,
 *     safeToApply: boolean,
 *   }
 */

const PRICE_TOLERANCE_CENTS = 1;

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function toCents(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function amountValue(value) {
  if (value && typeof value === "object" && "value" in value) return value.value;
  return value;
}

function readPayloadPrice(payload = {}) {
  const firstOffer = Array.isArray(payload.offers) ? payload.offers[0] : null;
  return firstDefined(
    amountValue(payload.price),
    amountValue(payload.currentPrice),
    amountValue(payload.current_price),
    amountValue(payload.buyNowPrice),
    amountValue(payload.buy_now_price),
    amountValue(payload.startPrice),
    amountValue(payload.start_price),
    amountValue(payload.pricingSummary?.price),
    amountValue(payload.pricingSummary?.currentPrice),
    amountValue(payload.pricing_summary?.price),
    amountValue(payload.pricing_summary?.current_price),
    amountValue(firstOffer?.price),
  );
}

function normalizeRemoteState(synced = {}) {
  const payload = synced.payload && typeof synced.payload === "object" ? synced.payload : {};
  const status = firstDefined(
    synced.status,
    synced.listingStatus,
    synced.listing_status,
    payload.status,
    payload.listingStatus,
    payload.listing_status,
    payload.marketplaceStatus,
    payload.marketplace_status,
  );

  return {
    externalListingId: firstDefined(
      synced.externalListingId,
      synced.external_listing_id,
      synced.listingId,
      synced.listing_id,
      synced.itemId,
      synced.item_id,
      payload.externalListingId,
      payload.external_listing_id,
      payload.listingId,
      payload.listing_id,
      payload.itemId,
      payload.item_id,
      payload.legacyItemId,
      payload.legacy_item_id,
    ) || null,
    status: status == null ? null : String(status).toLowerCase(),
    price: firstDefined(
      amountValue(synced.price),
      amountValue(synced.currentPrice),
      amountValue(synced.current_price),
      readPayloadPrice(payload),
    ),
  };
}

function comparePrice(localListing, remoteState) {
  const remotePayloadPrice = remoteState.price;
  if (remotePayloadPrice == null) return null;
  const localPrice = localListing.buy_now_price ?? localListing.start_price;
  const localCents = toCents(localPrice);
  const remoteCents = toCents(remotePayloadPrice);
  if (localCents == null || remoteCents == null) return null;
  if (Math.abs(localCents - remoteCents) <= PRICE_TOLERANCE_CENTS) return null;
  return {
    type: "price_mismatch",
    severity: "warning",
    field: "buy_now_price",
    localValue: localPrice,
    remoteValue: remotePayloadPrice,
    message: `Local price $${(localCents / 100).toFixed(2)} differs from remote $${(remoteCents / 100).toFixed(2)}`,
  };
}

function compareExternalId(channel, remoteState) {
  const local = channel.external_listing_id || null;
  const remote = remoteState.externalListingId || null;
  if (!local || !remote) return null;
  if (local === remote) return null;
  return {
    type: "external_id_mismatch",
    severity: "error",
    field: "external_listing_id",
    localValue: local,
    remoteValue: remote,
    message: `Local external id ${local} differs from remote ${remote} — possible duplicate listing`,
  };
}

function compareStatus(channel, remoteState) {
  const local = channel.status || null;
  const remote = remoteState.status || null;
  if (!remote) return null;
  if (!local) return null;
  if (local === remote) return null;
  // "active" ↔ "revised" is normal after a revise; not a conflict
  if (local === "active" && remote === "revised") return null;
  if (local === "revised" && remote === "active") return null;
  return {
    type: "status_mismatch",
    severity: "warning",
    field: "status",
    localValue: local,
    remoteValue: remote,
    message: `Local status "${local}" differs from remote "${remote}"`,
  };
}

function detectMissingRemote(remoteState) {
  if (remoteState.externalListingId || remoteState.status) return null;
  return {
    type: "missing_remote",
    severity: "error",
    message: "Adapter returned no remote state — cannot reconcile",
  };
}

/**
 * @param {object} listing row from the `listings` table
 * @param {object} channel row from the `listing_channels` table
 * @param {{ externalListingId?: string, status?: string, payload?: object, syncedAt?: string }} synced
 * @returns {{ conflicts: object[], hasBlockingConflict: boolean, safeToApply: boolean }}
 */
export function reconcileSyncResult(listing, channel, synced) {
  const conflicts = [];
  const remoteState = normalizeRemoteState(synced);
  const missing = detectMissingRemote(remoteState);
  if (missing) {
    conflicts.push(missing);
  } else {
    const idConflict = compareExternalId(channel, remoteState);
    if (idConflict) conflicts.push(idConflict);
    const statusConflict = compareStatus(channel, remoteState);
    if (statusConflict) conflicts.push(statusConflict);
    const priceConflict = comparePrice(listing, remoteState);
    if (priceConflict) conflicts.push(priceConflict);
  }

  const hasBlockingConflict = conflicts.some((c) => c.severity === "error");
  return {
    conflicts,
    hasBlockingConflict,
    safeToApply: !hasBlockingConflict,
    remoteState,
  };
}
