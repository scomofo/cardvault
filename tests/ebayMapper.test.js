import test from "node:test";
import assert from "node:assert/strict";

import { listingToInventoryItem, listingToTradingXml } from "../src/server/integrations/ebay/ebayMapper.js";

const LISTING = { listing_title: "1980 OPC Gretzky #120", start_price: 59.99, format: "fixed" };
const ITEM = { condition: "NM", card_set: "O-Pee-Chee", card_number: "120" };

test("trading XML includes PictureDetails when picture urls are provided", () => {
  const xml = listingToTradingXml(LISTING, ITEM, {
    pictureUrls: ["https://i.ebayimg.com/a.jpg", "https://i.ebayimg.com/b.jpg", null],
  });
  assert.match(xml, /<PictureDetails>/);
  assert.match(xml, /<PictureURL>https:\/\/i\.ebayimg\.com\/a\.jpg<\/PictureURL>/);
  assert.match(xml, /<PictureURL>https:\/\/i\.ebayimg\.com\/b\.jpg<\/PictureURL>/);
});

test("trading XML omits PictureDetails without pictures", () => {
  assert.doesNotMatch(listingToTradingXml(LISTING, ITEM), /<PictureDetails>/);
  assert.doesNotMatch(listingToTradingXml(LISTING, ITEM, { pictureUrls: [] }), /<PictureDetails>/);
});

test("inventory item carries imageUrls when pictures are provided", () => {
  const withPictures = listingToInventoryItem(LISTING, ITEM, {
    pictureUrls: ["https://i.ebayimg.com/a.jpg"],
  });
  assert.deepEqual(withPictures.product.imageUrls, ["https://i.ebayimg.com/a.jpg"]);

  const withoutPictures = listingToInventoryItem(LISTING, ITEM);
  assert.equal("imageUrls" in withoutPictures.product, false);
});
