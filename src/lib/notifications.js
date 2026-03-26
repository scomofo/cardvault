// Browser notification system for CardVault

let permission = typeof Notification !== "undefined" ? Notification.permission : "denied";

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return false;
  if (permission === "granted") return true;
  const result = await Notification.requestPermission();
  permission = result;
  return result === "granted";
}

export function canNotify() {
  return typeof Notification !== "undefined" && permission === "granted";
}

export function sendNotification(title, body, tag) {
  if (!canNotify()) return null;
  try {
    return new Notification(title, {
      body,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗃️</text></svg>",
      tag: tag || undefined,
      requireInteraction: false,
    });
  } catch { return null; }
}

// Auction end timer — checks listings and fires notifications
const timers = new Map();

export function scheduleAuctionNotification(listing) {
  if (!listing.auctionEndDate || listing.format !== "auction") return;
  const endTime = new Date(listing.auctionEndDate).getTime();
  const now = Date.now();

  // Clear existing timer for this listing
  if (timers.has(listing.id)) {
    clearTimeout(timers.get(listing.id));
    timers.delete(listing.id);
  }

  // 15 minutes before end
  const warn15 = endTime - 15 * 60 * 1000;
  if (warn15 > now) {
    const t = setTimeout(() => {
      sendNotification(
        "Auction ending in 15 min!",
        `${listing.cardName} on ${listing.platform} — current bid: $${listing.currentBid || listing.startPrice}`,
        `auction-warn-${listing.id}`
      );
    }, warn15 - now);
    timers.set(`${listing.id}-warn`, t);
  }

  // At end
  if (endTime > now) {
    const t = setTimeout(() => {
      sendNotification(
        "Auction ended!",
        `${listing.cardName} on ${listing.platform} — check results`,
        `auction-end-${listing.id}`
      );
    }, endTime - now);
    timers.set(listing.id, t);
  }
}

export function cancelNotificationTimer(listingId) {
  if (timers.has(listingId)) { clearTimeout(timers.get(listingId)); timers.delete(listingId); }
  if (timers.has(`${listingId}-warn`)) { clearTimeout(timers.get(`${listingId}-warn`)); timers.delete(`${listingId}-warn`); }
}

export function clearAllTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}
