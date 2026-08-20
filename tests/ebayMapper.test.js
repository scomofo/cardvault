import test from "node:test";
import assert from "node:assert/strict";
import {
  conditionToEbayCode,
  listingToTradingXml,
  listingToInventoryItem,
  listingToOffer,
} from "../src/server/integrations/ebay/ebayMapper.js";

test("conditionToEbayCode maps grades case-insensitively with defaults", () => {
  assert.equal(conditionToEbayCode("MT"), 2750);
  assert.equal(conditionToEbayCode("nm"), 3000);
  assert.equal(conditionToEbayCode("P"), 7000);
  assert.equal(conditionToEbayCode("ZZ"), 4000);
  assert.equal(conditionToEbayCode(undefined), 3000);
});

test("listingToTradingXml builds fixed-price XML with escaped specifics", () => {
  const xml = listingToTradingXml(
    {
      listing_title: "Cards & <Stuff>",
      listing_description: "A clean copy",
      start_price: 12.5,
      shipping: 6,
    },
    {
      condition: "NM",
      sport: "Hockey",
      player_name: "Guy Lafleur",
      team: "Canadiens",
      card_set: "O-Pee-Chee",
      card_number: "90",
      year: 1979,
      manufacturer: "OPC",
    },
  );

  assert.match(xml, /<Title>Cards &amp; &lt;Stuff&gt;<\/Title>/);
  assert.match(xml, /<ConditionID>3000<\/ConditionID>/);
  assert.match(xml, /<StartPrice>12.5<\/StartPrice>/);
  assert.match(xml, /<ListingType>FixedPriceItem<\/ListingType>/);
  assert.match(xml, /<ListingDuration>GTC<\/ListingDuration>/);
  assert.match(xml, /<ShippingServiceCost>6<\/ShippingServiceCost>/);
  for (const specific of [
    ["Sport", "Hockey"],
    ["Player\\/Athlete", "Guy Lafleur"],
    ["Team", "Canadiens"],
    ["Set", "O-Pee-Chee"],
    ["Card Number", "90"],
    ["Season", "1979"],
    ["Card Manufacturer", "OPC"],
  ]) {
    assert.match(xml, new RegExp(`<Name>${specific[0]}</Name><Value>${specific[1]}</Value>`));
  }
});

test("listingToTradingXml supports auctions and duration overrides", () => {
  const auction = listingToTradingXml({ format: "auction" }, {});
  assert.match(auction, /<ListingType>Chinese<\/ListingType>/);
  assert.match(auction, /<ListingDuration>Days_7<\/ListingDuration>/);

  const custom = listingToTradingXml({ format: "auction" }, {}, { duration: "Days_5" });
  assert.match(custom, /<ListingDuration>Days_5<\/ListingDuration>/);
});

test("listingToTradingXml falls back to camelCase fields and defaults", () => {
  const xml = listingToTradingXml(
    { listingTitle: "Camel Title", startPrice: 9 },
    { name: "Item Name" },
  );
  assert.match(xml, /<Title>Camel Title<\/Title>/);
  assert.match(xml, /<StartPrice>9<\/StartPrice>/);
  assert.match(xml, /<ShippingServiceCost>4.99<\/ShippingServiceCost>/);

  const bare = listingToTradingXml({}, { name: "Item Name" });
  assert.match(bare, /<Title>Item Name<\/Title>/);
  assert.match(bare, /<StartPrice>0<\/StartPrice>/);
  assert.doesNotMatch(bare, /<NameValueList>/);
});

test("listingToInventoryItem maps condition and aspects", () => {
  const nearMint = listingToInventoryItem(
    { listing_title: "Inv Title", listing_description: "Inv Desc" },
    { condition: "NM", player_name: "Player One", team: "Team A", card_set: "Set B", year: 2020 },
  );
  assert.equal(nearMint.condition, "NEW_OTHER");
  assert.equal(nearMint.product.title, "Inv Title");
  assert.deepEqual(nearMint.product.aspects["Player/Athlete"], ["Player One"]);
  assert.deepEqual(nearMint.product.aspects.Team, ["Team A"]);
  assert.deepEqual(nearMint.product.aspects.Set, ["Set B"]);
  assert.deepEqual(nearMint.product.aspects.Season, ["2020"]);

  const played = listingToInventoryItem({}, { condition: "EX", name: "Fallback" });
  assert.equal(played.condition, "USED_VERY_GOOD");
  assert.equal(played.product.title, "Fallback");
  assert.deepEqual(played.product.aspects.Sport, ["Baseball"]);
  assert.equal(played.product.aspects.Team, undefined);
});

test("listingToOffer formats pricing and defaults", () => {
  const offer = listingToOffer({ start_price: 25, listing_description: "Offer Desc" }, "sku-1");
  assert.equal(offer.sku, "sku-1");
  assert.equal(offer.format, "FIXED_PRICE");
  assert.deepEqual(offer.pricingSummary.price, { value: "25", currency: "CAD" });
  assert.equal(offer.listingDescription, "Offer Desc");

  const empty = listingToOffer({}, "sku-2");
  assert.equal(empty.pricingSummary.price.value, "0");
  assert.equal(empty.listingDescription, "");
});
