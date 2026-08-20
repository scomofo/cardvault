// Pure derivation of guided-setup progress from the three connection statuses.
// Kept DI-friendly so it can be unit tested without a DOM.

export const SETUP_STEPS = [
  {
    key: "ai",
    title: "Connect Claude AI",
    description: "Powers card recognition, price lookups, and grade prediction",
  },
  {
    key: "ebay",
    title: "Connect eBay",
    description: "Publish listings live straight from the scan flow",
  },
  {
    key: "shipping",
    title: "Add a shipping provider",
    description: "Buy Canada Post labels when orders come in",
  },
];

// statuses: { ai: {configured}|null, ebay: {connected}|null, shipping: array|null }
export function deriveSetupProgress(statuses = {}) {
  const done = {
    ai: Boolean(statuses.ai?.configured),
    ebay: Boolean(statuses.ebay?.connected),
    shipping: Array.isArray(statuses.shipping) && statuses.shipping.length > 0,
  };
  const steps = SETUP_STEPS.map((step) => ({ ...step, done: done[step.key] }));
  const remaining = steps.filter((step) => !step.done);
  return {
    steps,
    remaining: remaining.length,
    complete: remaining.length === 0,
    nextKey: remaining[0]?.key || null,
  };
}
