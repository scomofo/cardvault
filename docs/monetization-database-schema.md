# CardVault Monetization Database Schema

CardVault's database should optimize for the seller pipeline:

`scan -> identify -> catalog -> price -> list -> sell -> ship -> track profit`

The schema is intentionally split between:

- Reference catalog tables: `leagues`, `manufacturers`, `teams`, `card_sets`, `players`, `cards`, `parallels`
- Operational seller tables: `user_items`, `intake_batches`, `pricing_snapshots`, `listing_batches`, `listings`, `orders`, `shipments`, `sales`, `profit_events`

## Core operational tables

### `user_items`

Represents a single physical card owned by the seller.

Important fields:

- Identity: `name`, `player_name`, `manufacturer`, `sport`, `team`, `card_set`, `year`, `card_number`, `parallel`
- Intake: `intake_batch_id`, `purchase_id`, `acquisition_date`, `acquisition_source`
- Warehouse: `binder`, `storage_location`
- Pipeline status: `status`, `listing_status`, `sale_status`
- Pricing: `market_price`, `suggested_listing_price`, `min_acceptable_price`, `last_comp_price`, `average_comp_price`, `psa9_price`, `psa10_price`
- Profitability: `cost_basis`, `profit_realized`, `sold_at`
- Grading: `grading_candidate`, `centering`, `corners`, `edges`, `surface`, `projected_grade`, `vault_status`

### `intake_batches`

Tracks batch scan sessions so intake throughput can be measured.

Important fields:

- `source`: manual, camera, import
- `status`: open, processing, completed
- `card_count`
- `started_at`, `completed_at`

### `pricing_snapshots`

Stores time-based pricing pulls from providers such as SportsCardsPro.

Important fields:

- `item_id`
- `source`
- `strategy`
- `last_comp_price`, `average_comp_price`, `raw_price`
- `psa9_price`, `psa10_price`, `graded_spread`
- `suggested_listing_price`, `min_acceptable_price`
- `price_history`
- `observed_at`

This table should be append-only in normal operation so pricing history remains auditable.

### `listing_batches`

Represents bulk listing jobs and exports.

Important fields:

- `platform`
- `status`: draft, exported, failed
- `pricing_strategy`
- `item_count`
- `export_format`, `export_path`
- `created_at`, `exported_at`

### `listings`

Represents a marketplace listing for a single inventory item.

Important fields:

- `card_id`
- `external_listing_id`
- `listing_title`, `listing_description`
- `category_path`, `item_specifics`
- `pricing_strategy`
- `start_price`, `buy_now_price`
- `shipping`, `shipping_weight_oz`
- `status`, `sold_price`, `sold_date`
- `export_batch_id`

### `orders`

Represents a buyer-facing sale event after a listing converts.

Important fields:

- `sale_id`, `listing_id`, `item_id`
- `platform`, `external_order_id`, `buyer_handle`
- `sale_price`, `fees`, `shipping_charge`, `tax_collected`
- `payment_status`
- `fulfillment_status`
- `sold_at`

### `shipments`

Represents fulfillment and tracking after an order is paid.

Important fields:

- `order_id`, `item_id`
- `carrier`, `service_level`, `package_type`
- `label_status`
- `tracking_number`
- `shipping_cost`, `packaging_cost`, `weight_oz`
- `purchased_at`, `shipped_at`, `delivered_at`

### `sales`

Keeps the accounting-friendly sale summary used by the current app.

Important fields:

- `card_id`, `order_id`, `listing_id`
- `sale_price`, `cost_basis`
- `fees`, `shipping_cost`, `packaging_cost`, `grading_cost`
- `tax_collected`, `payout_amount`, `net_profit`
- `platform`, `buyer_handle`, `date`

### `profit_events`

Ledger-style profitability entries that make ROI auditable.

Example event types:

- `purchase`
- `listing_fee`
- `marketplace_fee`
- `shipping_label`
- `packaging`
- `grading_submission`
- `sale_payout`

This table is the safest long-term basis for analytics because it preserves every financial component separately.

## Relationships

- One `intake_batches` record can create many `user_items`
- One `user_items` record can have many `pricing_snapshots`
- One `listing_batches` record can export many `listings`
- One `user_items` record can have many `listings` over time
- One winning `listing` can produce one `order`
- One `order` can produce one shipment in the current workflow
- One `order` can feed one `sales` summary row
- One `user_items` or `order` can have many `profit_events`

## Implementation notes

- Keep adapters for external providers inside `services/pricing/`, `services/metadata/`, and `services/shipping/`
- Treat `pricing_snapshots` as the source of truth for market history
- Treat `profit_events` as the source of truth for analytics and ROI
- Keep `sales` as the fast UI summary until analytics is rebuilt on top of the ledger
- Preserve existing `user_items`, `listings`, and `sales` APIs while the frontend is being refactored

## Next backend steps

1. Create `services/pricing/sportscardspro.js` and write snapshots into `pricing_snapshots`
2. Add a bulk listing generator that creates `listing_batches` plus enriched `listings`
3. Add order-to-shipment routes that promote `orders` into `shipments`
4. Move profit calculations to a shared service that derives `sales.net_profit` from `profit_events`
