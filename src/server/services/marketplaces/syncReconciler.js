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

function toCents(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function comparePrice(localListing, remotePayload) {
  const remotePayloadPrice = remotePayload?.price ?? remotePayload?.buy_now_price ?? remotePayload?.start_price;
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

function compareExternalId(channel, synced) {
  const local = channel.external_listing_id || null;
  const remote = synced.externalListingId || null;
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

function compareStatus(channel, synced) {
  const local = channel.status || null;
  const remote = synced.status || null;
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

function detectMissingRemote(synced) {
  if (synced.externalListingId || synced.status) return null;
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
  const missing = detectMissingRemote(synced);
  if (missing) {
    conflicts.push(missing);
  } else {
    const idConflict = compareExternalId(channel, synced);
    if (idConflict) conflicts.push(idConflict);
    const statusConflict = compareStatus(channel, synced);
    if (statusConflict) conflicts.push(statusConflict);
    const priceConflict = comparePrice(listing, synced.payload);
    if (priceConflict) conflicts.push(priceConflict);
  }

  const hasBlockingConflict = conflicts.some((c) => c.severity === "error");
  return {
    conflicts,
    hasBlockingConflict,
    safeToApply: !hasBlockingConflict,
  };
}
