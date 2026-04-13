const API = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const { method = "GET", body } = options;
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

function toQuery(params) {
  if (!params) return "";
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

// User Items (catalog)
export const itemsAPI = {
  list: (params) => request(`/items${toQuery(params)}`),
  get: (id) => request(`/items/${id}`),
  create: (data) => request("/items", { method: "POST", body: data }),
  update: (id, data) => request(`/items/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/items/${id}`, { method: "DELETE" }),
};

// Sales
export const salesAPI = {
  list: () => request("/sales"),
  create: (data) => request("/sales", { method: "POST", body: data }),
};

export const ordersAPI = {
  list: () => request("/orders"),
  create: (data) => request("/orders", { method: "POST", body: data }),
};

// Listings
export const listingsAPI = {
  list: (params) => request(`/listings${toQuery(params)}`),
  create: (data) => request("/listings", { method: "POST", body: data }),
  update: (id, data) =>
    request(`/listings/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/listings/${id}`, { method: "DELETE" }),
};

export const decisionsAPI = {
  list: (params) => request(`/decisions${toQuery(params)}`),
  evaluate: (data) => request("/decisions/evaluate", { method: "POST", body: data }),
  feedback: (id, data) => request(`/decisions/${id}/feedback`, { method: "POST", body: data }),
  calibration: () => request("/decisions/calibration"),
};

export const actionQueueAPI = {
  list: () => request("/action-queue"),
};

export const dashboardAPI = {
  get: () => request("/dashboard"),
};

export const identificationAPI = {
  identify: (data) => request("/identification/identify", { method: "POST", body: data }),
  confirm: (data) => request("/identification/confirm", { method: "POST", body: data }),
  correct: (data) => request("/identification/correct", { method: "POST", body: data }),
  updateSimilarity: (itemId) => request(`/identification/similarity/${itemId}`, { method: "POST" }),
  similarity: (itemId) => request(`/identification/similarity/${itemId}`),
  dataset: () => request("/identification/dataset"),
  mineHardCases: () => request("/identification/hard-cases", { method: "POST" }),
};

export const automationAPI = {
  identifyAndPrice: (itemId, data) =>
    request(`/automation/identify-price/${itemId}`, { method: "POST", body: data }),
  generateListings: (data) =>
    request("/automation/listings/generate", { method: "POST", body: data }),
  agingRepricing: (data) =>
    request("/automation/aging-repricing", { method: "POST", body: data }),
  automateShipment: (orderId, data) =>
    request(`/automation/shipping/${orderId}`, { method: "POST", body: data }),
  actionQueue: () => request("/automation/action-queue"),
  duplicates: (params) => request(`/automation/duplicates${toQuery(params)}`),
  marketTrends: () => request("/automation/market-trends", { method: "POST" }),
  acquisitionDecision: (data) =>
    request("/automation/acquisition-decision", { method: "POST", body: data }),
  bundles: () => request("/automation/bundles"),
  grading: (params) => request(`/automation/grading${toQuery(params)}`),
  cashflow: () => request("/automation/cashflow"),
  createIntakeBatch: (data) =>
    request("/automation/intake/batches", { method: "POST", body: data }),
  addItemToBatch: (batchId, data) =>
    request(`/automation/intake/batches/${batchId}/items`, { method: "POST", body: data }),
  processBatchItem: (batchItemId, data) =>
    request(`/automation/intake/batch-items/${batchItemId}/process`, { method: "POST", body: data }),
  finalizeIntakeBatch: (batchId, data) =>
    request(`/automation/intake/batches/${batchId}/finalize`, { method: "POST", body: data }),
};

export const marketplacesAPI = {
  list: () => request("/marketplaces"),
  connections: () => request("/marketplace-connections"),
  connect: (data) => request("/marketplace-connections", { method: "POST", body: data }),
  publish: (data) => request("/marketplaces/publish", { method: "POST", body: data }),
  revise: (data) => request("/marketplaces/revise", { method: "POST", body: data }),
  end: (data) => request("/marketplaces/end", { method: "POST", body: data }),
  crosspost: (data) => request("/marketplaces/crosspost", { method: "POST", body: data }),
  sync: (data) => request("/marketplaces/sync", { method: "POST", body: data }),
  channels: (listingId) => request(`/marketplaces/listings/${listingId}/channels`),
  export: (data) => request("/marketplaces/export", { method: "POST", body: data }),
};

// Trades
export const tradesAPI = {
  list: () => request("/trades"),
  create: (data) => request("/trades", { method: "POST", body: data }),
  update: (id, data) =>
    request(`/trades/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/trades/${id}`, { method: "DELETE" }),
};

// Watchlist
export const watchlistAPI = {
  list: () => request("/watchlist"),
  create: (data) => request("/watchlist", { method: "POST", body: data }),
  update: (id, data) =>
    request(`/watchlist/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/watchlist/${id}`, { method: "DELETE" }),
};

// Gradings
export const gradingsAPI = {
  list: () => request("/gradings"),
  create: (data) => request("/gradings", { method: "POST", body: data }),
  update: (id, data) =>
    request(`/gradings/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/gradings/${id}`, { method: "DELETE" }),
};

// Purchases
export const purchasesAPI = {
  list: () => request("/purchases"),
  create: (data) => request("/purchases", { method: "POST", body: data }),
};

// Settings
export const settingsAPI = {
  get: () => request("/settings"),
  update: (data) => request("/settings", { method: "PUT", body: data }),
};

// Migration - send localStorage data to server
export const migrateAPI = {
  send: (data) => request("/migrate", { method: "POST", body: data }),
};

// Reference data (SCCD)
export const refAPI = {
  leagues: () => request("/ref/leagues"),
  manufacturers: () => request("/ref/manufacturers"),
  teams: (params) => request(`/ref/teams${toQuery(params)}`),
  sets: (params) => request(`/ref/sets${toQuery(params)}`),
  players: (params) => request(`/ref/players${toQuery(params)}`),
  cards: (params) => request(`/ref/cards${toQuery(params)}`),
  parallels: (params) => request(`/ref/parallels${toQuery(params)}`),
};

// Check if backend is available
export async function checkBackend() {
  try {
    const res = await fetch(`${API}/settings`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
