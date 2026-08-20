/**
 * Map CardVault condition to eBay condition ID.
 * @param {string} condition
 * @returns {number}
 */
export function conditionToEbayCode(condition) {
  const map = { MT: 2750, NM: 3000, EX: 4000, VG: 5000, G: 6000, FR: 7000, P: 7000 };
  return map[(condition || "NM").toUpperCase()] || 4000;
}

function esc(str) { return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/**
 * Build Trading API XML for AddItem / AddFixedPriceItem.
 * @param {object} listing
 * @param {object} item
 * @param {{ duration?: string }} [options]
 * @returns {string}
 */
export function listingToTradingXml(listing, item, options = {}) {
  const isAuction = listing.format === "auction";
  const duration = options.duration || (isAuction ? "Days_7" : "GTC");
  const condId = conditionToEbayCode(item.condition);
  const price = listing.start_price || listing.startPrice || 0;
  const shipping = listing.shipping || 4.99;
  const pictureUrls = (options.pictureUrls || []).filter(Boolean);
  const pictureDetails = pictureUrls.length
    ? `\n  <PictureDetails>\n    ${pictureUrls.map((url) => `<PictureURL>${esc(url)}</PictureURL>`).join("\n    ")}\n  </PictureDetails>`
    : "";

  const specifics = [
    item.sport ? `<NameValueList><Name>Sport</Name><Value>${esc(item.sport)}</Value></NameValueList>` : "",
    (item.player_name || item.playerName) ? `<NameValueList><Name>Player/Athlete</Name><Value>${esc(item.player_name || item.playerName)}</Value></NameValueList>` : "",
    item.team ? `<NameValueList><Name>Team</Name><Value>${esc(item.team)}</Value></NameValueList>` : "",
    (item.card_set || item.set) ? `<NameValueList><Name>Set</Name><Value>${esc(item.card_set || item.set)}</Value></NameValueList>` : "",
    (item.card_number || item.number) ? `<NameValueList><Name>Card Number</Name><Value>${esc(item.card_number || item.number)}</Value></NameValueList>` : "",
    item.year ? `<NameValueList><Name>Season</Name><Value>${esc(item.year)}</Value></NameValueList>` : "",
    item.manufacturer ? `<NameValueList><Name>Card Manufacturer</Name><Value>${esc(item.manufacturer)}</Value></NameValueList>` : "",
  ].filter(Boolean).join("\n    ");

  return `<Item>
  <Title>${esc(listing.listing_title || listing.listingTitle || listing.cardName || item.name)}</Title>
  <Description><![CDATA[${listing.listing_description || listing.listingDescription || ""}]]></Description>${pictureDetails}
  <PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>
  <StartPrice>${price}</StartPrice>
  <ConditionID>${condId}</ConditionID>
  <Country>CA</Country>
  <Currency>CAD</Currency>
  <ListingDuration>${duration}</ListingDuration>
  <ListingType>${isAuction ? "Chinese" : "FixedPriceItem"}</ListingType>
  <Quantity>1</Quantity>
  <ItemSpecifics>
    ${specifics}
  </ItemSpecifics>
  <ShippingDetails>
    <ShippingType>Flat</ShippingType>
    <ShippingServiceOptions>
      <ShippingService>CA_StandardInternationalFlat</ShippingService>
      <ShippingServiceCost>${shipping}</ShippingServiceCost>
    </ShippingServiceOptions>
  </ShippingDetails>
  <ReturnPolicy>
    <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
    <RefundOption>MoneyBack</RefundOption>
    <ReturnsWithinOption>Days_30</ReturnsWithinOption>
    <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
  </ReturnPolicy>
  <DispatchTimeMax>3</DispatchTimeMax>
</Item>`;
}

/**
 * Map listing to Inventory API item format.
 * @param {object} listing
 * @param {object} item
 * @returns {object}
 */
export function listingToInventoryItem(listing, item, options = {}) {
  const pictureUrls = (options.pictureUrls || []).filter(Boolean);
  return {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: conditionToEbayCode(item.condition) <= 3000 ? "NEW_OTHER" : "USED_VERY_GOOD",
    product: {
      title: listing.listing_title || listing.listingTitle || listing.cardName || item.name,
      description: listing.listing_description || listing.listingDescription || "",
      ...(pictureUrls.length ? { imageUrls: pictureUrls } : {}),
      aspects: {
        Sport: [item.sport || "Baseball"],
        ...(item.player_name || item.playerName ? { "Player/Athlete": [item.player_name || item.playerName] } : {}),
        ...(item.team ? { Team: [item.team] } : {}),
        ...(item.card_set || item.set ? { Set: [item.card_set || item.set] } : {}),
        ...(item.year ? { Season: [String(item.year)] } : {}),
      },
    },
  };
}

/**
 * Map listing to Offer format.
 * @param {object} listing
 * @param {string} sku
 * @returns {object}
 */
export function listingToOffer(listing, sku) {
  return {
    sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    listingDescription: listing.listing_description || listing.listingDescription || "",
    pricingSummary: { price: { value: String(listing.start_price || listing.startPrice || 0), currency: "CAD" } },
    categoryId: "261328",
    listingPolicies: { fulfillmentPolicyId: "", paymentPolicyId: "", returnPolicyId: "" },
  };
}
