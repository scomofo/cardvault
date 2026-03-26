const API = "http://localhost:3001/api";

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

// Listings
export const listingsAPI = {
  list: (params) => request(`/listings${toQuery(params)}`),
  create: (data) => request("/listings", { method: "POST", body: data }),
  update: (id, data) =>
    request(`/listings/${id}`, { method: "PUT", body: data }),
  delete: (id) => request(`/listings/${id}`, { method: "DELETE" }),
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
