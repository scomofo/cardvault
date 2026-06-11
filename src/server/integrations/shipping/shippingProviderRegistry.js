import { get } from "../../database.js";
import { purchaseConfiguredProviderService } from "./configuredProviderAdapter.js";

const CONFIGURED_PROVIDER_STATUSES = ["configured", "connected", "active"];

function findProviderConnection(provider = "Canada Post") {
  const placeholders = CONFIGURED_PROVIDER_STATUSES.map(() => "?").join(",");
  return get(
    `SELECT *
     FROM shipping_provider_connections
     WHERE lower(provider) = lower(?)
       AND auth_status IN (${placeholders})
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [provider, ...CONFIGURED_PROVIDER_STATUSES],
  );
}

export async function pickShippingProviderService({
  provider = "Canada Post",
  country,
  salePrice,
  weightOz,
  shipmentId,
  packageType,
  destinationPostalCode,
}) {
  const connection = findProviderConnection(provider);
  return purchaseConfiguredProviderService(connection, {
    country,
    salePrice,
    weightOz,
    shipmentId,
    packageType,
    destinationPostalCode,
  });
}
