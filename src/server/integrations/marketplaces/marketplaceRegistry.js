import { EbayAdapter } from "./ebayAdapter.js";
import { ComcAdapter } from "./comcAdapter.js";
import { ShopifyAdapter } from "./shopifyAdapter.js";

const registry = {
  ebay: new EbayAdapter(),
  comc: new ComcAdapter(),
  shopify: new ShopifyAdapter(),
};

export function getMarketplaceAdapter(marketplace) {
  const adapter = registry[marketplace];
  if (!adapter) {
    throw new Error(`Unsupported marketplace: ${marketplace}`);
  }
  return adapter;
}

export function listSupportedMarketplaces() {
  return Object.keys(registry);
}
